/** Deterministic tests for the DSH host production integration boundary. */

import { Readable } from 'node:stream';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSessionLog } from '../src/lib/sessionlog.js';
import {
  CONVERSATION_EXPORT_PATH,
  CONVERSATION_TURNS_PATH,
  MAX_EXPORT_REQUEST_BYTES,
  createConversationExportHandler,
  createConversationTurnsHandler,
  exportSessionSnapshot,
  isTrustedExportRequest,
} from '../src/lib/production.js';
import { fixture, golden } from './helpers.js';
import { markdownFilename } from '../src/lib/filename.js';

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
    assert.equal(exported.filename, markdownFilename(value.session.id));
    assert.equal(exported.sessionId, value.session.id);
    assert.equal(exported.title, null);
    assert.ok(Array.isArray(exported.entries));
  }
});

test('production snapshot uses the final provider title for document and filename', () => {
  const value = snapshot('i-readable-title.jsonl');
  const exported = exportSessionSnapshot(value.session.id, value);
  assert.equal(exported.title, 'Project Architecture Guide');
  assert.equal(exported.filename, 'Project-Architecture-Guide--2002da4d.md');
  assert.equal(exported.markdown, golden('i-readable-title.md'));
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
    `attachment; filename="${markdownFilename('session-test-a')}"; filename*=UTF-8''${markdownFilename('session-test-a')}`,
  );
  assert.equal(response.body, golden('a-normal-chat.md'));
});

test('host export route accepts turn selection and preserves chronological order', async () => {
  const calls = [];
  const handler = createConversationExportHandler({
    readSession: async (sessionId) => {
      calls.push(sessionId);
      return snapshot('a-normal-chat.jsonl');
    },
  });
  const response = new CaptureResponse();
  await handler(request({
    body: JSON.stringify({ sessionId: 'session-test-a', selection: { include: [1, 0], count: 2 } }),
  }), response);

  assert.equal(response.status, 200);
  assert.deepEqual(calls, ['session-test-a']);
  assert.equal(response.body, golden('a-normal-chat.md'));
});

test('host export route refuses zero selected turns before returning a download', async () => {
  const handler = createConversationExportHandler({
    readSession: async () => snapshot('a-normal-chat.jsonl'),
  });
  for (const selection of [{ include: [], count: 2 }, { exclude: [0, 1], count: 2 }]) {
    const response = new CaptureResponse();
    await handler(request({
      body: JSON.stringify({ sessionId: 'session-test-a', selection }),
    }), response);
    assert.equal(response.status, 400);
    assert.equal(response.headers['Content-Type'], 'text/plain; charset=utf-8');
    assert.equal(response.body, 'select at least one conversation turn');
    assert.equal(response.headers['Content-Disposition'], undefined);
  }
});

test('host export route rejects a stale selector turn count', async () => {
  const handler = createConversationExportHandler({
    readSession: async () => snapshot('a-normal-chat.jsonl'),
  });
  const response = new CaptureResponse();
  await handler(request({
    body: JSON.stringify({
      sessionId: 'session-test-a',
      selection: { include: [0], count: 1 },
    }),
  }), response);
  assert.equal(response.status, 400);
  assert.equal(response.body, 'conversation turns changed; reload the selector');
  assert.equal(response.headers['Content-Disposition'], undefined);
});

test('turn-list route returns only privacy-filtered bounded previews', async () => {
  const calls = [];
  const handler = createConversationTurnsHandler({
    readSession: async (sessionId) => {
      calls.push(sessionId);
      return snapshot('b-injected.jsonl');
    },
  });
  const response = new CaptureResponse();
  await handler(request({ body: JSON.stringify({ sessionId: 'session-test-b' }) }), response);

  assert.equal(CONVERSATION_TURNS_PATH, '/api/conversation.turns');
  assert.equal(response.status, 200);
  assert.equal(response.headers['Cache-Control'], 'no-store');
  assert.equal(response.headers['Content-Type'], 'application/json; charset=utf-8');
  assert.deepEqual(calls, ['session-test-b']);
  assert.deepEqual(JSON.parse(response.body), {
    turns: [{
      index: 0,
      human: 'Please write me a README outline.',
      assistant: 'Here is a README outline: - Intro - Usage',
    }],
  });
  for (const forbidden of [
    'approval policy',
    'SYSTEM PROMPT',
    'Available skills',
    'goal continuation',
    'CRON',
    'Backup acknowledged',
    '/Users/example',
    'session-test-b',
  ]) {
    assert.ok(!response.body.includes(forbidden), `turn-list response leaked ${forbidden}`);
  }
});

test('turn-list route shares the export request trust and failure boundary', async () => {
  let reads = 0;
  const failures = [];
  const handler = createConversationTurnsHandler({
    readSession: async () => {
      reads++;
      throw new Error('private path /Users/example/session.jsonl');
    },
    onError: (error) => failures.push(error),
  });

  for (const [incoming, status] of [
    [request({ method: 'GET' }), 405],
    [request({ headers: { host: 'attacker.example', 'content-type': 'application/json' } }), 403],
    [request({ headers: { host: '127.0.0.1:3080', 'content-type': 'text/plain' } }), 415],
    [request({ body: '{}' }), 400],
  ]) {
    const response = new CaptureResponse();
    await handler(incoming, response);
    assert.equal(response.status, status);
  }
  assert.equal(reads, 0);

  const response = new CaptureResponse();
  await handler(request(), response);
  assert.equal(response.status, 500);
  assert.equal(response.body, 'turn selection failed');
  assert.ok(!response.body.includes('/Users/example'));
  assert.equal(failures.length, 1);
});

test('host route emits an ASCII fallback and UTF-8 filename for a Chinese title', async () => {
  const handler = createConversationExportHandler({
    readSession: async () => {
      const value = snapshot('i-readable-title.jsonl');
      value.events.push({
        type: 'session/title',
        seq: value.events.length,
        time: 99,
        data: { title: '项目架构指南', messageSeqs: [1], source: { kind: 'provider', provider: 'test' } },
      });
      return value;
    },
  });
  const response = new CaptureResponse();
  await handler(request({ body: JSON.stringify({ sessionId: 'session-2002da4d-1111-4222-8333-123456789abc' }) }), response);

  assert.equal(response.status, 200);
  assert.equal(
    response.headers['Content-Disposition'],
    'attachment; filename="dsh-conversation--2002da4d.md"; filename*=UTF-8\'\'%E9%A1%B9%E7%9B%AE%E6%9E%B6%E6%9E%84%E6%8C%87%E5%8D%97--2002da4d.md',
  );
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
