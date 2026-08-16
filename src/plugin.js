/** Native DSH Web host plugin: one local Markdown download route. */

import {
  CONVERSATION_EXPORT_PATH,
  createConversationExportHandler,
} from './lib/production.js';

export const name = 'conversation-exporter';
export const inject = ['sessionQuery', 'webServer', 'webRuntime'];

/**
 * Register the production route without changing the official Session Log
 * endpoint or any DSH/global configuration.
 * @param {object} ctx DSH Cordis context.
 */
export function apply(ctx) {
  const handler = createConversationExportHandler({
    readSession: (sessionId) => ctx.sessionQuery.readSession(sessionId),
    trustedHosts: ctx.webRuntime.trustedHosts,
    onError: (error) => ctx.logger.warn(error instanceof Error ? error : new Error(String(error))),
  });
  ctx.effect(
    () => ctx.webServer.register({ kind: 'exact', path: CONVERSATION_EXPORT_PATH, handler }),
    'conversation-exporter: Markdown download route',
  );
}
