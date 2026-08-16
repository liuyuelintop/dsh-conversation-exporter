/** Deterministic tests for the DSH host production integration boundary. */

import { Readable } from 'node:stream';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSessionLog } from '../src/lib/sessionlog.js';
import {
  CONVERSATION_EXPORT_PATH,
  MAX_EXPORT_REQUEST_BYTES,
  createConversationExportHandler,
  exportSessionSnapshot,
  isTrustedExportRequest,
} from '../src/lib/production.js';
import { fixture, golden } from './helpers.js';

class CaptureResponse {
  status = undefined;
  headers = undefined;
  body = undefined;

  writeHead(status, headers) {
    this.status = status;
    this.headers = headers;
  }

  end(body = '') {
    this.body = String(body);
  }
}

function request({
  method = 'POST',
  body = JSON.stringify({ sessionId: 'session-test-a' }),
  headers = {
    host: '127.0.0.1:3080',
    origin: 'http://127.0.0.1:3080',
    'content-type': 'application/json',
    'sec-fetch-site': 'same-origin',
  },
} = {}) {
  const stream = Readable.from([body]);
  stream.method = method;
  stream.headers = headers;
  return stream;
}

function snapshot(name) {
  const { header, events } = parseSessionLog(fixture(name));
  return { session: header, events };
}

test('production snapshot path preserves accepted normal, image-only, and incomplete behavior', () => {
  for (const [fixtureName, goldenName] of [
    ['a-normal-chat.jsonl', 'a-normal-chat.md'],
    ['h-image-only.jsonl', 'h-image-only.md'],
    ['f-interrupted.jsonl', 'f-interrupted.md'],
  ]) {
    const value = snapshot(fixtureName);
    const exported = exportSessionSnapshot(value.session.id, value);
    assert.equal(exported.markdown, golden(goldenName));
    assert.equal(exported.filename, `dsh-conversation-${value.session.id}.md`);
  }
});

test('production snapshot refuses a mismatched or malformed sessionQuery result', () => {
  const value = snapshot('a-normal-chat.jsonl');
  assert.throws(() => exportSessionSnapshot('another-session', value), /different session/);
  assert.throws(() => exportSessionSnapshot(value.session.id, { session: value.session }), /no event array/);
  assert.throws(() => exportSessionSnapshot(value.session.id, null), /no snapshot object/);
});

test('host route executes sessionQuery.readSession -> extract -> render and returns Markdown', async () => {
  const calls = [];
  const handler = createConversationExportHandler({
    readSession: async (sessionId) => {
      calls.push(sessionId);
      return snapshot('a-normal-chat.jsonl');
    },
  });
  const response = new CaptureResponse();
  await handler(request(), response);

  assert.equal(CONVERSATION_EXPORT_PATH, '/api/conversation.export');
  assert.deepEqual(calls, ['session-test-a']);
  assert.equal(response.status, 200);
  assert.equal(response.headers['Cache-Control'], 'no-store');
  assert.equal(response.headers['Content-Type'], 'text/markdown; charset=utf-8');
  assert.equal(
    response.headers['Content-Disposition'],
    'attachment; filename="dsh-conversation-session-test-a.md"',
  );
  assert.equal(response.body, golden('a-normal-chat.md'));
});

test('host route enforces method, JSON media type, request shape, and bounded body', async () => {
  let reads = 0;
  const handler = createConversationExportHandler({
    readSession: async () => {
      reads++;
      return snapshot('a-normal-chat.jsonl');
    },
  });

  const cases = [
    [request({ method: 'GET' }), 405],
    [request({ headers: { host: '127.0.0.1:3080', 'content-type': 'text/plain' } }), 415],
    [request({ body: 'not json' }), 400],
    [request({ body: '{}' }), 400],
    [request({ body: 'x'.repeat(MAX_EXPORT_REQUEST_BYTES + 1) }), 413],
  ];
  for (const [incoming, status] of cases) {
    const response = new CaptureResponse();
    await handler(incoming, response);
    assert.equal(response.status, status);
    assert.equal(response.headers['Cache-Control'], 'no-store');
  }
  assert.equal(reads, 0);
});

test('host route reports operational failures without leaking their details', async () => {
  const seen = [];
  const handler = createConversationExportHandler({
    readSession: async () => {
      throw new Error('private path /Users/example/session.jsonl');
    },
    onError: (error) => seen.push(error),
  });
  const response = new CaptureResponse();
  await handler(request(), response);
  assert.equal(response.status, 500);
  assert.equal(response.body, 'conversation export failed');
  assert.ok(!response.body.includes('/Users/example'));
  assert.equal(seen.length, 1);
});

test('route trust boundary matches loopback, configured host, Origin, and Fetch-Metadata rules', () => {
  assert.equal(isTrustedExportRequest(request(), []), true);
  assert.equal(isTrustedExportRequest(request({ headers: { host: 'localhost:3080' } }), []), true);
  assert.equal(
    isTrustedExportRequest(request({ headers: { host: '192.168.1.8:3080' } }), ['192.168.1.8']),
    true,
  );
  assert.equal(isTrustedExportRequest(request({ headers: { host: 'attacker.example:3080' } }), []), false);
  assert.equal(
    isTrustedExportRequest(request({
      headers: {
        host: '127.0.0.1:3080',
        origin: 'https://attacker.example',
      },
    }), []),
    false,
  );
  assert.equal(
    isTrustedExportRequest(request({
      headers: {
        host: '127.0.0.1:3080',
        'sec-fetch-site': 'cross-site',
      },
    }), []),
    false,
  );
});
