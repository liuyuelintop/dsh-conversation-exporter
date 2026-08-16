/**
 * Parse the DSH session-log JSONL artifact (the official durable format).
 *
 * Verified against `dsh-session-persistence-jsonl` and `dsh-session`
 * (`chunk-rows`) in the installed harness (dsh@0.1.0-rc.6):
 *  - line 1 is the session header line `{type:"session", version, id, ...}`;
 *  - following lines are session events or packed chunk rows
 *    (`text-chunks` / `reasoning-chunks` / `tool-call-chunks`);
 *  - chunk rows expand back to `assistant/chunk` deltas (excluded from clean
 *    export, so we validate and skip them, but keep seq accounting honest);
 *  - foreign format versions must be refused loudly.
 */

export class SessionFormatError extends Error {
  constructor(message, line) {
    super(line !== undefined ? `${message} (line ${line})` : message);
    this.name = 'SessionFormatError';
    this.line = line;
  }
}

const CHUNK_ROW_TYPES = new Set(['text-chunks', 'reasoning-chunks', 'tool-call-chunks']);

function parseLine(line, lineNumber) {
  let value;
  try {
    value = JSON.parse(line);
  } catch {
    throw new SessionFormatError('line is not valid JSON', lineNumber);
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new SessionFormatError('record is not a JSON object', lineNumber);
  }
  return value;
}

function chunkRowMembers(record, type, lineNumber) {
  const data = record.data;
  if (data === null || typeof data !== 'object') {
    throw new SessionFormatError(`malformed chunk row "${type}"`, lineNumber);
  }
  const members = Array.isArray(data.texts) ? data.texts : Array.isArray(data.args) ? data.args : null;
  if (members === null) {
    throw new SessionFormatError(`malformed chunk row "${type}": no member array`, lineNumber);
  }
  if (members.length === 0) {
    throw new SessionFormatError(`malformed chunk row "${type}": empty run`, lineNumber);
  }
  return members;
}

/**
 * Parse session-log JSONL text into its header and ordered raw events.
 * @param {string} text - the artifact text (plain; decompress `.zstd` first).
 * @returns {{header: object, events: object[], stats: {chunkRows: number}}}
 * @throws {SessionFormatError} on header/version/seq/structure violations.
 */
export function parseSessionLog(text) {
  const lines = text.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  if (lines.length === 0) throw new SessionFormatError('empty session log');

  const header = parseLine(lines[0], 1);
  if (header.type !== 'session') {
    throw new SessionFormatError('first line is not a session header', 1);
  }
  if (header.version !== 0) {
    throw new SessionFormatError(
      `unsupported session format version ${JSON.stringify(header.version)} (expected 0); upgrade the exporter`,
      1,
    );
  }

  const events = [];
  const stats = { chunkRows: 0 };
  let expectedSeq = 0;
  for (let i = 1; i < lines.length; i++) {
    const lineNumber = i + 1;
    if (lines[i] === '') throw new SessionFormatError('empty line inside session log', lineNumber);
    const record = parseLine(lines[i], lineNumber);
    const type = record.type;
    if (typeof type !== 'string' || type === '') {
      throw new SessionFormatError('record has no string type', lineNumber);
    }
    if (CHUNK_ROW_TYPES.has(type)) {
      if (typeof record.seq0 !== 'number' || !Number.isSafeInteger(record.seq0)) {
        throw new SessionFormatError(`chunk row "${type}" has no integer seq0`, lineNumber);
      }
      const members = chunkRowMembers(record, type, lineNumber);
      if (record.seq0 !== expectedSeq) {
        throw new SessionFormatError(
          `seq discontinuity: expected ${expectedSeq}, chunk row "${type}" starts at ${record.seq0}`,
          lineNumber,
        );
      }
      expectedSeq += members.length;
      stats.chunkRows++;
      continue; // chunk rows encode assistant/chunk deltas — excluded from clean export by construction
    }
    const seq = record.seq;
    if (typeof seq !== 'number' || !Number.isSafeInteger(seq)) {
      throw new SessionFormatError(`event "${type}" has no integer seq`, lineNumber);
    }
    if (seq !== expectedSeq) {
      throw new SessionFormatError(`seq discontinuity: expected ${expectedSeq}, found ${seq}`, lineNumber);
    }
    expectedSeq++;
    events.push(record);
  }
  return { header, events, stats };
}
