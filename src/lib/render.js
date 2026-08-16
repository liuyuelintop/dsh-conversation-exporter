/**
 * Render the clean conversation as Markdown: ## Human / ## Assistant sections
 * in chronological order, text preserved verbatim (paragraphs, fenced code
 * blocks, Unicode). Nothing else is emitted by construction.
 *
 * A turn without a final assistant response renders NO assistant section —
 * the human message stands alone, followed by the neutral marker
 * `> Response incomplete.` (never a synthesized assistant response).
 */

const INCOMPLETE_MARKER = '> Response incomplete.';

/**
 * @param {object[]} entries - extraction output (see extract.js).
 * @returns {string} the Markdown document.
 */
export function renderConversation(entries) {
  const sections = [];
  for (const entry of entries) {
    for (const human of entry.humans) sections.push(`## Human\n\n${human}`);
    if (entry.assistant !== null) {
      sections.push(`## Assistant\n\n${entry.assistant}`);
    } else {
      sections.push(INCOMPLETE_MARKER);
    }
  }
  return sections.length > 0 ? sections.join('\n\n') + '\n' : '';
}
