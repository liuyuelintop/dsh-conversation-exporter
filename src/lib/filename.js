import { createHash } from 'node:crypto';

const UNSAFE_FILENAME_CHARACTER = /[<>:"/\\|?*\u0000-\u001F\u007F-\u009F\u200B\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]+/gu;
const MAX_TITLE_BYTES = 180;

function truncateUtf8(value, maxBytes) {
  let result = '';
  let bytes = 0;
  for (const character of value) {
    const next = Buffer.byteLength(character, 'utf8');
    if (bytes + next > maxBytes) break;
    result += character;
    bytes += next;
  }
  return result;
}

function sanitizedTitle(title) {
  if (typeof title !== 'string') return '';
  const safe = title
    .normalize('NFC')
    .replace(UNSAFE_FILENAME_CHARACTER, '-')
    .replace(/\s+/gu, '-')
    .replace(/-+/gu, '-')
    .replace(/^[. -]+|[. -]+$/gu, '');
  return truncateUtf8(safe, MAX_TITLE_BYTES).replace(/[. -]+$/gu, '');
}

function shortSessionId(sessionId) {
  const value = String(sessionId);
  const uuid = /(?:^|[^0-9A-Fa-f])([0-9A-Fa-f]{8})-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}(?:$|[^0-9A-Fa-f])/.exec(value);
  if (uuid !== null) return uuid[1].toLowerCase();
  return createHash('sha256').update(value).digest('hex').slice(0, 8);
}

/**
 * Produce `<sanitized-title>--<short-session-id>.md`, preserving safe Unicode.
 * A missing or fully sanitized-away title uses the stable product fallback.
 * @param {unknown} sessionId
 * @param {unknown} title
 * @returns {string}
 */
export function markdownFilename(sessionId, title = null) {
  const readable = sanitizedTitle(title) || 'dsh-conversation';
  return `${readable}--${shortSessionId(sessionId)}.md`;
}
