/**
 * Curly quotes for frontmatter text. Markdown bodies get this from Astro's
 * smartypants; titles, summaries and theses don't, so the content schema runs
 * them through here. Type straight quotes; the site shows ’ “ ” everywhere.
 */
export function typeset(text: string): string {
  return text
    .replace(/(^|[\s([{—–-])"/g, '$1“')
    .replace(/"/g, '”')
    .replace(/(^|[\s([{“—–-])'/g, '$1‘')
    .replace(/'/g, '’');
}
