/**
 * Alias management for auto-linking
 * Loads and manages note aliases for expanded matching
 */

import Database from 'better-sqlite3';
import { readNote } from '../vault/index.js';
import { logger } from '../../utils/logger.js';
import type { LinkableTitle } from './scanner.js';
import { DEFAULT_MIN_TITLE_LENGTH } from './scanner.js';

/**
 * Alias conflict when multiple notes have the same alias
 */
export interface AliasConflict {
  alias: string;
  paths: string[];
}

/**
 * Load aliases from a single note
 */
export async function loadNoteAliases(path: string): Promise<string[]> {
  const note = await readNote(path);
  if (!note) return [];

  return note.frontmatter.aliases ?? [];
}

/**
 * Load all aliases from the vault and merge into linkable index
 * Returns the updated index with aliases and any conflicts found
 */
export async function mergeAliasesIntoIndex(
  db: Database.Database,
  index: Map<string, LinkableTitle>,
  minTitleLength: number = DEFAULT_MIN_TITLE_LENGTH,
): Promise<{ index: Map<string, LinkableTitle>; conflicts: AliasConflict[] }> {
  const conflicts: AliasConflict[] = [];

  // Get all notes paths
  const notes = db.prepare('SELECT path FROM notes').all() as { path: string }[];

  // Track which aliases map to which paths (for conflict detection)
  const aliasMap = new Map<string, string[]>();

  for (const { path } of notes) {
    const aliases = await loadNoteAliases(path);

    for (const alias of aliases) {
      // Skip short aliases
      if (alias.length < minTitleLength) continue;

      const aliasLower = alias.toLowerCase();

      // Track paths for this alias
      const paths = aliasMap.get(aliasLower) ?? [];
      paths.push(path);
      aliasMap.set(aliasLower, paths);
    }
  }

  // Process alias map, detecting conflicts
  for (const [aliasLower, paths] of aliasMap) {
    if (paths.length > 1) {
      // Conflict: multiple notes have same alias
      conflicts.push({ alias: aliasLower, paths });
      logger.warn(`Alias conflict for "${aliasLower}": ${paths.join(', ')}`);
      // First note wins
    }

    const winningPath = paths[0]!;

    // Check if this alias conflicts with an existing title
    const existing = index.get(aliasLower);
    if (existing && existing.path !== winningPath) {
      // Alias matches another note's title - title takes precedence
      logger.debug(`Alias "${aliasLower}" skipped - matches title of ${existing.path}`);
      continue;
    }

    // Find the linkable entry for this path
    let linkable: LinkableTitle | undefined;
    for (const [, entry] of index) {
      if (entry.path === winningPath) {
        linkable = entry;
        break;
      }
    }

    if (linkable) {
      // Add alias to the linkable entry
      if (!linkable.aliases.includes(aliasLower)) {
        linkable.aliases.push(aliasLower);
      }
      // Add alias as a lookup key pointing to the same linkable
      index.set(aliasLower, linkable);
    }
  }

  logger.debug(`Merged ${aliasMap.size} aliases, ${conflicts.length} conflicts`);

  return { index, conflicts };
}

/**
 * Build a complete linkable index including aliases
 * This is the main entry point for building an index with aliases
 */
export async function buildCompleteIndex(
  db: Database.Database,
  minTitleLength: number = DEFAULT_MIN_TITLE_LENGTH,
): Promise<{ index: Map<string, LinkableTitle>; conflicts: AliasConflict[] }> {
  // Import here to avoid circular dependency
  const { buildLinkableIndex } = await import('./scanner.js');

  const index = buildLinkableIndex(db, minTitleLength);
  return mergeAliasesIntoIndex(db, index, minTitleLength);
}
