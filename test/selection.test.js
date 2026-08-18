/** Deterministic V0.3 tests for canonical turn selection and preview privacy. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSessionLog } from '../src/lib/sessionlog.js';
import {
  MAX_TURN_PREVIEW_CHARACTERS,
  exportSessionSnapshot,
  listSessionTurnPreviews,
  selectConversationEntries,
} from '../src/lib/production.js';
import { fixture, golden } from './helpers.js';

function snapshot(name) {
  const { header, events } = parseSessionLog(fixture(name));
  return { session: header, events };
}

test('one turn can be selected and unselected turns never render', () => {
  const value = snapshot('a-normal-chat.jsonl');
  const first = exportSessionSnapshot(value.session.id, value, { include: [0], count: 2 });
  assert.match(first.markdown, /Hello, what is 2\+2\?/u);
  assert.match(first.markdown, /2 \+ 2 is \*\*4\*\*\./u);
  assert.ok(!first.markdown.includes('What about 3+3?'));
  assert.ok(!first.markdown.includes('3 + 3 is 6.'));

  const second = exportSessionSnapshot(value.session.id, value, { exclude: [0], count: 2 });
  assert.ok(!second.markdown.includes('Hello, what is 2+2?'));
  assert.ok(!second.markdown.includes('2 + 2 is **4**.'));
  assert.match(second.markdown, /What about 3\+3\?/u);
  assert.match(second.markdown, /3 \+ 3 is 6\./u);
});

test('multiple selected turns always retain canonical chronological order', () => {
  const value = snapshot('a-normal-chat.jsonl');
  const exported = exportSessionSnapshot(value.session.id, value, { include: [1, 0], count: 2 });
  assert.equal(exported.markdown, golden('a-normal-chat.md'));
  assert.deepEqual(exported.entries.map((entry) => entry.turn), [1, 2]);
});

test('selected export reuses title, filename, Markdown, fence, table, code, and CJK rendering', () => {
  const value = snapshot('j-unterminated-fence.jsonl');
  const full = exportSessionSnapshot(value.session.id, value);
  const first = exportSessionSnapshot(value.session.id, value, { include: [0], count: 2 });
  const second = exportSessionSnapshot(value.session.id, value, { include: [1], count: 2 });

  assert.equal(first.title, full.title);
  assert.equal(first.filename, full.filename);
  assert.match(first.markdown, /^# Markdown Fence Recovery\n/u);
  assert.match(first.markdown, /```ts\nconst preview = true;\n```/u);
  assert.ok(!first.markdown.includes('Can we continue outside the code block?'));

  assert.equal(second.filename, full.filename);
  assert.ok(!second.markdown.includes('Show the preview code.'));
  assert.match(second.markdown, /\| 状态 \| Value \|/u);
  assert.match(second.markdown, /`true`/u);
  assert.match(second.markdown, /正常/u);

  const mermaid = snapshot('i-readable-title.jsonl');
  assert.equal(
    exportSessionSnapshot(mermaid.session.id, mermaid, { include: [0], count: 1 }).markdown,
    golden('i-readable-title.md'),
  );
});

test('image-only and incomplete turns remain canonical when selected', () => {
  for (const name of ['h-image-only.jsonl', 'f-interrupted.jsonl']) {
    const value = snapshot(name);
    const full = exportSessionSnapshot(value.session.id, value);
    const selected = exportSessionSnapshot(value.session.id, value, {
      include: [0],
      count: full.entries.length,
    });
    assert.deepEqual(selected.entries[0], full.entries[0]);
  }
  const image = snapshot('h-image-only.jsonl');
  assert.match(
    exportSessionSnapshot(image.session.id, image, { include: [0], count: 1 }).markdown,
    /\[Image omitted\]/u,
  );
  const incomplete = snapshot('f-interrupted.jsonl');
  const markdown = exportSessionSnapshot(incomplete.session.id, incomplete, { include: [0], count: 2 }).markdown;
  assert.match(markdown, /> Response incomplete\./u);
  assert.ok(!markdown.includes('> **Assistant**'));
});

test('zero, duplicate, malformed, and out-of-range selections are refused', () => {
  const entries = [{ turn: 1 }, { turn: 2 }];
  assert.throws(() => selectConversationEntries(entries, { include: [], count: 2 }), /select at least one/u);
  assert.throws(() => selectConversationEntries(entries, { exclude: [0, 1], count: 2 }), /select at least one/u);
  assert.throws(() => selectConversationEntries(entries, { include: [0, 0], count: 2 }), /duplicate/u);
  assert.throws(() => selectConversationEntries(entries, { include: [2], count: 2 }), /out-of-range/u);
  assert.throws(() => selectConversationEntries(entries, { include: ['0'], count: 2 }), /out-of-range/u);
  assert.throws(() => selectConversationEntries(entries, { include: [0], exclude: [], count: 2 }), /exactly one/u);
  assert.throws(() => selectConversationEntries(entries, {}), /exactly one/u);
  assert.throws(() => selectConversationEntries(entries, { include: [0] }), /turns changed/u);
  assert.throws(() => selectConversationEntries(entries, { include: [0], count: 3 }), /turns changed/u);
  assert.throws(() => selectConversationEntries(entries, { bits: 'not base64', count: 2 }), /invalid bitset/u);
  assert.throws(() => selectConversationEntries(entries, { bits: '/w==', count: 2 }), /invalid bitset/u);
});

test('compact bitset selections preserve canonical order', () => {
  const entries = Array.from({ length: 10 }, (_unused, turn) => ({ turn }));
  const bits = Buffer.from([0b00010101, 0b00000001]).toString('base64');
  assert.deepEqual(
    selectConversationEntries(entries, { bits, count: entries.length }).map((entry) => entry.turn),
    [0, 2, 4, 8],
  );
});

test('selector previews expose only bounded canonical text and opaque indexes', () => {
  for (const [name, forbidden] of [
    ['b-injected.jsonl', ['approval policy', 'SYSTEM PROMPT', 'Available skills', 'goal continuation', 'CRON', '/Users/example']],
    ['c-multistep.jsonl', ['Let me inspect', 'REASONING SECRET', 'read_file', 'FILE CONTENT', 'ING STREAM']],
  ]) {
    const value = snapshot(name);
    const result = listSessionTurnPreviews(value.session.id, value);
    const serialized = JSON.stringify(result);
    for (const secret of forbidden) assert.ok(!serialized.includes(secret), `preview leaked ${secret}`);
    for (const turn of result.turns) {
      assert.deepEqual(Object.keys(turn), ['index', 'human', 'assistant']);
      assert.ok(Array.from(turn.human).length <= MAX_TURN_PREVIEW_CHARACTERS);
      if (turn.assistant !== null) {
        assert.ok(Array.from(turn.assistant).length <= MAX_TURN_PREVIEW_CHARACTERS);
      }
    }
  }
});

test('selector preview truncation is Unicode-safe and long all-selected conversations stay compact', () => {
  const value = snapshot('a-normal-chat.jsonl');
  const human = value.events.find((event) => event.type === 'user/message');
  human.data.content[0].text = '界'.repeat(MAX_TURN_PREVIEW_CHARACTERS + 20);
  const result = listSessionTurnPreviews(value.session.id, value);
  assert.equal(Array.from(result.turns[0].human).length, MAX_TURN_PREVIEW_CHARACTERS);
  assert.ok(result.turns[0].human.endsWith('…'));

  const entries = Array.from({ length: 5000 }, (_unused, turn) => ({ turn, humans: ['x'], assistant: 'y' }));
  assert.equal(selectConversationEntries(entries, { exclude: [], count: 5000 }).length, 5000);
  assert.ok(JSON.stringify({ selection: { exclude: [], count: 5000 } }).length < 100);
});
