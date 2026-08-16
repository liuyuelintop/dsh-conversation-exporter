/**
 * Extract the clean conversation from raw session events.
 *
 * Deterministic rules (all verified against installed DSH source; see
 * docs/ARCHITECTURE.md):
 *  1. A human turn is a turn bracket containing >= 1 append-origin
 *     `user/message` whose `source.kind === 'user'`. Plugin/goal/skill-catalog
 *     injections and injection-only turns are excluded.
 *  2. The final assistant response of a turn is the last append-origin
 *     `assistant/message` in its bracket with non-empty visible text.
 *     Intermediate steps never render.
 *  3. Only `text` content blocks render, verbatim. `reasoning`, `tool-call`,
 *     `tool-result`, and `image` blocks are skipped and counted. A human
 *     message with no visible text (e.g. image-only) renders the neutral
 *     placeholder `[Image omitted]` so the turn never silently becomes
 *     Assistant-only.
 *  4. A turn without a final assistant response renders NO assistant section;
 *     the renderer appends the neutral marker `> Response incomplete.`
 *     after the human message instead.
 *  5. Replacement-origin surface events (compaction) are model-only shadowing
 *     and are skipped; append-origin events are the durable transcript source.
 *  6. Unknown non-surface event types are log-only and skipped; an unknown type
 *     claiming surface membership fails loud (we would otherwise silently drop
 *     a message we cannot interpret).
 */

import { SessionFormatError } from './sessionlog.js';

const SURFACE_TYPES = new Set(['user/message', 'assistant/message', 'tool/result']);

const KNOWN_LOG_ONLY_TYPES = new Set([
  'step/start',
  'step/end',
  'assistant/chunk',
  'tool/call',
  'todo/write',
  'request/header',
  'request/context',
  'session/end-seed',
]);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Neutral placeholder for a human message with no visible text (e.g. image-only). */
const IMAGE_OMITTED_PLACEHOLDER = '[Image omitted]';

/** Join the visible text blocks of a message's content, counting skipped blocks. */
function textOf(content, stats) {
  if (!Array.isArray(content)) return '';
  const parts = [];
  for (const block of content) {
    if (!isRecord(block) || typeof block.type !== 'string') {
      stats.unknownBlocks++;
      continue;
    }
    if (block.type === 'text') {
      if (typeof block.text === 'string' && block.text.trim() !== '') parts.push(block.text);
    } else if (block.type === 'reasoning') stats.reasoningBlocks++;
    else if (block.type === 'tool-call') stats.toolCallBlocks++;
    else if (block.type === 'tool-result') stats.toolResultBlocks++;
    else if (block.type === 'image') stats.imageBlocks++;
    else stats.unknownBlocks++;
  }
  return parts.join('\n\n');
}

/**
 * @param {object[]} events - raw session events in seq order.
 * @returns {{entries: object[], stats: object}}
 * @throws {SessionFormatError} on structurally unsafe logs.
 */
export function extractConversation(events) {
  const stats = {
    turns: 0,
    humanTurns: 0,
    humanMessages: 0,
    injectedUserMessages: 0,
    assistantMessages: 0,
    finalAssistants: 0,
    toolResults: 0,
    replacements: 0,
    reasoningBlocks: 0,
    toolCallBlocks: 0,
    toolResultBlocks: 0,
    imageBlocks: 0,
    unknownBlocks: 0,
    unknownEvents: 0,
  };

  const turns = [];
  let current = null;

  for (const event of events) {
    const type = event.type;

    if (type === 'turn/start') {
      if (current !== null) {
        throw new SessionFormatError(
          `turn/start for turn ${JSON.stringify(event.data?.turn)} while turn ${current.turn} is still open`,
        );
      }
      current = { turn: event.data?.turn, endReason: null, humanCount: 0, humans: [], assistants: [] };
      turns.push(current);
      stats.turns++;
      continue;
    }

    if (type === 'turn/end') {
      if (current === null) throw new SessionFormatError('turn/end without an open turn');
      if (current.turn !== event.data?.turn) {
        throw new SessionFormatError(
          `turn/end for turn ${JSON.stringify(event.data?.turn)} closes turn ${current.turn}`,
        );
      }
      current.endReason = isRecord(event.data?.reason) ? event.data.reason : null;
      current = null;
      continue;
    }

    if (event.surfaceOp !== undefined) {
      if (!SURFACE_TYPES.has(type)) {
        throw new SessionFormatError(
          `unrecognized surface event type "${type}" (seq ${event.seq}) — refusing to drop a message we cannot interpret`,
        );
      }
      if (current === null) {
        throw new SessionFormatError(`surface event "${type}" (seq ${event.seq}) outside any turn bracket`);
      }
      if (event.surfaceOp !== 'append') {
        stats.replacements++;
        continue; // replacement copies are model-only shadowing, not transcript material
      }
      if (type === 'user/message') {
        const message = event.data;
        if (isRecord(message?.source) && message.source.kind === 'user') {
          current.humanCount++;
          const text = textOf(message.content, stats);
          current.humans.push(text !== '' ? text : IMAGE_OMITTED_PLACEHOLDER);
          stats.humanMessages++;
        } else {
          stats.injectedUserMessages++;
        }
      } else if (type === 'assistant/message') {
        stats.assistantMessages++;
        const text = textOf(event.data?.message?.content, stats);
        if (text !== '') current.assistants.push({ seq: event.seq, text });
      } else if (type === 'tool/result') {
        stats.toolResults++;
      }
      continue;
    }

    if (type === 'turn/start' || type === 'turn/end' || KNOWN_LOG_ONLY_TYPES.has(type)) continue;
    stats.unknownEvents++;
  }

  // An open tail turn (EOF before its turn/end) is legal: live sessions look
  // exactly like this. It renders with the neutral incomplete marker.
  const entries = [];
  for (const turn of turns) {
    if (turn.humanCount === 0) continue; // injection-only turns are not conversation
    stats.humanTurns++;
    const entry = { turn: turn.turn, humans: turn.humans };
    if (turn.assistants.length > 0) {
      entry.assistant = turn.assistants[turn.assistants.length - 1].text;
      stats.finalAssistants++;
    } else {
      entry.assistant = null; // no synthesized assistant response; renderer adds the marker
    }
    entries.push(entry);
  }

  return { entries, stats };
}
