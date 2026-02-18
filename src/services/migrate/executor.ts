/**
 * Migration executor (Phase 029)
 *
 * Applies approved migration fixes:
 * - Renames unprefixed children to prefixed format
 * - Fixes corrupted headings (strips wiki-links from H1)
 *
 * Report-only: orphaned fragments, naming inconsistencies,
 * broken wiki-links, code block links.
 */

import { join, dirname, basename } from 'path';
import { readFile, writeFile, unlink } from 'fs/promises';
import type Database from 'better-sqlite3';
import type { InspectionIssue } from './inspector.js';
import { parseFrontmatter, stringifyFrontmatter } from '../../utils/frontmatter.js';
import { stripWikiLinks } from '../../utils/markdown.js';
import { indexNote, removeFromIndex } from '../index/sync.js';
import { readNote } from '../vault/reader.js';
import { saveVersion } from '../history/storage.js';
import {
  startOperation,
  trackFileCreated,
  trackFileModified,
  trackFileDeleted,
} from '../operations/index.js';
import { logger } from '../../utils/logger.js';

export interface MigrationResult {
  operation_id: string;
  issues_processed: number;
  issues_fixed: number;
  issues_skipped: number;
  fixes: Array<{
    path: string;
    type: string;
    action: string;
    new_path?: string;
  }>;
  skipped: Array<{
    path: string;
    type: string;
    reason: string;
  }>;
  errors: Array<{
    path: string;
    error: string;
  }>;
}

/**
 * Execute migration fixes for approved issues
 */
