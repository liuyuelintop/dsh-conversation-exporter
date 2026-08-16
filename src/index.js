/**
 * Public pipeline entry point.
 *
 *   exportConversation(logText) -> { markdown, header, stats }
 *
 * logText is the official DSH session-log JSONL artifact text (decompress
 * `.jsonl.zstd` first; the CLI does this transparently). The JSONL/CLI path is
 * the TEST/DEBUG path; the production read path feeds the same extract/render
 * core from `sessionQuery.readSession` (see docs/ARCHITECTURE.md).
 */

import { parseSessionLog } from './lib/sessionlog.js';
import { extractConversation } from './lib/extract.js';
import { renderConversation } from './lib/render.js';

export { SessionFormatError } from './lib/sessionlog.js';
export { markdownFilename } from './lib/filename.js';
export { exportSessionSnapshot } from './lib/production.js';
export { apply, inject, name } from './plugin.js';

export function exportConversation(logText) {
  const { header, events, stats: parseStats } = parseSessionLog(logText);
  const { entries, stats: extractStats } = extractConversation(events);
  const markdown = renderConversation(entries);
  return { markdown, header, stats: { ...parseStats, ...extractStats } };
}
