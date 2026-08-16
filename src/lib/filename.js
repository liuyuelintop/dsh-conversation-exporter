/**
 * Locked download filename convention (mirrors the official export's
 * path-segment sanitization): `dsh-conversation-<session-id>.md`.
 * @param {unknown} sessionId
 * @returns {string}
 */
export function markdownFilename(sessionId) {
  return `dsh-conversation-${String(sessionId).replace(/[^A-Za-z0-9_-]/g, '_')}.md`;
}
