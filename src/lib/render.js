/**
 * Render the clean conversation as Markdown with a session-title H1 and
 * blockquoted Human / Assistant labels in chronological order. Message text is
 * preserved verbatim except for closing a still-open fenced code block at the
 * end of that message so it cannot consume later transcript sections.
 *
 * A turn without a final assistant response renders NO assistant section —
 * the human message stands alone, followed by the neutral marker
 * `> Response incomplete.` (never a synthesized assistant response).
 */

const INCOMPLETE_MARKER = '> Response incomplete.';
const FALLBACK_DOCUMENT_TITLE = 'DSH Conversation';

function openingFence(line) {
  const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  if (match === null) return null;
  const run = match[1];
  if (run[0] === '`' && match[2].includes('`')) return null;
  return { character: run[0], length: run.length };
}

function closesFence(line, open) {
  const match = /^ {0,3}(`+|~+)[ \t]*$/.exec(line);
  return match !== null && match[1][0] === open.character && match[1].length >= open.length;
}

/** Close only a fenced block left open at the end of one message. */
export function protectMarkdownFences(message) {
  let open = null;
  for (const line of message.split(/\r?\n/)) {
    if (open === null) {
      open = openingFence(line);
    } else if (closesFence(line, open)) {
      open = null;
    }
  }
  if (open === null) return message;
  const newline = message.endsWith('\n') ? '' : '\n';
  return `${message}${newline}${open.character.repeat(open.length)}`;
}

function roleSection(role, message) {
  return `> **${role}**\n\n${protectMarkdownFences(message)}`;
}

/**
 * @param {object[]} entries - extraction output (see extract.js).
 * @param {string|null} title - latest usable DSH session title.
 * @returns {string} the Markdown document.
 */
export function renderConversation(entries, title = null) {
  const sections = [];
  for (const entry of entries) {
    for (const human of entry.humans) sections.push(roleSection('Human', human));
    if (entry.assistant !== null) {
      sections.push(roleSection('Assistant', entry.assistant));
    } else {
      sections.push(INCOMPLETE_MARKER);
    }
  }
  const documentTitle = title ?? FALLBACK_DOCUMENT_TITLE;
  return sections.length > 0
    ? `# ${documentTitle}\n\n---\n\n${sections.join('\n\n---\n\n')}\n`
    : `# ${documentTitle}\n`;
}
