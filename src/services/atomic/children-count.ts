/**
 * Children Count Validation (Phase 025)
 *
 * Provides accurate children_count calculation for hub notes.
 * The stored value can become stale when children are deleted or moved.
 * This module verifies against actual files on disk.
 */

import { join, dirname, basename } from 'path';
import { existsSync, readdirSync } from 'fs';
import type Database from 'better-sqlite3';
import { parseFrontmatter } from '../../utils/frontmatter.js';
import { readFile, writeFile } from 'fs/promises';
import { logger } from '../../utils/logger.js';
import { isHubType } from '../../types/note-types.js';

/**
 * Result of children count validation
 */
export interface ChildrenCountResult {
  path: string;
  storedCount: number;
  actualCount: number;
  isAccurate: boolean;
  existingChildren: string[];
  missingChildren: string[];
  orphanedChildren: string[];
}

/**
 * Extract children paths from Knowledge Map section
 */
function extractChildrenFromKnowledgeMap(content: string, hubDir: string): string[] {
  const children: string[] = [];
  const lines = content.split('\n');
  let inKnowledgeMap = false;

  // Link patterns: - [[Title]] or - [[path|Title]]
  const linkRegex = /^-\s*\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/;

  for (const line of lines) {
    if (line.startsWith('## Knowledge Map')) {
      inKnowledgeMap = true;
      continue;
    }

    // Stop at next section
    if (inKnowledgeMap && line.startsWith('## ')) {
      break;
    }

    if (inKnowledgeMap) {
      const match = line.match(linkRegex);
      if (match) {
        const target = match[1]!;
        // Resolve to path - if target has no extension, add .md
        const childPath = target.endsWith('.md') ? target : `${target}.md`;
        // If no directory in path, assume same directory as hub
        const fullChildPath = childPath.includes('/')
          ? childPath
          : join(hubDir, childPath);
        children.push(fullChildPath);
      }
    }
  }

  return children;
}

/**
 * Get accurate children count for a hub note
 *
 * @param vaultPath - Full path to vault root
 * @param hubPath - Path to hub note relative to vault
 * @param content - Optional content (if already read)
 * @returns Children count result with detailed info
 */
export async function getAccurateChildrenCount(
  vaultPath: string,
  hubPath: string,
  content?: string
): Promise<ChildrenCountResult> {
  const fullHubPath = join(vaultPath, hubPath);
  const hubDir = dirname(hubPath);

  // Read content if not provided
  let hubContent = content;
  if (!hubContent) {
    try {
      hubContent = await readFile(fullHubPath, 'utf-8');
    } catch {
      return {
        path: hubPath,
        storedCount: 0,
        actualCount: 0,
        isAccurate: true,
        existingChildren: [],
        missingChildren: [],
        orphanedChildren: [],
      };
    }
  }

  // Parse frontmatter for stored count
  const { frontmatter, body } = parseFrontmatter(hubContent);
  const storedCount = (frontmatter as Record<string, unknown>).children_count as number ?? 0;

  // Extract children from Knowledge Map
  const linkedChildren = extractChildrenFromKnowledgeMap(body, hubDir);

  // Verify which children actually exist
  const existingChildren: string[] = [];
  const missingChildren: string[] = [];

  for (const childPath of linkedChildren) {
    const fullChildPath = join(vaultPath, childPath);
    if (existsSync(fullChildPath)) {
      existingChildren.push(childPath);
    } else {
      missingChildren.push(childPath);
    }
  }

  // Find orphaned children (files in same dir not linked from hub)
  const orphanedChildren: string[] = [];
  try {
    const hubDirFull = join(vaultPath, hubDir);
    const files = readdirSync(hubDirFull);
    const hubFilename = basename(hubPath);

    for (const file of files) {
      if (!file.endsWith('.md') || file === hubFilename) continue;

      const childPath = join(hubDir, file);
      // Check if this file is a child (not another hub) and not in the linked list
      const linkedNames = linkedChildren.map((p) => basename(p));
      if (!linkedNames.includes(file)) {
        // Check if it's a child by reading frontmatter
        try {
          const fullChildPath = join(vaultPath, childPath);
          const childContent = await readFile(fullChildPath, 'utf-8');
          const { frontmatter: childFm } = parseFrontmatter(childContent);
          const childType = (childFm as Record<string, unknown>).type as string ?? '';

          // If not a hub type and in same dir, it might be an orphan
          if (!isHubType(childType)) {
            orphanedChildren.push(childPath);
          }
        } catch {
          // Can't read, skip
        }
      }
    }
  } catch {
    // Directory might not exist, ignore
  }

  const actualCount = existingChildren.length;

  return {
    path: hubPath,
    storedCount,
    actualCount,
    isAccurate: storedCount === actualCount,
    existingChildren,
    missingChildren,
    orphanedChildren,
  };
}

