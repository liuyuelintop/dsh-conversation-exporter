/**
 * Render the clean conversation as Markdown: ## Human / ## Assistant sections
 * in chronological order, text preserved verbatim (paragraphs, fenced code
 * blocks, Unicode). Nothing else is emitted by construction.
 */

function renderMarker(marker) {
  return `> *(${marker})*`;
}

/**
 * @param {object[]} entries - extraction output (see extract.js).
 * @param {{marker?: (text: string) => string}} [options]
 * @returns {string} the Markdown document.
 */
export function renderConversation(entries, options = {}) {
  const markerFn = options.marker ?? renderMarker;
  const sections = [];
  for (const entry of entries) {
    for (const human of entry.humans) sections.push(`## Human\n\n${human}`);
    if (entry.assistant !== undefined) {
      sections.push(`## Assistant\n\n${entry.assistant}`);
    } else {
      sections.push(`## Assistant\n\n${markerFn(entry.marker)}`);
    }
  }
  return sections.length > 0 ? sections.join('\n\n') + '\n' : '';
}
