/**
 * Vault file writing operations
 *
 * Phase 028: Added version capture before modifications
 */

import { writeFile, mkdir, unlink, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { getConfig } from '../../config/index.js';
import {
  stringifyFrontmatter,
  createDefaultFrontmatter,
  mergeFrontmatter,
} from '../../utils/frontmatter.js';
import { titleToFilename } from '../../utils/slugify.js';
import { logger } from '../../utils/logger.js';
import { readNote, noteExists, type ReadOptions } from './reader.js';
import { saveVersion, type HistoryConfig } from '../history/storage.js';
import type { Note, NoteFrontmatter } from '../../types/index.js';
import type { OperationType } from '../operations/tracker.js';

/**
 * Options for write operations
 */
export interface WriteOptions extends ReadOptions {
  // Extends ReadOptions to include vaultPath
}

/**
 * Options for version capture (Phase 028)
 */
export interface VersionCaptureOptions {
  /** Path to .palace directory */
  palaceDir?: string;
  /** Operation type for version metadata */
  operation?: OperationType | 'batch' | 'unknown';
  /** Operation mode (e.g., 'append', 'replace') */
  mode?: string;
  /** History configuration */
  historyConfig?: Partial<HistoryConfig>;
  /** Skip version capture */
  skipVersion?: boolean;
}

/**
 * Get the effective vault path from options or config
 */
function getVaultPath(options?: WriteOptions): string {
  return options?.vaultPath ?? getConfig().vaultPath;
}

/**
 * Ensure directory exists
 */
async function ensureDir(dirPath: string): Promise<void> {
  try {
    await mkdir(dirPath, { recursive: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }
  }
}

/**
 * Create a new note
 */
export async function createNote(
  type: string,
  subPath: string,
  title: string,
  content: string,
  frontmatterOptions: Partial<NoteFrontmatter> = {},
  writeOptions?: WriteOptions
): Promise<Note> {
  const vaultPath = getVaultPath(writeOptions);

  // Build the path: {type}/{subPath}/{filename}.md
  // Phase 018: Use title-style filenames (Obsidian-native)
  const filename = titleToFilename(title);
  const relativePath = subPath
    ? join(type, subPath, filename)
    : join(type, filename);
  const fullPath = join(vaultPath, relativePath);

  // Ensure directory exists
  await ensureDir(dirname(fullPath));

  // Check if file already exists
  if (await noteExists(relativePath, writeOptions)) {
    throw new Error(`Note already exists: ${relativePath}`);
  }

  // Create frontmatter
  const frontmatter = mergeFrontmatter(
    createDefaultFrontmatter(type, frontmatterOptions.source, frontmatterOptions.confidence),
    frontmatterOptions
  );

  // Build markdown content with title
  const body = `# ${title}\n\n${content}`;
  const raw = stringifyFrontmatter(frontmatter, body);

  // Write file
  await writeFile(fullPath, raw, 'utf-8');
  logger.info(`Created note: ${relativePath}`);

  return {
    path: relativePath,
    filename,
    title,
    frontmatter,
    content: body,
    raw,
  };
}

/**
 * Update an existing note
 *
 * Phase 028: Added version capture before modification
 */
export async function updateNote(
  notePath: string,
  content: string,
  frontmatterUpdates: Partial<NoteFrontmatter> = {},
  writeOptions?: WriteOptions,
  versionOptions?: VersionCaptureOptions
): Promise<Note> {
  const vaultPath = getVaultPath(writeOptions);
  const fullPath = join(vaultPath, notePath);

  // Read existing note
  const existing = await readNote(notePath, writeOptions);
  if (!existing) {
    throw new Error(`Note not found: ${notePath}`);
  }

  // Phase 028: Save version before modifying
  if (versionOptions?.palaceDir && !versionOptions.skipVersion) {
    try {
      await saveVersion(
        versionOptions.palaceDir,
        notePath,
        existing.raw,
        versionOptions.operation ?? 'improve',
        versionOptions.mode,
        versionOptions.historyConfig
      );
    } catch (error) {
      // Log but don't fail the operation if version capture fails
      logger.warn(`Failed to save version for ${notePath}:`, error);
    }
  }

  // Merge frontmatter (will update modified timestamp)
  const frontmatter = mergeFrontmatter(existing.frontmatter, frontmatterUpdates);

  // Build new content
  const raw = stringifyFrontmatter(frontmatter, content);

  // Write file
  await writeFile(fullPath, raw, 'utf-8');
  logger.info(`Updated note: ${notePath}`);

  return {
    path: notePath,
    filename: existing.filename,
    title: existing.title,
    frontmatter,
    content,
    raw,
  };
}

/**
 * Append content to an existing note
 *
 * Phase 028: Passes through version options
 */
export async function appendToNote(
  notePath: string,
  content: string,
  writeOptions?: WriteOptions,
  versionOptions?: VersionCaptureOptions
): Promise<Note> {
  const existing = await readNote(notePath, writeOptions);
  if (!existing) {
    throw new Error(`Note not found: ${notePath}`);
  }

  const newContent = `${existing.content}\n\n${content}`;
  return updateNote(
    notePath,
    newContent,
    {},
    writeOptions,
    versionOptions ? { ...versionOptions, mode: 'append' } : undefined
  );
}

/**
 * Update only the frontmatter of a note
 *
 * Phase 028: Passes through version options
 */
export async function updateFrontmatter(
  notePath: string,
  updates: Partial<NoteFrontmatter>,
  writeOptions?: WriteOptions,
  versionOptions?: VersionCaptureOptions
): Promise<Note> {
  const existing = await readNote(notePath, writeOptions);
  if (!existing) {
    throw new Error(`Note not found: ${notePath}`);
  }

  return updateNote(
    notePath,
    existing.content,
    updates,
    writeOptions,
    versionOptions ? { ...versionOptions, mode: 'frontmatter' } : undefined
  );
}

/**
 * Delete a note
 *
 * Phase 028: Optionally saves version before deletion for undo capability
 */
export async function deleteNote(
  notePath: string,
  writeOptions?: WriteOptions,
  versionOptions?: VersionCaptureOptions
): Promise<void> {
  const vaultPath = getVaultPath(writeOptions);
  const fullPath = join(vaultPath, notePath);

  // Phase 028: Save version before deletion for undo capability
  if (versionOptions?.palaceDir && !versionOptions.skipVersion) {
    try {
      // Read the file content before deletion
      if (existsSync(fullPath)) {
        const content = await readFile(fullPath, 'utf-8');
        await saveVersion(
          versionOptions.palaceDir,
          notePath,
          content,
          'delete',
          undefined,
          versionOptions.historyConfig
        );
      }
    } catch (error) {
      // Log but don't fail the operation if version capture fails
      logger.warn(`Failed to save version before deletion for ${notePath}:`, error);
    }
  }

  try {
    await unlink(fullPath);
    logger.info(`Deleted note: ${notePath}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Note not found: ${notePath}`);
    }
    throw error;
  }
}
