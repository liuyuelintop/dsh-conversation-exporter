/** Native DSH Web host plugin: local Markdown download and turn-preview routes. */

import {
  CONVERSATION_EXPORT_PATH,
  CONVERSATION_TURNS_PATH,
  createConversationExportHandler,
  createConversationTurnsHandler,
} from './lib/production.js';

export const name = 'conversation-exporter';
export const inject = ['sessionQuery', 'webServer', 'webRuntime'];

/**
 * Register the production routes without changing the official Session Log
 * endpoint or any DSH/global configuration.
 * @param {object} ctx DSH Cordis context.
 */
export function apply(ctx) {
  const options = {
    readSession: (sessionId) => ctx.sessionQuery.readSession(sessionId),
    trustedHosts: ctx.webRuntime.trustedHosts,
    onError: (error) => ctx.logger.warn(error instanceof Error ? error : new Error(String(error))),
  };
  const exportHandler = createConversationExportHandler(options);
  const turnsHandler = createConversationTurnsHandler(options);
  ctx.effect(
    () => ctx.webServer.register({ kind: 'exact', path: CONVERSATION_EXPORT_PATH, handler: exportHandler }),
    'conversation-exporter: Markdown download route',
  );
  ctx.effect(
    () => ctx.webServer.register({ kind: 'exact', path: CONVERSATION_TURNS_PATH, handler: turnsHandler }),
    'conversation-exporter: turn selector route',
  );
}
