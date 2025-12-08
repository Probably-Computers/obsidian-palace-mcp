/**
 * Convert titles to valid filenames
 *
 * Phase 018: Obsidian-Native Architecture
 * - Primary function is titleToFilename() which preserves case and spaces
 * - slugify() kept for backwards compatibility with existing paths/URLs
 */

/**
 * Convert a title to a URL/filename-safe slug (lowercase with hyphens)
 * Used for URL-safe paths, not for note filenames
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[/\\&+]/g, '-') // Replace separators with hyphens first
    .replace(/[^\w\s-]/g, '') // Remove non-word chars (except spaces and hyphens)
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Sanitize a title for use as a filename (preserves case and spaces)
 * Only removes/replaces characters that are invalid in filenames
 */
export function sanitizeForFilename(title: string): string {
  return title
    .trim()
    .replace(/[/\\:*?"<>|]/g, '-') // Replace invalid filename chars with hyphen
    .replace(/\s+/g, ' ') // Normalize multiple spaces to single
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
    .trim();
}

/**
 * Convert a slug back to a readable title
 */
export function unslugify(slug: string): string {
  return slug
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Extract title from filename (remove .md extension)
 * For title-style filenames, this just removes the extension
 * For slugified filenames, it also converts to title case
 */
export function titleFromFilename(filename: string): string {
  const withoutExt = filename.replace(/\.md$/i, '');
  // If it looks like a slug (lowercase with hyphens), unslugify it
  if (withoutExt === withoutExt.toLowerCase() && withoutExt.includes('-')) {
    return unslugify(withoutExt);
  }
  // Otherwise return as-is (it's already a title-style filename)
  return withoutExt;
}

/**
 * Create a title-style filename (preserves case and spaces)
 * This is the Obsidian-native approach where filenames match note titles
 * Example: "Green Peppers" -> "Green Peppers.md"
 */
export function titleToFilename(title: string): string {
  return `${sanitizeForFilename(title)}.md`;
}
