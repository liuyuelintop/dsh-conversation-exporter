/** Deterministic registration test for the additive DSH host integration. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply, inject, name } from '../src/plugin.js';

test('host plugin adds only its export and selector routes', () => {
  const routes = [];
  const effects = [];
  const ctx = {
    sessionQuery: { readSession: async () => undefined },
    webRuntime: { trustedHosts: [] },
    webServer: {
      register: (route) => {
        routes.push(route);
        return () => {};
      },
    },
    logger: { warn: () => {} },
    effect: (register, label) => {
      effects.push(label);
      register();
    },
  };

  apply(ctx);

  assert.equal(name, 'conversation-exporter');
  assert.deepEqual(inject, ['sessionQuery', 'webServer', 'webRuntime']);
  assert.deepEqual(routes.map((route) => route.path), [
    '/api/conversation.export',
    '/api/conversation.turns',
  ]);
  assert.ok(routes.every((route) => route.kind === 'exact' && typeof route.handler === 'function'));
  assert.ok(routes.every((route) => route.path !== '/api/session.export'));
  assert.equal(effects.length, 2);
});