export async function executeMigration(
  issues: InspectionIssue[],
  vaultPath: string,
  vaultAlias: string,
  db: Database.Database,
  ignoreConfig: { patterns: string[]; marker_file: string; frontmatter_key: string }
): Promise<MigrationResult> {
  const operation = startOperation('migrate', vaultAlias, {
    issues_count: issues.length,
  });

  const palaceDir = join(vaultPath, '.palace');

  const result: MigrationResult = {
    operation_id: operation.id,
    issues_processed: issues.length,
    issues_fixed: 0,
    issues_skipped: 0,
    fixes: [],
    skipped: [],
    errors: [],
  };

  for (const issue of issues) {
    try {
      switch (issue.type) {
        case 'unprefixed_children':
          await fixUnprefixedChild(issue, vaultPath, palaceDir, db, ignoreConfig, operation.id, result);
          break;
        case 'corrupted_headings':
          await fixCorruptedHeading(issue, vaultPath, palaceDir, db, ignoreConfig, operation.id, result);
          break;
        case 'orphaned_fragments':
        case 'naming_inconsistencies':
        case 'broken_wiki_links':
        case 'code_block_links':
          result.issues_skipped++;
          result.skipped.push({
            path: issue.path,
            type: issue.type,
            reason: 'Report-only issue; requires manual review',
          });
          break;
      }
    } catch (error) {
      result.errors.push({
        path: issue.path,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}

/**
 * Fix an unprefixed child note by renaming it
 */
async function fixUnprefixedChild(
  issue: InspectionIssue,
  vaultPath: string,
  palaceDir: string,
  db: Database.Database,
  ignoreConfig: { patterns: string[]; marker_file: string; frontmatter_key: string },
  operationId: string,
  result: MigrationResult
): Promise<void> {
  const details = issue.details as {
    hub_path: string;
    hub_title: string;
    suggested_filename: string;
  };

  const oldPath = issue.path;
  const dir = dirname(oldPath);
  const newRelativePath = join(dir, details.suggested_filename);
  const oldFullPath = join(vaultPath, oldPath);
  const newFullPath = join(vaultPath, newRelativePath);

  // Read current content and backup
  const content = await readFile(oldFullPath, 'utf-8');
  await saveVersion(palaceDir, oldPath, content, 'migrate', 'rename');

  const { frontmatter, body } = parseFrontmatter(content);
  const fm = frontmatter as Record<string, unknown>;

  // Update frontmatter title to prefixed version
  const oldTitle = basename(oldPath, '.md');
  const newTitle = basename(newRelativePath, '.md');
  fm.title = newTitle;
  fm.modified = new Date().toISOString();

  // Write updated content to new path
  const updatedContent = stringifyFrontmatter(fm, body);
  await writeFile(newFullPath, updatedContent, 'utf-8');

  // Remove old index entry and delete old file
  removeFromIndex(db, oldPath);
  await unlink(oldFullPath);

  // Index new file
  const newNote = await readNote(newRelativePath, { vaultPath, ignoreConfig });
  if (newNote) {
    indexNote(db, newNote);
  }

  // Update hub Knowledge Map to reference new name
  await updateHubReference(
    details.hub_path,
    oldTitle,
    newTitle,
    vaultPath,
    palaceDir,
    db,
    ignoreConfig,
    operationId
  );

  trackFileDeleted(operationId, oldPath);
  trackFileCreated(operationId, newRelativePath);

  result.issues_fixed++;
  result.fixes.push({
    path: oldPath,
    type: 'unprefixed_children',
    action: `Renamed to ${newRelativePath}`,
    new_path: newRelativePath,
  });

  logger.info(`Migrated: ${oldPath} -> ${newRelativePath}`);
}

/**
 * Update a hub note's Knowledge Map to reference the new child name
 */
async function updateHubReference(
  hubPath: string,
  oldChildTitle: string,
  newChildTitle: string,
  vaultPath: string,
  palaceDir: string,
  db: Database.Database,
  ignoreConfig: { patterns: string[]; marker_file: string; frontmatter_key: string },
  operationId: string
): Promise<void> {
  const hubFullPath = join(vaultPath, hubPath);
  const hubContent = await readFile(hubFullPath, 'utf-8');

  // Replace [[OldTitle]] with [[NewTitle]] and [[OldTitle|...]] with [[NewTitle|...]]
  const escaped = oldChildTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const linkRegex = new RegExp(`\\[\\[${escaped}(\\|[^\\]]*)?\\]\\]`, 'g');

  const updatedHubContent = hubContent.replace(linkRegex, (_match, display) => {
    return display ? `[[${newChildTitle}${display}]]` : `[[${newChildTitle}]]`;
  });

  if (updatedHubContent !== hubContent) {
    await saveVersion(palaceDir, hubPath, hubContent, 'migrate', 'update_reference');
    await writeFile(hubFullPath, updatedHubContent, 'utf-8');

    const hubNote = await readNote(hubPath, { vaultPath, ignoreConfig });
    if (hubNote) {
      indexNote(db, hubNote);
    }

    trackFileModified(operationId, hubPath);
  }
}

/**
 * Fix a corrupted heading by stripping wiki-links from H1
 */
async function fixCorruptedHeading(
  issue: InspectionIssue,
  vaultPath: string,
  palaceDir: string,
  db: Database.Database,
  ignoreConfig: { patterns: string[]; marker_file: string; frontmatter_key: string },
  operationId: string,
  result: MigrationResult
): Promise<void> {
  const fullPath = join(vaultPath, issue.path);

  // Read content and backup
  const content = await readFile(fullPath, 'utf-8');
  await saveVersion(palaceDir, issue.path, content, 'migrate', 'fix_heading');

  const lines = content.split('\n');

  let fixed = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (line.startsWith('# ') && !line.startsWith('## ')) {
      if (/\[\[.*?\]\]/.test(line)) {
        lines[i] = stripWikiLinks(line);
        fixed = true;
      }
      break;
    }
  }

  if (fixed) {
    await writeFile(fullPath, lines.join('\n'), 'utf-8');

    const note = await readNote(issue.path, { vaultPath, ignoreConfig });
    if (note) {
      indexNote(db, note);
    }

    trackFileModified(operationId, issue.path);
    result.issues_fixed++;
    result.fixes.push({
      path: issue.path,
      type: 'corrupted_headings',
      action: 'Stripped wiki-links from H1 heading',
    });

    logger.info(`Fixed corrupted heading: ${issue.path}`);
  }
}