/**
 * Update children_count in a hub note's frontmatter
 */
export async function updateChildrenCount(
  vaultPath: string,
  hubPath: string,
  newCount: number
): Promise<boolean> {
  const fullPath = join(vaultPath, hubPath);

  try {
    const content = await readFile(fullPath, 'utf-8');
    const { frontmatter, body } = parseFrontmatter(content);
    const fm = frontmatter as Record<string, unknown>;

    const currentCount = fm.children_count as number ?? 0;
    if (currentCount === newCount) {
      return true; // Already accurate
    }

    // Update frontmatter
    fm.children_count = newCount;
    fm.modified = new Date().toISOString();

    // Stringify and write back
    const { stringifyFrontmatter } = await import('../../utils/frontmatter.js');
    const newContent = stringifyFrontmatter(fm, body);
    await writeFile(fullPath, newContent, 'utf-8');

    logger.debug(`Updated children_count for ${hubPath}: ${currentCount} -> ${newCount}`);
    return true;
  } catch (error) {
    logger.error(`Failed to update children_count for ${hubPath}:`, error);
    return false;
  }
}

/**
 * Validate and optionally repair children_count for all hubs in vault
 */
export async function validateAllHubCounts(
  db: Database.Database,
  vaultPath: string,
  options: { repair?: boolean } = {}
): Promise<{
  validated: number;
  accurate: number;
  repaired: number;
  results: ChildrenCountResult[];
}> {
  // Find all hub notes in database
  const hubs = db.prepare(`
    SELECT path, children_count
    FROM notes
    WHERE type LIKE '%_hub' OR type = 'hub'
  `).all() as Array<{ path: string; children_count: number }>;

  const results: ChildrenCountResult[] = [];
  let accurate = 0;
  let repaired = 0;

  for (const hub of hubs) {
    const result = await getAccurateChildrenCount(vaultPath, hub.path);
    results.push(result);

    if (result.isAccurate) {
      accurate++;
    } else if (options.repair) {
      const success = await updateChildrenCount(vaultPath, hub.path, result.actualCount);
      if (success) {
        // Also update database
        db.prepare('UPDATE notes SET children_count = ? WHERE path = ?')
          .run(result.actualCount, hub.path);
        repaired++;
      }
    }
  }

  return {
    validated: hubs.length,
    accurate,
    repaired,
    results,
  };
}

/**
 * Get orphaned children across the vault (children without a hub)
 */
export async function findOrphanedChildren(
  db: Database.Database,
  vaultPath: string
): Promise<string[]> {
  // Get all non-hub notes that might be children
  const potentialChildren = db.prepare(`
    SELECT path, type
    FROM notes
    WHERE type NOT LIKE '%_hub' AND type != 'hub' AND type != 'stub'
  `).all() as Array<{ path: string; type: string }>;

  // Get all hub directories
  const hubs = db.prepare(`
    SELECT path FROM notes WHERE type LIKE '%_hub' OR type = 'hub'
  `).all() as Array<{ path: string }>;

  const hubDirs = new Set(hubs.map((h) => dirname(h.path)));
  const orphans: string[] = [];

  for (const note of potentialChildren) {
    const noteDir = dirname(note.path);
    // If note is in a hub directory but not linked from hub, it's orphaned
    if (hubDirs.has(noteDir)) {
      // Check if any hub in this dir links to this note
      const hubsInDir = hubs.filter((h) => dirname(h.path) === noteDir);
      let isLinked = false;

      for (const hub of hubsInDir) {
        const result = await getAccurateChildrenCount(vaultPath, hub.path);
        if (result.existingChildren.includes(note.path)) {
          isLinked = true;
          break;
        }
      }

      if (!isLinked) {
        orphans.push(note.path);
      }
    }
  }

  return orphans;
}
