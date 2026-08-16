/**
 * Public pipeline entry point.
 *
 *   exportConversation(logText) -> { markdown, header, stats }
 *
 * logText is the official DSH session-log JSONL artifact text (decompress
 * `.jsonl.zstd` first; the CLI does this transparently). The JSONL/CLI path is
 * the TEST/DEBUG path; the production read path feeds the same extract/render
 * core from `sessionQuery.readSession` (see docs/ARCHITECTURE.md).
 */

import { parseSessionLog } from './lib/sessionlog.js';
import { extractConversation } from './lib/extract.js';
import { renderConversation } from './lib/render.js';

export { SessionFormatError } from './lib/sessionlog.js';

/**
 * Locked download filename convention (mirrors the official export's
 * path-segment sanitization): `dsh-conversation-<session-id>.md`.
 * @param {unknown} sessionId
 * @returns {string}
 */
export function markdownFilename(sessionId) {
  return `dsh-conversation-${String(sessionId).replace(/[^A-Za-z0-9_-]/g, '_')}.md`;
}

export function exportConversation(logText) {
  const { header, events, stats: parseStats } = parseSessionLog(logText);
  const { entries, stats: extractStats } = extractConversation(events);
  const markdown = renderConversation(entries);
  return { markdown, header, stats: { ...parseStats, ...extractStats } };
}
