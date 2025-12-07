/**
 * YAML frontmatter handling
 */

import matter from 'gray-matter';
import type { NoteFrontmatter } from '../types/index.js';

/**
 * Parse frontmatter from markdown content
 */
export function parseFrontmatter(content: string): {
  frontmatter: Partial<NoteFrontmatter>;
  body: string;
} {
  const { data, content: body } = matter(content);
  return {
    frontmatter: data as Partial<NoteFrontmatter>,
    body: body.trim(),
  };
}

/**
 * Stringify frontmatter and content back to markdown
 */
export function stringifyFrontmatter(
  frontmatter: NoteFrontmatter | Record<string, unknown>,
  body?: string
): string {
  if (body !== undefined) {
    return matter.stringify(body, frontmatter);
  }
  // Just stringify the frontmatter with empty body
  return matter.stringify('', frontmatter);
}

/**
 * Create default frontmatter for a new note
 */
export function createDefaultFrontmatter(
  type: NoteFrontmatter['type'],
  source: NoteFrontmatter['source'] = 'claude',
  confidence = 0.5
): NoteFrontmatter {
  const now = new Date().toISOString();
  return {
    type,
    created: now,
    modified: now,
    source,
    confidence,
    verified: false,
    tags: [],
    related: [],
    aliases: [],
  };
}

/**
 * Merge frontmatter updates into existing frontmatter
 */
export function mergeFrontmatter(
  existing: Partial<NoteFrontmatter>,
  updates: Partial<NoteFrontmatter>
): NoteFrontmatter {
  const now = new Date().toISOString();

  // Merge arrays intelligently
  const tags = [
    ...new Set([...(existing.tags ?? []), ...(updates.tags ?? [])]),
  ];
  const related = [
    ...new Set([...(existing.related ?? []), ...(updates.related ?? [])]),
  ];
  const aliases = [
    ...new Set([...(existing.aliases ?? []), ...(updates.aliases ?? [])]),
  ];

  const result: NoteFrontmatter = {
    type: updates.type ?? existing.type ?? 'research',
    created: existing.created ?? now,
    modified: now,
    verified: updates.verified ?? existing.verified ?? false,
    tags,
    related,
    aliases,
  };

  // Only set optional properties if they have values
  const source = updates.source ?? existing.source;
  if (source) result.source = source;

  const confidence = updates.confidence ?? existing.confidence;
  if (confidence !== undefined) result.confidence = confidence;

  return result;
}
