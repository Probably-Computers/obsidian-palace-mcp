/**
 * Cleanup detection and suggestions service
 *
 * Phase 023: Note Lifecycle Management
 * - Detects potential orphans after operations
 * - Generates cleanup suggestions
 * - Helps users maintain a healthy vault
 */

import Database from 'better-sqlite3';
import type { CleanupSuggestions } from '../../types/intent.js';

/**
 * Options for cleanup detection
 */
interface CleanupDetectionOptions {
  /** Directory to check for orphans */
  targetDir?: string;
  /** Paths of files just created (exclude from orphan detection) */
  excludePaths?: string[];
  /** Check for stale children (hub type changed) */
  checkStaleChildren?: boolean;
}

/**
 * Detect potential orphans in a directory
 * Returns files that have no incoming or outgoing links
 */
function findOrphansInDir(
  db: Database.Database,
  dir: string,
  excludePaths: string[]
): string[] {
  // Normalize directory path
  const dirPattern = dir.endsWith('/') ? dir : `${dir}/`;

  // Find notes in the directory that are isolated (no links in or out)
  const rows = db
    .prepare(
      `SELECT DISTINCT n.path
       FROM notes n
       WHERE n.path LIKE ? || '%'
       AND n.path NOT LIKE ? || '%/%/%'
       AND n.id NOT IN (
         SELECT DISTINCT source_note.id
         FROM notes source_note
         JOIN links l ON l.source_id = source_note.id
       )
       AND n.id NOT IN (
         SELECT DISTINCT target_note.id
         FROM notes target_note
         JOIN links l ON (
           LOWER(l.target_path) = LOWER(target_note.title)
           OR LOWER(l.target_path) = LOWER(REPLACE(target_note.path, '.md', ''))
           OR l.target_path = target_note.path
         )
       )
       ORDER BY n.path`
    )
    .all(dirPattern, dirPattern) as Array<{ path: string }>;

  // Filter out excluded paths
  const excludeSet = new Set(excludePaths.map((p) => p.toLowerCase()));
  return rows
    .map((r) => r.path)
    .filter((p) => !excludeSet.has(p.toLowerCase()));
}

/**
 * Find stale children - children that reference a hub that no longer exists
 * or whose hub type has changed (e.g., was split but hub was replaced)
 */
function findStaleChildren(
  db: Database.Database,
  targetDir: string
): string[] {
  const dirPattern = targetDir.endsWith('/') ? targetDir : `${targetDir}/`;

  // Find notes that look like children (have a related link to a hub-style note)
  // but the hub doesn't exist or isn't actually a hub
  const rows = db
    .prepare(
      `SELECT DISTINCT n.path
       FROM notes n
       WHERE n.path LIKE ? || '%'
       AND n.type NOT LIKE '%_hub'
       AND n.type IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM json_each(n.related)
         WHERE value LIKE '[[%]]'
       )
       AND NOT EXISTS (
         SELECT 1 FROM notes hub
         WHERE hub.type LIKE '%_hub'
         AND n.path LIKE REPLACE(hub.path, '.md', '') || '/%'
       )
       ORDER BY n.path`
    )
    .all(dirPattern) as Array<{ path: string }>;

  return rows.map((r) => r.path);
}

/**
 * Find files with broken links after a deletion or major change
 */
function findBrokenLinks(
  db: Database.Database,
  deletedPaths: string[]
): string[] {
  if (deletedPaths.length === 0) {
    return [];
  }

  // Extract titles from deleted paths for matching
  const deletedTitles = deletedPaths.map((p) => {
    const filename = p.split('/').pop() ?? p;
    return filename.replace('.md', '');
  });

  // Find notes that have links to the deleted notes
  const filesWithBrokenLinks: Set<string> = new Set();

  for (const title of deletedTitles) {
    const rows = db
      .prepare(
        `SELECT DISTINCT n.path
         FROM notes n
         JOIN links l ON l.source_id = n.id
         WHERE LOWER(l.target_path) = LOWER(?)`
      )
      .all(title) as Array<{ path: string }>;

    for (const row of rows) {
      filesWithBrokenLinks.add(row.path);
    }
  }

  return Array.from(filesWithBrokenLinks);
}

/**
 * Generate cleanup suggestions after an operation
 */
export function generateCleanupSuggestions(
  db: Database.Database,
  options: CleanupDetectionOptions = {}
): CleanupSuggestions | undefined {
  const { targetDir, excludePaths = [], checkStaleChildren = false } = options;

  const suggestions: CleanupSuggestions = {};
  const issues: string[] = [];

  // Check for orphans in the target directory
  if (targetDir) {
    const orphans = findOrphansInDir(db, targetDir, excludePaths);
    if (orphans.length > 0) {
      suggestions.orphaned_files = orphans;
      issues.push(`${orphans.length} orphaned file(s) in ${targetDir}`);
    }

    // Check for stale children
    if (checkStaleChildren) {
      const staleChildren = findStaleChildren(db, targetDir);
      if (staleChildren.length > 0) {
        suggestions.stale_children = staleChildren;
        issues.push(`${staleChildren.length} stale child note(s)`);
      }
    }
  }

  // Generate summary message
  if (issues.length > 0) {
    suggestions.message = `Cleanup recommended: ${issues.join('; ')}. Use palace_orphans or palace_delete to clean up.`;
    return suggestions;
  }

  return undefined;
}

/**
 * Generate cleanup suggestions specifically after a replace operation
 * where existing content was completely replaced
 */
export function generateReplaceCleanupSuggestions(
  db: Database.Database,
  replacedPath: string,
  wasHub: boolean
): CleanupSuggestions | undefined {
  const targetDir = replacedPath.replace(/\/[^/]+\.md$/, '');

  // If the replaced file was a hub, its children might be orphaned now
  if (wasHub) {
    const staleChildren = findStaleChildren(db, targetDir);
    if (staleChildren.length > 0) {
      return {
        stale_children: staleChildren,
        message: `Hub was replaced. ${staleChildren.length} child note(s) may need cleanup. Use palace_delete or palace_orphans to remove.`,
      };
    }
  }

  return undefined;
}

/**
 * Generate cleanup suggestions after deletion
 */
export function generateDeletionCleanupSuggestions(
  db: Database.Database,
  deletedPaths: string[]
): CleanupSuggestions | undefined {
  const brokenLinks = findBrokenLinks(db, deletedPaths);

  if (brokenLinks.length > 0) {
    return {
      broken_links: brokenLinks,
      message: `${brokenLinks.length} file(s) have broken links after deletion. Consider updating them.`,
    };
  }

  return undefined;
}
