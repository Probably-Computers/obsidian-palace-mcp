/**
 * YAML frontmatter handling
 *
 * Phase 025: Added type validation and normalization
 */

import matter from 'gray-matter';
import type { NoteFrontmatter } from '../types/index.js';
import { normalizeType, isValidNoteType } from '../types/note-types.js';

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
 *
 * Phase 025: Added type validation - invalid types are normalized
 */
export function createDefaultFrontmatter(
  type: NoteFrontmatter['type'],
  source: NoteFrontmatter['source'] = 'claude',
  confidence = 0.5
): NoteFrontmatter {
  const now = new Date().toISOString();
  // Phase 025: Normalize type to prevent invalid values
  const normalizedType = type ? normalizeType(type) : 'research';
  return {
    type: normalizedType,
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
 *
 * Phase 025: Added type validation - types are normalized on merge
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

  // Phase 025: Normalize type to prevent double-suffixing and invalid values
  const rawType = updates.type ?? existing.type ?? 'research';
  const normalizedType = normalizeType(rawType);

  const result: NoteFrontmatter = {
    type: normalizedType,
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
