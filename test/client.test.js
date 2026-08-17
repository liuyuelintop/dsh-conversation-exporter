/** Deterministic test of the shipped DSH client-module artifact. */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const clientSource = readFileSync(join(here, '..', 'lib', 'client.js'), 'utf8');

function loadClient(fetcher) {
  let definition;
  const styles = [];
  const anchors = [];
  const stateWrites = [[], []];
  let hook = 0;
  let objectUrlBlob;
  const revoked = [];

  class TestURL extends URL {}
  TestURL.createObjectURL = (blob) => {
    objectUrlBlob = blob;
    return 'blob:test-export';
  };
  TestURL.revokeObjectURL = (url) => revoked.push(url);

  const document = {
    querySelector: () => null,
    createElement: (name) => {
      if (name === 'style') return { dataset: {}, textContent: '' };
      const anchor = {
        name,
        clickCalled: false,
        click() { this.clickCalled = true; },
        remove() { this.removed = true; },
      };
      anchors.push(anchor);
      return anchor;
    },
    head: { appendChild: (tag) => styles.push(tag) },
    body: { appendChild: () => {} },
  };

  vm.runInNewContext(clientSource, {
    window: { __ModuleLoader__: { load: (value) => { definition = value; } } },
    document,
    fetch: fetcher,
    location: { origin: 'http://127.0.0.1:3080' },
    URL: TestURL,
    Blob,
    setTimeout: (callback) => callback(),
  }, { filename: 'lib/client.js' });

  const exports = definition.factory((specifier) => {
    if (specifier === 'react') {
      return {
        useState: (initial) => {
          const index = hook++;
          return [initial, (value) => stateWrites[index].push(value)];
        },
      };
    }
    if (specifier === 'react/jsx-runtime') {
      return { jsx: (type, props) => ({ type, props }) };
    }
    throw new Error(`unexpected client require: ${specifier}`);
  });

  return {
    exports,
    styles,
    anchors,
    stateWrites,
    objectUrlBlob: () => objectUrlBlob,
    revoked,
    resetHooks: () => { hook = 0; },
  };
}

test('client module mounts one additive Export Chat utility and downloads the current session', async () => {
  const requests = [];
  const client = loadClient(async (url, options) => {
    requests.push({ url: String(url), options });
    return new Response('# 项目架构指南\n\n---\n\n> **Human**\n\nHello\n', {
      status: 200,
      headers: {
        'Content-Disposition': "attachment; filename=\"dsh-conversation--2002da4d.md\"; filename*=UTF-8''%E9%A1%B9%E7%9B%AE%E6%9E%B6%E6%9E%84%E6%8C%87%E5%8D%97--2002da4d.md",
        'Content-Type': 'text/markdown; charset=utf-8',
      },
    });
  });

  let injection;
  let registration;
  const ctx = {
    slots: {
      inject: (name, callback) => {
        injection = name;
        callback();
      },
      register: (options, component) => {
        registration = { options, component };
        return () => {};
      },
    },
  };
  client.exports.apply(ctx);

  assert.deepEqual(Array.from(client.exports.inject), ['slots']);
  assert.equal(injection, 'conversation.session.header.utilities');
  assert.equal(registration.options.name, 'conversation.session.header.utilities');
  assert.equal(registration.options.id, 'conversation-exporter');
  assert.equal(registration.options.label, 'Export Chat');
  assert.equal(client.styles.length, 1);
  assert.equal(client.styles[0].dataset.plugin, 'dsh-conversation-exporter');

  client.resetHooks();
  const button = registration.component({ sessionId: 'session/a b' });
  assert.equal(button.type, 'button');
  assert.equal(button.props.children, 'Export Chat');
  await button.props.onClick();

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'http://127.0.0.1:3080/api/conversation.export');
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(requests[0].options.headers['Content-Type'], 'application/json');
  assert.equal(requests[0].options.body, JSON.stringify({ sessionId: 'session/a b' }));
  assert.equal(client.anchors.length, 1);
  assert.equal(client.anchors[0].download, '项目架构指南--2002da4d.md');
  assert.equal(client.anchors[0].clickCalled, true);
  assert.equal(client.anchors[0].removed, true);
  assert.equal(await client.objectUrlBlob().text(), '# 项目架构指南\n\n---\n\n> **Human**\n\nHello\n');
  assert.deepEqual(client.revoked, ['blob:test-export']);
  assert.deepEqual(client.stateWrites[0], ['downloading', 'idle']);
  assert.deepEqual(client.stateWrites[1], [null]);
});

test('client module surfaces a same-origin route failure without starting a download', async () => {
  const client = loadClient(async () => new Response('forbidden', { status: 403 }));
  let component;
  client.exports.apply({
    slots: {
      inject: (_name, callback) => callback(),
      register: (_options, value) => {
        component = value;
        return () => {};
      },
    },
  });
  client.resetHooks();
  const button = component({ sessionId: 'session-test-a' });
  await button.props.onClick();
  assert.equal(client.anchors.length, 0);
  assert.deepEqual(client.stateWrites[0], ['downloading', 'error']);
  assert.equal(client.stateWrites[1][0], null);
  assert.match(client.stateWrites[1][1], /HTTP 403 forbidden/);
});
