/**
 * Batch note selection service (Phase 027)
 *
 * Provides mechanisms to select notes for batch operations using:
 * - Glob patterns (e.g., "**\/*.md", "projects/**\/Related.md")
 * - Query criteria (type, tags, domain, dates)
 * - Exclusion patterns
 */

import { join, relative, normalize } from 'path';
import { readdir, stat } from 'fs/promises';
import Database from 'better-sqlite3';
import { queryNotesInVault, type FilterOptions } from '../index/query.js';
import { logger } from '../../utils/logger.js';

/**
 * Selection criteria for batch operations
 */
export interface SelectCriteria {
  glob?: string; // Glob pattern for file selection
  type?: string; // Filter by note type
  tags?: string[]; // Filter by tags (AND logic)
  domain?: string[]; // Filter by domain
  path_prefix?: string; // Filter by path prefix
  exclude?: string[]; // Patterns to exclude
}

/**
 * Selected note with metadata
 */
export interface SelectedNote {
  path: string;
  title: string;
  type: string;
}

/**
 * Selection result
 */
export interface SelectionResult {
  notes: SelectedNote[];
  count: number;
  warnings: string[];
}

/**
 * Check if a path matches a glob-like pattern
 * Supports: *, **, ?
 */
function matchesPattern(path: string, pattern: string): boolean {
  // Normalize paths
  const normalizedPath = normalize(path).replace(/\\/g, '/');
  const normalizedPattern = normalize(pattern).replace(/\\/g, '/');

  // Convert glob pattern to regex using placeholders to avoid double-replacement
  let regexStr = normalizedPattern
    // Escape special regex characters (except * and ?)
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    // Handle **/ (zero or more directories with trailing slash) - use placeholder
    .replace(/\*\*\//g, '{{STARSTAR_SLASH}}')
    // Handle ** at end (match anything) - use placeholder
    .replace(/\*\*$/g, '{{STARSTAR_END}}')
    // Handle remaining ** - use placeholder
    .replace(/\*\*/g, '{{STARSTAR}}')
    // Handle * (match anything except /)
    .replace(/\*/g, '[^/]*')
    // Handle ? (match single character except /)
    .replace(/\?/g, '[^/]')
    // Now restore placeholders with actual regex patterns
    .replace(/\{\{STARSTAR_SLASH\}\}/g, '(?:.*/)?')
    .replace(/\{\{STARSTAR_END\}\}/g, '.*')
    .replace(/\{\{STARSTAR\}\}/g, '.*');

  // If pattern ends with /, match directory and contents
  if (normalizedPattern.endsWith('/')) {
    regexStr = regexStr.slice(0, -1) + '(?:/.*)?';
  }

  // Anchor pattern appropriately
  if (!normalizedPattern.startsWith('/')) {
    // Pattern doesn't start with / - can match anywhere, but prefer from start
    regexStr = '^' + regexStr;
  } else {
    regexStr = '^' + regexStr.slice(1);
  }

  // Anchor to end
  regexStr = regexStr + '$';

  try {
    const regex = new RegExp(regexStr, 'i');
    return regex.test(normalizedPath);
  } catch {
    logger.warn(`Invalid pattern: ${pattern}`);
    return false;
  }
}

/**
 * Select notes based on criteria
 */
export async function selectNotes(
  criteria: SelectCriteria,
  vaultPath: string,
  db: Database.Database
): Promise<SelectionResult> {
  const warnings: string[] = [];
  let paths: string[] = [];

  // Step 1: Glob pattern selection
  if (criteria.glob) {
    try {
      paths = await selectByGlob(criteria.glob, vaultPath);
      logger.debug(`Glob pattern matched ${paths.length} files`);
    } catch (error) {
      warnings.push(`Glob error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Step 2: Query-based selection
  const hasQueryCriteria =
    criteria.type || criteria.tags?.length || criteria.domain?.length || criteria.path_prefix;

  if (hasQueryCriteria) {
    const queryResults = selectByQuery(criteria, db);
    const queryPaths = queryResults.map((note) => note.path);

    if (paths.length > 0) {
      // Intersection: paths matching both glob AND query
      paths = paths.filter((p) => queryPaths.includes(p));
    } else {
      paths = queryPaths;
    }
    logger.debug(`After query filter: ${paths.length} files`);
  }

  // Step 3: Apply exclusions
  if (criteria.exclude && criteria.exclude.length > 0) {
    const beforeCount = paths.length;
    paths = applyExclusions(paths, criteria.exclude);
    logger.debug(`Excluded ${beforeCount - paths.length} files`);
  }

  // Step 4: Get note metadata for selected paths
  const notes = getNotesMetadata(paths, db);

  return {
    notes,
    count: notes.length,
    warnings,
  };
}

/**
 * Recursively walk directory and collect .md files
 */
async function walkDirectory(dir: string, relativeTo: string): Promise<string[]> {
  const results: string[] = [];

  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relativePath = relative(relativeTo, fullPath).replace(/\\/g, '/');

      // Skip hidden directories and common ignored paths
      if (entry.name.startsWith('.') || entry.name === 'node_modules') {
        continue;
      }

      if (entry.isDirectory()) {
        const subResults = await walkDirectory(fullPath, relativeTo);
        results.push(...subResults);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push(relativePath);
      }
    }
  } catch (error) {
    logger.debug(`Error walking directory ${dir}: ${error}`);
  }

  return results;
}

/**
 * Select files by glob pattern
 */
async function selectByGlob(pattern: string, vaultPath: string): Promise<string[]> {
  // Get all markdown files in vault
  const allFiles = await walkDirectory(vaultPath, vaultPath);

  // Filter by pattern
  return allFiles.filter((path) => matchesPattern(path, pattern));
}

/**
 * Select notes by query criteria
 */
function selectByQuery(
  criteria: SelectCriteria,
  db: Database.Database
): SelectedNote[] {
  const filterOptions: FilterOptions = {
    limit: 10000, // High limit for batch operations
    offset: 0,
  };

  if (criteria.type && criteria.type !== 'all') {
    filterOptions.type = criteria.type;
  }

  if (criteria.tags && criteria.tags.length > 0) {
    filterOptions.tags = criteria.tags;
  }

  if (criteria.path_prefix) {
    filterOptions.path = criteria.path_prefix;
  }

  // Query the database
  const results = queryNotesInVault(db, filterOptions);

  // Filter by domain if specified
  let filtered = results;
  if (criteria.domain && criteria.domain.length > 0) {
    filtered = results.filter((note) => {
      // Check if note path starts with any of the domains
      return criteria.domain!.some((domain) =>
        note.path.toLowerCase().startsWith(domain.toLowerCase() + '/')
      );
    });
  }

  return filtered.map((note) => ({
    path: note.path,
    title: note.title,
    type: (note.frontmatter.type as string | undefined) ?? 'research',
  }));
}

/**
 * Apply exclusion patterns to paths
 */
function applyExclusions(paths: string[], patterns: string[]): string[] {
  return paths.filter((path) => {
    for (const pattern of patterns) {
      if (matchesPattern(path, pattern)) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Get note metadata for paths from database
 */
function getNotesMetadata(paths: string[], db: Database.Database): SelectedNote[] {
  if (paths.length === 0) return [];

  const notes: SelectedNote[] = [];

  for (const path of paths) {
    try {
      const row = db
        .prepare('SELECT path, title, type FROM notes WHERE path = ?')
        .get(path) as { path: string; title: string; type: string } | undefined;

      if (row) {
        notes.push({
          path: row.path,
          title: row.title,
          type: row.type ?? 'research',
        });
      } else {
        // Note exists on disk but not in index - use path as title
        const filename = path.split('/').pop() ?? path;
        const title = filename.replace(/\.md$/, '');
        notes.push({
          path,
          title,
          type: 'unknown',
        });
      }
    } catch (error) {
      logger.debug(`Error getting metadata for ${path}: ${error}`);
    }
  }

  return notes;
}

/**
 * Validate selection criteria
 */
export function validateSelectionCriteria(criteria: SelectCriteria): string[] {
  const errors: string[] = [];

  // Must have at least one selection method
  const hasGlob = Boolean(criteria.glob);
  const hasQuery =
    Boolean(criteria.type) ||
    (criteria.tags && criteria.tags.length > 0) ||
    (criteria.domain && criteria.domain.length > 0) ||
    Boolean(criteria.path_prefix);

  if (!hasGlob && !hasQuery) {
    errors.push('Selection criteria must include glob pattern or query filters (type, tags, domain, path_prefix)');
  }

  return errors;
}
