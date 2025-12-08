/**
 * Vault file writing operations
 */

import { writeFile, mkdir, unlink } from 'fs/promises';
import { join, dirname } from 'path';
import { getConfig } from '../../config/index.js';
import {
  stringifyFrontmatter,
  createDefaultFrontmatter,
  mergeFrontmatter,
} from '../../utils/frontmatter.js';
import { filenameFromTitle } from '../../utils/slugify.js';
import { logger } from '../../utils/logger.js';
import { readNote, noteExists, type ReadOptions } from './reader.js';
import type { Note, NoteFrontmatter } from '../../types/index.js';

/**
 * Options for write operations
 */
export interface WriteOptions extends ReadOptions {
  // Extends ReadOptions to include vaultPath
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
  const filename = filenameFromTitle(title);
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
 */
export async function updateNote(
  notePath: string,
  content: string,
  frontmatterUpdates: Partial<NoteFrontmatter> = {},
  writeOptions?: WriteOptions
): Promise<Note> {
  const vaultPath = getVaultPath(writeOptions);
  const fullPath = join(vaultPath, notePath);

  // Read existing note
  const existing = await readNote(notePath, writeOptions);
  if (!existing) {
    throw new Error(`Note not found: ${notePath}`);
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
 */
export async function appendToNote(
  notePath: string,
  content: string,
  writeOptions?: WriteOptions
): Promise<Note> {
  const existing = await readNote(notePath, writeOptions);
  if (!existing) {
    throw new Error(`Note not found: ${notePath}`);
  }

  const newContent = `${existing.content}\n\n${content}`;
  return updateNote(notePath, newContent, {}, writeOptions);
}

/**
 * Update only the frontmatter of a note
 */
export async function updateFrontmatter(
  notePath: string,
  updates: Partial<NoteFrontmatter>,
  writeOptions?: WriteOptions
): Promise<Note> {
  const existing = await readNote(notePath, writeOptions);
  if (!existing) {
    throw new Error(`Note not found: ${notePath}`);
  }

  return updateNote(notePath, existing.content, updates, writeOptions);
}

/**
 * Delete a note
 */
export async function deleteNote(
  notePath: string,
  writeOptions?: WriteOptions
): Promise<void> {
  const vaultPath = getVaultPath(writeOptions);
  const fullPath = join(vaultPath, notePath);

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
