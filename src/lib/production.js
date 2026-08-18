/**
 * DSH Web production boundary.
 *
 * The host routes read one current session through `sessionQuery`, feed the
 * accepted extract/render core, and return filtered data to the browser. They own
 * no persistence and never send conversation data anywhere but the same-
 * origin browser that requested it.
 */

import { extractConversation } from './extract.js';
import { markdownFilename } from './filename.js';
import { renderConversation } from './render.js';

export const CONVERSATION_EXPORT_PATH = '/api/conversation.export';
export const CONVERSATION_TURNS_PATH = '/api/conversation.turns';
export const MAX_EXPORT_REQUEST_BYTES = 4096;
export const MAX_TURN_PREVIEW_CHARACTERS = 180;

class RequestBoundaryError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'RequestBoundaryError';
    this.status = status;
  }
}

function header(headers, name) {
  const value = headers?.[name];
  return Array.isArray(value) ? value[0] : typeof value === 'string' ? value : undefined;
}

function parseAuthority(authority) {
  try {
    return new URL(`http://${authority}`);
  } catch {
    return undefined;
  }
}

function canonicalAuthority(entry, entryUrl) {
  const port = entryUrl.port !== '' ? entryUrl.port : new URL(`https://${entry}`).port;
  return port === '' ? entryUrl.hostname : `${entryUrl.hostname}:${port}`;
}

function isLoopbackHostname(hostname) {
  if (hostname === 'localhost' || hostname === '[::1]') return true;
  const parts = hostname.split('.');
  return parts.length === 4
    && parts[0] === '127'
    && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

function isTrustedAuthority(hostUrl, trustedHosts) {
  return trustedHosts.some((entry) => {
    const entryUrl = parseAuthority(entry);
    if (entryUrl === undefined) return false;
    return canonicalAuthority(entry, entryUrl) === entryUrl.hostname
      ? entryUrl.hostname === hostUrl.hostname
      : entryUrl.host === hostUrl.host;
  });
}

/**
 * Mirror DSH Web's `/api` Host/Origin trust fence for this plugin-owned route.
 * @param {import('node:http').IncomingMessage} request
 * @param {readonly string[]} trustedHosts
 * @returns {boolean}
 */
export function isTrustedExportRequest(request, trustedHosts) {
  const host = header(request.headers, 'host');
  if (host === undefined) return false;
  const hostUrl = parseAuthority(host);
  if (hostUrl === undefined) return false;
  if (!isLoopbackHostname(hostUrl.hostname) && !isTrustedAuthority(hostUrl, trustedHosts)) return false;
  if (header(request.headers, 'sec-fetch-site') === 'cross-site') return false;
  const origin = header(request.headers, 'origin');
  if (origin === undefined) return true;
  try {
    return new URL(origin).host === hostUrl.host;
  } catch {
    return false;
  }
}

async function readJsonBody(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > MAX_EXPORT_REQUEST_BYTES) {
      throw new RequestBoundaryError(413, 'export request is too large');
    }
    chunks.push(buffer);
  }
  let value;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new RequestBoundaryError(400, 'export request must be valid JSON');
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new RequestBoundaryError(400, 'export request must be a JSON object');
  }
  return value;
}

function sessionIdOf(value) {
  if (typeof value.sessionId !== 'string' || value.sessionId.length === 0) {
    throw new RequestBoundaryError(400, 'export request requires a non-empty sessionId');
  }
  return value.sessionId;
}

function writeText(response, status, text, extraHeaders = {}) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  });
  response.end(text);
}

function writeJson(response, status, value) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(value));
}

