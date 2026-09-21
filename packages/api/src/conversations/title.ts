const DEFAULT_TITLE_MAX_LENGTH = 60;

/**
 * A conversation title taken from the user's own opening message, for when the
 * title model produced nothing. Whitespace is collapsed so a pasted block does
 * not carry its line breaks into the sidebar, and the cut falls on a word
 * boundary when one is close enough to the limit to be worth keeping.
 */
export function deriveTitleFromText(
  text?: string | null,
  maxLength: number = DEFAULT_TITLE_MAX_LENGTH,
): string | null {
  const collapsed = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
  if (!collapsed) {
    return null;
  }
  if (collapsed.length <= maxLength) {
    return collapsed;
  }

  const clipped = collapsed.slice(0, maxLength);
  const lastSpace = clipped.lastIndexOf(' ');
  const stem = lastSpace > maxLength / 2 ? clipped.slice(0, lastSpace) : clipped;
  return `${stem.trimEnd()}…`;
}
