/**
 * Markdown parsing utilities
 */

/**
 * Extract the title from markdown content (first H1)
 */
export function extractTitle(content: string): string | null {
  const match = content.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() ?? null;
}

/**
 * Extract all headings from markdown
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
      text: match[2]!.trim(),
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
