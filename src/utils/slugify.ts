/**
 * Convert titles to valid filenames
 */

/**
 * Convert a title to a URL/filename-safe slug
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove non-word chars (except spaces and hyphens)
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
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
 * Extract title from filename (remove .md extension and unslugify)
 */
export function titleFromFilename(filename: string): string {
  const withoutExt = filename.replace(/\.md$/i, '');
  return unslugify(withoutExt);
}

/**
 * Create a filename from a title
 */
export function filenameFromTitle(title: string): string {
  return `${slugify(title)}.md`;
}