function encodedFilename(filename) {
  return encodeURIComponent(filename).replace(/['()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function contentDisposition(filename, sessionId) {
  const fallback = /^[\x20-\x7E]+$/.test(filename) ? filename : markdownFilename(sessionId);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodedFilename(filename)}`;
}

function canonicalSessionSnapshot(requestedSessionId, snapshot) {
  if (snapshot === null || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new TypeError('sessionQuery.readSession returned no snapshot object');
  }
  if (snapshot.session === null || typeof snapshot.session !== 'object' || Array.isArray(snapshot.session)) {
    throw new TypeError('sessionQuery.readSession returned no session header');
  }
  if (String(snapshot.session.id) !== requestedSessionId) {
    throw new TypeError('sessionQuery.readSession returned a different session');
  }
  if (!Array.isArray(snapshot.events)) {
    throw new TypeError('sessionQuery.readSession returned no event array');
  }
  return extractConversation(snapshot.events);
}

function selectionIndexes(selection, entryCount) {
  if (selection === null || typeof selection !== 'object' || Array.isArray(selection)) {
    throw new RequestBoundaryError(400, 'turn selection must be a JSON object');
  }
  const hasInclude = Object.hasOwn(selection, 'include');
  const hasExclude = Object.hasOwn(selection, 'exclude');
  const hasBits = Object.hasOwn(selection, 'bits');
  if (hasBits) {
    if (Object.keys(selection).some((key) => key !== 'bits' && key !== 'count')
      || typeof selection.bits !== 'string'
      || selection.count !== entryCount
      || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(selection.bits)) {
      throw new RequestBoundaryError(400, 'turn selection contains an invalid bitset');
    }
    const bytes = Buffer.from(selection.bits, 'base64');
    if (bytes.length !== Math.ceil(entryCount / 8) || bytes.toString('base64') !== selection.bits) {
      throw new RequestBoundaryError(400, 'turn selection contains an invalid bitset');
    }
    const unusedBits = bytes.length * 8 - entryCount;
    if (unusedBits > 0 && (bytes.at(-1) >> (8 - unusedBits)) !== 0) {
      throw new RequestBoundaryError(400, 'turn selection contains an invalid bitset');
    }
    const indexes = new Set();
    for (let index = 0; index < entryCount; index++) {
      if ((bytes[index >> 3] & (1 << (index & 7))) !== 0) indexes.add(index);
    }
    return { mode: 'include', indexes };
  }
  if (hasInclude === hasExclude
    || Object.keys(selection).some((key) => key !== 'include' && key !== 'exclude' && key !== 'count')) {
    throw new RequestBoundaryError(400, 'turn selection must contain exactly one of include or exclude');
  }
  if (selection.count !== entryCount) {
    throw new RequestBoundaryError(400, 'conversation turns changed; reload the selector');
  }
  const mode = hasInclude ? 'include' : 'exclude';
  const indexes = selection[mode];
  if (!Array.isArray(indexes)) {
    throw new RequestBoundaryError(400, `turn selection ${mode} must be an array`);
  }
  const unique = new Set();
  for (const index of indexes) {
    if (!Number.isSafeInteger(index) || index < 0 || index >= entryCount) {
      throw new RequestBoundaryError(400, 'turn selection contains an out-of-range index');
    }
    if (unique.has(index)) {
      throw new RequestBoundaryError(400, 'turn selection contains a duplicate index');
    }
    unique.add(index);
  }
  return { mode, indexes: unique };
}

/**
 * Filter canonical entries by opaque browser-facing indexes. The source array
 * is always traversed in chronological order, so request ordering cannot
 * reorder or duplicate transcript turns.
 * @param {object[]} entries
 * @param {{include: number[], count: number}|{exclude: number[], count: number}|{bits: string, count: number}|undefined} selection
 * @returns {object[]}
 */
export function selectConversationEntries(entries, selection = undefined) {
  if (selection === undefined) return entries;
  const { mode, indexes } = selectionIndexes(selection, entries.length);
  const selected = entries.filter((_entry, index) =>
    mode === 'include' ? indexes.has(index) : !indexes.has(index));
  if (selected.length === 0) {
    throw new RequestBoundaryError(400, 'select at least one conversation turn');
  }
  return selected;
}

function shortPreview(value) {
  const readable = value.replace(/\s+/gu, ' ').trim();
  const characters = Array.from(readable);
  if (characters.length <= MAX_TURN_PREVIEW_CHARACTERS) return readable;
  return `${characters.slice(0, MAX_TURN_PREVIEW_CHARACTERS - 1).join('')}…`;
}

/**
 * Build the minimal browser selector model from the already privacy-filtered
 * canonical conversation. Raw turn ids and full message bodies stay host-side.
 * @param {string} requestedSessionId
 * @param {{session: object, events: object[]}} snapshot
 * @returns {{turns: {index: number, human: string, assistant: string|null}[]}}
 */
export function listSessionTurnPreviews(requestedSessionId, snapshot) {
  const { entries } = canonicalSessionSnapshot(requestedSessionId, snapshot);
  return {
    turns: entries.map((entry, index) => ({
      index,
      human: shortPreview(entry.humans.join(' / ')),
      assistant: entry.assistant === null ? null : shortPreview(entry.assistant),
    })),
  };
}

/**
 * Run the production core against one detached `readSession` snapshot.
 * @param {string} requestedSessionId
 * @param {{session: object, events: object[]}} snapshot
 * @param {{include: number[], count: number}|{exclude: number[], count: number}|{bits: string, count: number}|undefined} selection
 * @returns {{sessionId: string, title: string|null, entries: object[], filename: string, markdown: string, stats: object}}
 */
export function exportSessionSnapshot(requestedSessionId, snapshot, selection = undefined) {
  const { title, entries, stats } = canonicalSessionSnapshot(requestedSessionId, snapshot);
  const selectedEntries = selectConversationEntries(entries, selection);
  return {
    sessionId: requestedSessionId,
    title,
    entries: selectedEntries,
    filename: markdownFilename(requestedSessionId, title),
    markdown: renderConversation(selectedEntries, title),
    stats,
  };
}

/**
 * Build the exact Node HTTP handler registered with DSH's `webServer`.
 * @param {{
 *   readSession: (sessionId: string) => Promise<{session: object, events: object[]}>,
 *   trustedHosts?: readonly string[],
 *   onError?: (error: unknown) => void,
 * }} options
 * @returns {(request: import('node:http').IncomingMessage, response: import('node:http').ServerResponse) => Promise<void>}
 */
export function createConversationExportHandler({ readSession, trustedHosts = [], onError = () => {} }) {
  return async (request, response) => {
    if (request.method !== 'POST') {
      writeText(response, 405, 'method not allowed', { Allow: 'POST' });
      return;
    }
    if (!isTrustedExportRequest(request, trustedHosts)) {
      writeText(response, 403, 'forbidden');
      return;
    }
    const mediaType = header(request.headers, 'content-type')?.split(';', 1)[0]?.trim().toLowerCase();
    if (mediaType !== 'application/json') {
      writeText(response, 415, 'content type must be application/json');
      return;
    }

    try {
      const value = await readJsonBody(request);
      const sessionId = sessionIdOf(value);
      const snapshot = await readSession(sessionId);
      const exported = exportSessionSnapshot(sessionId, snapshot, value.selection);
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Disposition': contentDisposition(exported.filename, sessionId),
        'Content-Type': 'text/markdown; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(exported.markdown);
    } catch (error) {
      if (error instanceof RequestBoundaryError) {
        writeText(response, error.status, error.message);
        return;
      }
      onError(error);
      writeText(response, 500, 'conversation export failed');
    }
  };
}

/**
 * Build the exact Node HTTP handler for the privacy-filtered turn-preview list.
 * @param {{
 *   readSession: (sessionId: string) => Promise<{session: object, events: object[]}>,
 *   trustedHosts?: readonly string[],
 *   onError?: (error: unknown) => void,
 * }} options
 * @returns {(request: import('node:http').IncomingMessage, response: import('node:http').ServerResponse) => Promise<void>}
 */
export function createConversationTurnsHandler({ readSession, trustedHosts = [], onError = () => {} }) {
  return async (request, response) => {
    if (request.method !== 'POST') {
      writeText(response, 405, 'method not allowed', { Allow: 'POST' });
      return;
    }
    if (!isTrustedExportRequest(request, trustedHosts)) {
      writeText(response, 403, 'forbidden');
      return;
    }
    const mediaType = header(request.headers, 'content-type')?.split(';', 1)[0]?.trim().toLowerCase();
    if (mediaType !== 'application/json') {
      writeText(response, 415, 'content type must be application/json');
      return;
    }

    try {
      const value = await readJsonBody(request);
      const sessionId = sessionIdOf(value);
      const snapshot = await readSession(sessionId);
      writeJson(response, 200, listSessionTurnPreviews(sessionId, snapshot));
    } catch (error) {
      if (error instanceof RequestBoundaryError) {
        writeText(response, error.status, error.message);
        return;
      }
      onError(error);
      writeText(response, 500, 'turn selection failed');
    }
  };
}
