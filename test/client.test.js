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
  const stateWrites = [];
  const hookValues = [];
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
    btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
    setTimeout: (callback) => callback(),
  }, { filename: 'lib/client.js' });

  const exports = definition.factory((specifier) => {
    if (specifier === 'react') {
      return {
        useState: (initial) => {
          const index = hook++;
          if (!(index in hookValues)) hookValues[index] = initial;
          if (!(index in stateWrites)) stateWrites[index] = [];
          return [hookValues[index], (value) => {
            const next = typeof value === 'function' ? value(hookValues[index]) : value;
            hookValues[index] = next;
            stateWrites[index].push(next);
          }];
        },
      };
    }
    if (specifier === 'react/jsx-runtime') {
      const element = (type, props, key) => ({ type, props, key });
      return { jsx: element, jsxs: element };
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
    render: (component, props) => {
      hook = 0;
      return component(props);
    },
  };
}

function elements(root) {
  const result = [];
  const visit = (value) => {
    if (value === null || value === undefined || typeof value === 'boolean') return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (typeof value !== 'object' || value.type === undefined || value.props === undefined) return;
    result.push(value);
    visit(value.props.children);
  };
  visit(root);
  return result;
}

function button(root, label) {
  return elements(root).find((element) => element.type === 'button' && element.props.children === label);
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

  const root = client.render(registration.component, { sessionId: 'session/a b' });
  assert.equal(root.type, 'div');
  const exportButton = button(root, 'Export Chat');
  assert.equal(exportButton.type, 'button');
  await exportButton.props.onClick();

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
  assert.deepEqual(client.stateWrites[0].map((value) => value.status), ['downloading', 'idle']);
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
  const root = client.render(component, { sessionId: 'session-test-a' });
  await button(root, 'Export Chat').props.onClick();
  assert.equal(client.anchors.length, 0);
  assert.deepEqual(client.stateWrites[0].map((value) => value.status), ['downloading', 'error']);
  assert.match(client.stateWrites[0][1].error, /HTTP 403 forbidden/);
});

test('client selector defaults all turns on, supports clear/select-all, and exports selected indexes', async () => {
  const requests = [];
  const client = loadClient(async (url, options) => {
    requests.push({ url: String(url), options });
    if (String(url).endsWith('/api/conversation.turns')) {
      return Response.json({
        turns: [
          { index: 0, human: 'First question', assistant: 'First answer' },
          { index: 1, human: '[Image omitted]', assistant: null },
        ],
      });
    }
    return new Response('# Selected title\n\n---\n\n> **Human**\n\n[Image omitted]\n', {
      status: 200,
      headers: {
        'Content-Disposition': "attachment; filename=\"Selected-title--12345678.md\"; filename*=UTF-8''Selected-title--12345678.md",
      },
    });
  });
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

  let root = client.render(component, { sessionId: 'session-select' });
  assert.equal(button(root, 'Export selected turns'), undefined);
  await button(root, 'Select turns…').props.onClick();

  assert.equal(requests[0].url, 'http://127.0.0.1:3080/api/conversation.turns');
  assert.equal(requests[0].options.body, JSON.stringify({ sessionId: 'session-select' }));

  root = client.render(component, { sessionId: 'session-select' });
  const checkboxes = elements(root).filter((element) => element.type === 'input' && element.props.type === 'checkbox');
  assert.equal(checkboxes.length, 2);
  assert.ok(checkboxes.every((checkbox) => checkbox.props.checked));
  assert.equal(button(root, 'Export selected turns').props.disabled, false);
  assert.ok(elements(root).some((element) => element.props.children === 'Response incomplete.'));

  button(root, 'Clear').props.onClick();
  root = client.render(component, { sessionId: 'session-select' });
  assert.ok(elements(root)
    .filter((element) => element.type === 'input' && element.props.type === 'checkbox')
    .every((checkbox) => !checkbox.props.checked));
  assert.equal(button(root, 'Export selected turns').props.disabled, true);

  button(root, 'Select all').props.onClick();
  root = client.render(component, { sessionId: 'session-select' });
  const selected = elements(root).filter((element) => element.type === 'input' && element.props.type === 'checkbox');
  assert.ok(selected.every((checkbox) => checkbox.props.checked));
  selected[0].props.onChange({ target: { checked: false } });

  root = client.render(component, { sessionId: 'session-select' });
  await button(root, 'Export selected turns').props.onClick();

  assert.equal(requests.length, 2);
  assert.equal(requests[1].url, 'http://127.0.0.1:3080/api/conversation.export');
  assert.equal(requests[1].options.body, JSON.stringify({
    sessionId: 'session-select',
    selection: { include: [1], count: 2 },
  }));
  assert.equal(client.anchors.length, 1);
  assert.equal(client.anchors[0].download, 'Selected-title--12345678.md');
});

test('client keeps all-selected requests compact for long conversations', async () => {
  const requests = [];
  const turns = Array.from({ length: 5000 }, (_unused, index) => ({
    index,
    human: `Question ${index}`,
    assistant: `Answer ${index}`,
  }));
  const client = loadClient(async (url, options) => {
    requests.push({ url: String(url), options });
    if (String(url).endsWith('/api/conversation.turns')) return Response.json({ turns });
    return new Response('# Long conversation\n');
  });
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

  let root = client.render(component, { sessionId: 'session-long' });
  await button(root, 'Select turns…').props.onClick();
  root = client.render(component, { sessionId: 'session-long' });
  assert.equal(button(root, 'Export selected turns').props.disabled, false);
  await button(root, 'Export selected turns').props.onClick();

  assert.equal(requests[1].options.body, JSON.stringify({
    sessionId: 'session-long',
    selection: { exclude: [], count: 5000 },
  }));
  assert.ok(requests[1].options.body.length < 100);
  assert.match(client.styles[0].textContent, /overflow-y:auto/u);
});

test('client bit-packs large arbitrary selections within the existing request bound', async () => {
  const requests = [];
  const turns = Array.from({ length: 2000 }, (_unused, index) => ({
    index,
    human: `Question ${index}`,
    assistant: `Answer ${index}`,
  }));
  const client = loadClient(async (url, options) => {
    requests.push({ url: String(url), options });
    if (String(url).endsWith('/api/conversation.turns')) return Response.json({ turns });
    return new Response('# Selected conversation\n');
  });
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

  let root = client.render(component, { sessionId: 'session-long-arbitrary' });
  await button(root, 'Select turns…').props.onClick();
  root = client.render(component, { sessionId: 'session-long-arbitrary' });
  button(root, 'Clear').props.onClick();
  const checkboxes = elements(root).filter((element) => element.type === 'input' && element.props.type === 'checkbox');
  for (let index = 1; index < checkboxes.length; index += 2) {
    checkboxes[index].props.onChange({ target: { checked: true } });
  }

  root = client.render(component, { sessionId: 'session-long-arbitrary' });
  await button(root, 'Export selected turns').props.onClick();
  const body = JSON.parse(requests[1].options.body);
  assert.equal(body.selection.count, 2000);
  assert.equal(typeof body.selection.bits, 'string');
  assert.ok(requests[1].options.body.length < 4096);
});
