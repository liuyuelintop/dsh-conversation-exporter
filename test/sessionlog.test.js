/**
 * Structural safety tests for the parser and extractor (fail-loud behavior).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSessionLog, SessionFormatError } from '../src/lib/sessionlog.js';
import { extractConversation } from '../src/lib/extract.js';
import { renderConversation } from '../src/lib/render.js';

const HEADER = '{"type":"session","version":0,"id":"s1","createdAt":1}\n';
const TURN_START = '{"type":"turn/start","seq":0,"time":1,"data":{"turn":1}}\n';
const TURN_END = (seq) =>
  `{"type":"turn/end","seq":${seq},"time":2,"data":{"turn":1,"reason":{"kind":"completed"}}}\n`;
const USER = (seq) =>
  `{"type":"user/message","seq":${seq},"time":1,"data":{"id":"u","role":"user","content":[{"type":"text","text":"hello"}],"source":{"kind":"user"}},"surfaceOp":"append"}\n`;
const ASSISTANT = (seq, text) =>
  `{"type":"assistant/message","seq":${seq},"time":1,"data":{"turn":1,"step":1,"message":{"id":"a","role":"assistant","content":[{"type":"text","text":${JSON.stringify(text)}}],"source":{"kind":"model","provider":"p","model":"m"}}},"surfaceOp":"append"}\n`;

test('foreign format version is refused before anything else', () => {
  assert.throws(
    () => parseSessionLog('{"type":"session","version":99,"id":"s1"}\n{"type":"turn/start"}\n'),
    /unsupported session format version/,
  );
});

test('a missing or non-session header line is refused', () => {
  assert.throws(() => parseSessionLog('{"type":"turn/start","seq":0,"time":1,"data":{"turn":1}}\n'), /not a session header/);
  assert.throws(() => parseSessionLog('not json\n'), /not valid JSON/);
});

test('event seq discontinuity is refused', () => {
  const text = HEADER + TURN_START + '{"type":"turn/end","seq":2,"time":2,"data":{"turn":1}}\n';
  assert.throws(() => parseSessionLog(text), /seq discontinuity/);
});

test('chunk-row seq misalignment and malformed rows are refused', () => {
  const badSeq = HEADER + TURN_START + '{"type":"text-chunks","seq0":5,"time0":1,"data":{"turn":1,"step":1,"index":0,"dt":[],"texts":["x"]}}\n';
  assert.throws(() => parseSessionLog(badSeq), /seq discontinuity/);
  const malformed = HEADER + TURN_START + '{"type":"text-chunks","seq0":1,"time0":1,"data":{"turn":1,"step":1}}\n';
  assert.throws(() => parseSessionLog(malformed), /no member array/);
});

test('empty lines inside the log are refused', () => {
  assert.throws(() => parseSessionLog(HEADER + TURN_START + '\n' + TURN_END(1)), /empty line inside/);
});

test('chunk rows are skipped and keep seq accounting exact', () => {
  const text =
    HEADER +
    TURN_START +
    '{"type":"text-chunks","seq0":1,"time0":1,"data":{"turn":1,"step":1,"index":0,"dt":[1],"texts":["a","b"]}}\n' +
    TURN_END(3);
  const { events, stats } = parseSessionLog(text);
  assert.equal(stats.chunkRows, 1);
  assert.deepEqual(events.map((e) => e.type), ['turn/start', 'turn/end']);
});

test('CRLF line endings are tolerated', () => {
  const lf = parseSessionLog(HEADER + TURN_START + TURN_END(1));
  const crlf = parseSessionLog((HEADER + TURN_START + TURN_END(1)).replaceAll('\n', '\r\n'));
  assert.deepEqual(crlf.events.map((e) => e.type), lf.events.map((e) => e.type));
});

test('an unknown event type claiming surface membership fails loud', () => {
  const events = [
    { type: 'turn/start', seq: 0, time: 1, data: { turn: 1 } },
    { type: 'plugin/message', seq: 1, time: 2, data: {}, surfaceOp: 'append' },
  ];
  assert.throws(() => extractConversation(events), /unrecognized surface event type/);
});

test('a surface event outside any turn bracket fails loud', () => {
  const events = [
    {
      type: 'user/message',
      seq: 0,
      time: 1,
      data: { id: 'u', role: 'user', content: [{ type: 'text', text: 'hi' }], source: { kind: 'user' } },
      surfaceOp: 'append',
    },
  ];
  assert.throws(() => extractConversation(events), /outside any turn bracket/);
});

test('nested or unmatched turn brackets fail loud', () => {
  const nested = [
    { type: 'turn/start', seq: 0, time: 1, data: { turn: 1 } },
    { type: 'turn/start', seq: 1, time: 2, data: { turn: 2 } },
  ];
  assert.throws(() => extractConversation(nested), /still open/);
  const unmatched = [{ type: 'turn/end', seq: 0, time: 1, data: { turn: 1 } }];
  assert.throws(() => extractConversation(unmatched), /without an open turn/);
  const mismatch = [
    { type: 'turn/start', seq: 0, time: 1, data: { turn: 1 } },
    { type: 'turn/end', seq: 1, time: 2, data: { turn: 2 } },
  ];
  assert.throws(() => extractConversation(mismatch), /closes turn 1/);
});

test('a whitespace-only assistant message is not a final response', () => {
  const text = HEADER + TURN_START + USER(1) + ASSISTANT(2, '   ') + TURN_END(3);
  const { events } = parseSessionLog(text);
  const { entries } = extractConversation(events);
  const markdown = renderConversation(entries);
  assert.ok(markdown.includes('> Response incomplete.'));
  assert.ok(!markdown.includes('## Assistant'));
});
