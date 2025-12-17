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

/**
 * Link processing styles for export (Phase 026)
 */
export type LinkStyle = 'keep' | 'plain_text' | 'relative' | 'remove';

/**
 * Process wiki-links in content according to the specified style (Phase 026)
 *
 * @param content - The markdown content with wiki-links
 * @param style - How to process the links:
 *   - 'keep': Leave [[wiki-links]] as is
 *   - 'plain_text': Convert [[Note]] to Note, [[Note|Alias]] to Alias
 *   - 'relative': Convert [[Note]] to [Note](./Note.md)
 *   - 'remove': Remove links entirely
 * @param slugify - Optional function to convert titles to filenames (for relative links)
 */
export function processWikiLinks(
  content: string,
  style: LinkStyle,
  slugify?: (title: string) => string
): string {
  if (style === 'keep') {
    return content;
  }

  // Match [[Link]] and [[Link|Alias]] patterns
  const linkPattern = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

  return content.replace(linkPattern, (match, target: string, alias?: string) => {
    const displayText = alias || target;

    switch (style) {
      case 'plain_text':
        return displayText;
      case 'relative': {
        const filename = slugify ? slugify(target) : `${target}.md`;
        return `[${displayText}](./${filename})`;
      }
      case 'remove':
        return '';
      default:
        return match;
    }
  });
}

/**
 * Adjust header levels in content by a specified offset (Phase 026)
 * Used when consolidating child content into a parent document
 *
 * @param content - Markdown content with headers
 * @param levelOffset - Number of levels to add (e.g., 1 makes # into ##)
 */
export function adjustHeaderLevels(content: string, levelOffset: number): string {
  if (levelOffset === 0) {
    return content;
  }

  const lines = content.split('\n');
  const result: string[] = [];

  for (const line of lines) {
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headerMatch) {
      const currentLevel = headerMatch[1]!.length;
      const newLevel = Math.min(6, Math.max(1, currentLevel + levelOffset));
      result.push(`${'#'.repeat(newLevel)} ${headerMatch[2]}`);
    } else {
      result.push(line);
    }
  }

  return result.join('\n');
}

/**
 * Strip frontmatter from markdown content (Phase 026)
 */
export function stripFrontmatter(content: string): string {
  // Match YAML frontmatter (--- at start, then optional content, then ---)
  const frontmatterRegex = /^---\n[\s\S]*?---\n*/;
  return content.replace(frontmatterRegex, '');
}

/**
 * Convert frontmatter to a document header (Phase 026)
 * Creates a human-readable header from select frontmatter fields
 */
export function frontmatterToHeader(
  frontmatter: Record<string, unknown>,
  fields: string[] = ['title', 'created', 'modified', 'tags']
): string {
  const lines: string[] = [];

  for (const field of fields) {
    const value = frontmatter[field];
    if (value !== undefined && value !== null) {
      const displayValue = Array.isArray(value) ? value.join(', ') : String(value);
      const label = field.charAt(0).toUpperCase() + field.slice(1);
      lines.push(`**${label}:** ${displayValue}`);
    }
  }

  if (lines.length === 0) {
    return '';
  }

  return lines.join('\n') + '\n\n---\n\n';
}

/**
 * Render markdown to basic HTML (Phase 026)
 * Simple markdown to HTML conversion for export
 */
export function markdownToHtml(content: string): string {
  let html = content;

  // Headers
  html = html.replace(/^###### (.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^##### (.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/___(.+?)___/g, '<strong><em>$1</em></strong>');
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
  html = html.replace(/_(.+?)_/g, '<em>$1</em>');

  // Code blocks (before inline code)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Links (markdown style)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Wiki-links (convert to plain spans with data attribute)
  html = html.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '<span class="wiki-link" data-target="$1">$2</span>');
  html = html.replace(/\[\[([^\]]+)\]\]/g, '<span class="wiki-link" data-target="$1">$1</span>');

  // Lists
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>\n$&</ul>\n');

  // Numbered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Blockquotes
  html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr>');
  html = html.replace(/^\*\*\*$/gm, '<hr>');

  // Paragraphs (wrap remaining non-HTML lines)
  const lines = html.split('\n');
  const result: string[] = [];
  let inParagraph = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (inParagraph) {
        result.push('</p>');
        inParagraph = false;
      }
      result.push('');
    } else if (trimmed.startsWith('<') || trimmed.match(/^<\/(h[1-6]|ul|ol|li|blockquote|pre|hr)/)) {
      if (inParagraph) {
        result.push('</p>');
        inParagraph = false;
      }
      result.push(line);
    } else {
      if (!inParagraph) {
        result.push('<p>');
        inParagraph = true;
      }
      result.push(line);
    }
  }

  if (inParagraph) {
    result.push('</p>');
  }

  return result.join('\n');
}

/**
 * Wrap HTML content in a complete document (Phase 026)
 */
export function wrapHtmlDocument(
  body: string,
  title: string,
  options: { includeStyles?: boolean } = {}
): string {
  const styles = options.includeStyles
    ? `<style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; line-height: 1.6; }
    h1 { border-bottom: 1px solid #eee; padding-bottom: 0.5rem; }
    h2 { margin-top: 2rem; }
    code { background: #f4f4f4; padding: 0.2rem 0.4rem; border-radius: 3px; }
    pre { background: #f4f4f4; padding: 1rem; overflow-x: auto; }
    pre code { background: none; padding: 0; }
    blockquote { border-left: 4px solid #ddd; margin: 0; padding-left: 1rem; color: #666; }
    .wiki-link { color: #7c3aed; text-decoration: none; }
    a { color: #2563eb; }
  </style>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  ${styles}
</head>
<body>
${body}
</body>
</html>`;
}
