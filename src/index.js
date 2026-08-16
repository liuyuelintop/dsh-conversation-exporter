/**
 * Public pipeline entry point.
 *
 *   exportConversation(logText) -> { markdown, header, stats }
 *
 * logText is the official DSH session-log JSONL artifact text (decompress
 * `.jsonl.zstd` first; the CLI does this transparently).
 */

import { parseSessionLog } from './lib/sessionlog.js';
import { extractConversation } from './lib/extract.js';
import { renderConversation } from './lib/render.js';

export { SessionFormatError } from './lib/sessionlog.js';

export function exportConversation(logText, options = {}) {
  const { header, events, stats: parseStats } = parseSessionLog(logText);
  const { entries, stats: extractStats } = extractConversation(events);
  const markdown = renderConversation(entries, options);
  return { markdown, header, stats: { ...parseStats, ...extractStats } };
}
