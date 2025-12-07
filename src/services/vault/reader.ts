/**
 * Vault file reading operations
 */

import { readFile, readdir, stat } from 'fs/promises';
import { join, extname, basename } from 'path';
import { getConfig } from '../../config/index.js';
import { parseFrontmatter } from '../../utils/frontmatter.js';
import { extractTitle } from '../../utils/markdown.js';
import { titleFromFilename } from '../../utils/slugify.js';
import { logger } from '../../utils/logger.js';
import {
  shouldIgnore,
  mergeIgnorePatterns,
  DEFAULT_IGNORE_PATTERNS,
} from './ignore.js';
import type {
  Note,
  NoteMetadata,
  DirectoryEntry,
  VaultIgnoreConfig,
} from '../../types/index.js';

/**
 * Options for read operations
 */
export interface ReadOptions {
  vaultPath?: string;
  ignoreConfig?: VaultIgnoreConfig;
}

/**
 * Default ignore config for when none is provided
 */
const defaultIgnoreConfig: VaultIgnoreConfig = {
  patterns: DEFAULT_IGNORE_PATTERNS,
  marker_file: '.palace-ignore',
  frontmatter_key: 'palace_ignore',
};

/**
 * Get the effective vault path from options or config
 */
function getVaultPath(options?: ReadOptions): string {
  return options?.vaultPath ?? getConfig().vaultPath;
}

/**
 * Get the effective ignore config
 */
function getIgnoreConfig(options?: ReadOptions): VaultIgnoreConfig {
  if (options?.ignoreConfig) {
    return {
      ...options.ignoreConfig,
      patterns: mergeIgnorePatterns(options.ignoreConfig.patterns),
    };
  }
  return defaultIgnoreConfig;
}

/**
 * Read a single note by path
 */
export async function readNote(
  notePath: string,
  options?: ReadOptions
): Promise<Note | null> {
  const vaultPath = getVaultPath(options);
  const fullPath = join(vaultPath, notePath);

  try {
    const raw = await readFile(fullPath, 'utf-8');
    const { frontmatter, body } = parseFrontmatter(raw);

    // Check if note should be ignored (layer 3: frontmatter)
    const ignoreConfig = getIgnoreConfig(options);
    const ignoreResult = shouldIgnore(fullPath, vaultPath, ignoreConfig, frontmatter);
    if (ignoreResult.ignored) {
      logger.debug(`Note ignored (${ignoreResult.reason}): ${notePath}`);
      return null;
    }

    // Extract or derive title
    const title = extractTitle(body) ?? titleFromFilename(basename(notePath));

    return {
      path: notePath,
      filename: basename(notePath),
      title,
      frontmatter: frontmatter as Note['frontmatter'],
      content: body,
      raw,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    logger.error(`Failed to read note: ${notePath}`, error);
    throw error;
  }
}

/**
 * Read multiple notes by paths
 */
export async function readNotes(
  paths: string[],
  options?: ReadOptions
): Promise<Note[]> {
  const notes = await Promise.all(paths.map((p) => readNote(p, options)));
  return notes.filter((note): note is Note => note !== null);
}

/**
 * List all markdown files in a directory
 */
export async function listNotes(
  dirPath = '',
  recursive = false,
  options?: ReadOptions
): Promise<NoteMetadata[]> {
  const vaultPath = getVaultPath(options);
  const ignoreConfig = getIgnoreConfig(options);
  const fullPath = join(vaultPath, dirPath);
  const notes: NoteMetadata[] = [];

  try {
    const entries = await readdir(fullPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = join(dirPath, entry.name);
      const fullEntryPath = join(vaultPath, entryPath);

      // Check ignore patterns for directories and files
      const ignoreResult = shouldIgnore(fullEntryPath, vaultPath, ignoreConfig);
      if (ignoreResult.ignored) {
        logger.debug(`Skipping ignored: ${entryPath} (${ignoreResult.reason})`);
        continue;
      }

      if (entry.isDirectory()) {
        // Skip hidden directories
        if (entry.name.startsWith('.')) {
          continue;
        }

        if (recursive) {
          const subNotes = await listNotes(entryPath, true, options);
          notes.push(...subNotes);
        }
      } else if (entry.isFile() && extname(entry.name) === '.md') {
        const note = await readNote(entryPath, options);
        if (note) {
          notes.push({
            path: note.path,
            filename: note.filename,
            title: note.title,
            frontmatter: note.frontmatter,
          });
        }
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.error(`Failed to list notes in: ${dirPath}`, error);
      throw error;
    }
  }

  return notes;
}

/**
 * Get directory structure as a tree
 */
export async function getDirectoryTree(
  dirPath = '',
  depth = 3,
  options?: ReadOptions
): Promise<DirectoryEntry[]> {
  if (depth <= 0) return [];

  const vaultPath = getVaultPath(options);
  const ignoreConfig = getIgnoreConfig(options);
  const fullPath = join(vaultPath, dirPath);
  const entries: DirectoryEntry[] = [];

  try {
    const items = await readdir(fullPath, { withFileTypes: true });

    for (const item of items) {
      // Skip hidden items
      if (item.name.startsWith('.')) continue;

      const itemPath = join(dirPath, item.name);
      const fullItemPath = join(vaultPath, itemPath);

      // Check ignore patterns
      const ignoreResult = shouldIgnore(fullItemPath, vaultPath, ignoreConfig);
      if (ignoreResult.ignored) {
        continue;
      }

      if (item.isDirectory()) {
        const children = await getDirectoryTree(itemPath, depth - 1, options);
        entries.push({
          name: item.name,
          path: itemPath,
          type: 'directory',
          children,
        });
      } else if (extname(item.name) === '.md') {
        entries.push({
          name: item.name,
          path: itemPath,
          type: 'file',
        });
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  return entries;
}

/**
 * Check if a note exists
 */
export async function noteExists(
  notePath: string,
  options?: ReadOptions
): Promise<boolean> {
  const vaultPath = getVaultPath(options);
  const fullPath = join(vaultPath, notePath);

  try {
    await stat(fullPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Find a note by title (case-insensitive)
 */
export async function findNoteByTitle(
  title: string,
  options?: ReadOptions
): Promise<Note | null> {
  const allNotes = await listNotes('', true, options);
  const normalizedTitle = title.toLowerCase();

  for (const meta of allNotes) {
    if (meta.title.toLowerCase() === normalizedTitle) {
      return readNote(meta.path, options);
    }

    // Also check aliases
    if (meta.frontmatter.aliases) {
      for (const alias of meta.frontmatter.aliases) {
        if (alias.toLowerCase() === normalizedTitle) {
          return readNote(meta.path, options);
        }
      }
    }
  }

  return null;
}
