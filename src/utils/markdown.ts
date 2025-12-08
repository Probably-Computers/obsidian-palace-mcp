/**
 * Markdown parsing utilities
 */

/**
 * Strip wiki-link syntax from text, keeping the display text or target
 * [[target|display]] → display
 * [[target]] → target
 */
export function stripWikiLinks(text: string): string {
  return text
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2') // [[target|display]] → display
    .replace(/\[\[([^\]]+)\]\]/g, '$1'); // [[target]] → target
}

/**
 * Extract the title from markdown content (first H1)
 * Strips wiki-link syntax from the extracted title
 */
export function extractTitle(content: string): string | null {
  const match = content.match(/^#\s+(.+)$/m);
  const rawTitle = match?.[1]?.trim() ?? null;
  return rawTitle ? stripWikiLinks(rawTitle) : null;
}

/**
 * Extract all headings from markdown
 * Strips wiki-link syntax from heading text
 */
export function extractHeadings(
  content: string
): Array<{ level: number; text: string; position: number }> {
  const headings: Array<{ level: number; text: string; position: number }> = [];
  const regex = /^(#{1,6})\s+(.+)$/gm;
  let match;

  while ((match = regex.exec(content)) !== null) {
    headings.push({
      level: match[1]!.length,
      text: stripWikiLinks(match[2]!.trim()),
      position: match.index,
    });
  }

  return headings;
}

/**
 * Extract text content, stripping markdown formatting
 */
export function stripMarkdown(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, '') // Remove code blocks
    .replace(/`[^`]+`/g, '') // Remove inline code
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, '$2$1') // Wiki-links to text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Regular links to text
    .replace(/[*_~`#]/g, '') // Remove formatting chars
    .replace(/\n+/g, ' ') // Collapse newlines
    .replace(/\s+/g, ' ') // Collapse spaces
    .trim();
}

/**
 * Get a snippet of text around a position
 */
export function getSnippet(
  content: string,
  position: number,
  radius = 50
): string {
  const start = Math.max(0, position - radius);
  const end = Math.min(content.length, position + radius);

  let snippet = content.slice(start, end);

  if (start > 0) snippet = '...' + snippet;
  if (end < content.length) snippet = snippet + '...';

  return snippet.replace(/\n/g, ' ').trim();
}

/**
 * Count words in content
 */
export function wordCount(content: string): number {
  const text = stripMarkdown(content);
  return text.split(/\s+/).filter((word) => word.length > 0).length;
}

/**
 * Check if content is empty (only whitespace or frontmatter)
 */
export function isEmptyContent(body: string): boolean {
  return body.trim().length === 0;
}
