/**
 * DSH Web production boundary.
 *
 * The host route reads one current session through `sessionQuery`, feeds the
 * accepted extract/render core, and returns Markdown to the browser. It owns
 * no persistence and never sends conversation data anywhere but the same-
 * origin browser that requested it.
 */

import { extractConversation } from './extract.js';
import { markdownFilename } from './filename.js';
import { renderConversation } from './render.js';

export const CONVERSATION_EXPORT_PATH = '/api/conversation.export';
export const MAX_EXPORT_REQUEST_BYTES = 4096;

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

function encodedFilename(filename) {
  return encodeURIComponent(filename).replace(/['()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function contentDisposition(filename, sessionId) {
  const fallback = /^[\x20-\x7E]+$/.test(filename) ? filename : markdownFilename(sessionId);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodedFilename(filename)}`;
}

/**
 * Run the production core against one detached `readSession` snapshot.
 * @param {string} requestedSessionId
 * @param {{session: object, events: object[]}} snapshot
 * @returns {{sessionId: string, title: string|null, entries: object[], filename: string, markdown: string, stats: object}}
 */
export function exportSessionSnapshot(requestedSessionId, snapshot) {
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
  const { title, entries, stats } = extractConversation(snapshot.events);
  return {
    sessionId: requestedSessionId,
    title,
    entries,
    filename: markdownFilename(requestedSessionId, title),
    markdown: renderConversation(entries, title),
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
      const sessionId = await readJsonBody(request);
      const snapshot = await readSession(sessionId);
      const exported = exportSessionSnapshot(sessionId, snapshot);
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
