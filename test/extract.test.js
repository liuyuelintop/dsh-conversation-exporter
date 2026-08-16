/**
 * Acceptance cases A–G (see docs/ACCEPTANCE.md).
 * Exact golden comparison plus per-case forbidden-content and stats assertions.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportConversation, markdownFilename } from '../src/index.js';
import { fixture, golden } from './helpers.js';

const cases = [
  {
    name: 'A — normal user → assistant chat',
    fixture: 'a-normal-chat.jsonl',
    golden: 'a-normal-chat.md',
    forbidden: [],
    stats: { turns: 2, humanTurns: 2, humanMessages: 2, finalAssistants: 2, injectedUserMessages: 0 },
  },
  {
    name: 'B — plugin/goal/skill-catalog injections and injection-only turn',
    fixture: 'b-injected.jsonl',
    golden: 'b-injected.md',
    forbidden: [
      '/Users/example',
      'approval policy',
      'SYSTEM PROMPT',
      'Available skills',
      'goal continuation',
      'CRON',
      'Backup acknowledged',
    ],
    stats: { turns: 2, humanTurns: 1, humanMessages: 1, injectedUserMessages: 5, finalAssistants: 1 },
  },
  {
    name: 'C — multi-step agent turn (intermediate text, tools, reasoning, chunk row)',
    fixture: 'c-multistep.jsonl',
    golden: 'c-multistep.md',
    forbidden: ['Let me inspect', 'REASONING SECRET', 'read_file', 'FILE CONTENT', 'ING STREAM'],
    stats: {
      humanTurns: 1,
      finalAssistants: 1,
      assistantMessages: 2,
      reasoningBlocks: 2,
      toolCallBlocks: 1,
      toolResults: 1,
      chunkRows: 1,
    },
  },
  {
    name: 'D — markdown and fenced code blocks preserved',
    fixture: 'd-markdown.jsonl',
    golden: 'd-markdown.md',
    forbidden: [],
    stats: { humanTurns: 1, humanMessages: 1, finalAssistants: 1 },
  },
  {
    name: 'E — Chinese / Unicode preserved',
    fixture: 'e-unicode.jsonl',
    golden: 'e-unicode.md',
    forbidden: [],
    stats: { humanTurns: 1, humanMessages: 1, finalAssistants: 1 },
  },
  {
    name: 'F — interrupted (aborted) and incomplete (open at EOF) turns',
    fixture: 'f-interrupted.jsonl',
    golden: 'f-interrupted.md',
    forbidden: ['## Assistant'],
    stats: { turns: 2, humanTurns: 2, humanMessages: 2, finalAssistants: 0 },
  },
  {
    name: 'G — image block, surface replacement, unknown log-only events',
    fixture: 'g-extras.jsonl',
    golden: 'g-extras.md',
    forbidden: ['img-1', 'SHADOW REPLACEMENT'],
    stats: {
      humanTurns: 2,
      humanMessages: 2,
      finalAssistants: 2,
      imageBlocks: 1,
      replacements: 1,
      unknownEvents: 2,
    },
  },
  {
    name: 'H — image-only human turn keeps a Human section',
    fixture: 'h-image-only.jsonl',
    golden: 'h-image-only.md',
    forbidden: ['img-only-1'],
    stats: { humanTurns: 1, humanMessages: 1, finalAssistants: 1, imageBlocks: 1 },
  },
];

for (const c of cases) {
  test(`case ${c.name}`, () => {
    const { markdown, stats } = exportConversation(fixture(c.fixture));
    assert.equal(markdown, golden(c.golden), `golden mismatch for ${c.fixture}`);
    for (const f of c.forbidden) {
      assert.ok(!markdown.includes(f), `forbidden content leaked into export: ${JSON.stringify(f)}`);
    }
    for (const [key, expected] of Object.entries(c.stats)) {
      assert.equal(stats[key], expected, `stats.${key} for ${c.fixture}`);
    }
  });
}

test('locked download filename convention', () => {
  assert.equal(
    markdownFilename('session-13040a78-d192-4aec-992c-723f9bae3edc'),
    'dsh-conversation-session-13040a78-d192-4aec-992c-723f9bae3edc.md',
  );
  assert.equal(markdownFilename('a/b c'), 'dsh-conversation-a_b_c.md');
});
