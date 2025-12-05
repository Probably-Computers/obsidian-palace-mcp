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
import type { Note, NoteMetadata, DirectoryEntry } from '../../types/index.js';

/**
 * Read a single note by path
 */
export async function readNote(notePath: string): Promise<Note | null> {
  const config = getConfig();
  const fullPath = join(config.vaultPath, notePath);

  try {
    const raw = await readFile(fullPath, 'utf-8');
    const { frontmatter, body } = parseFrontmatter(raw);

    // Extract or derive title
    const title =
      extractTitle(body) ?? titleFromFilename(basename(notePath));

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
export async function readNotes(paths: string[]): Promise<Note[]> {
  const notes = await Promise.all(paths.map(readNote));
  return notes.filter((note): note is Note => note !== null);
}

/**
 * List all markdown files in a directory
 */
export async function listNotes(
  dirPath = '',
  recursive = false
): Promise<NoteMetadata[]> {
  const config = getConfig();
  const fullPath = join(config.vaultPath, dirPath);
  const notes: NoteMetadata[] = [];

  try {
    const entries = await readdir(fullPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = join(dirPath, entry.name);

      if (entry.isDirectory()) {
        // Skip hidden directories and .obsidian
        if (entry.name.startsWith('.') || entry.name === '.obsidian') {
          continue;
        }

        if (recursive) {
          const subNotes = await listNotes(entryPath, true);
          notes.push(...subNotes);
        }
      } else if (entry.isFile() && extname(entry.name) === '.md') {
        const note = await readNote(entryPath);
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
  depth = 3
): Promise<DirectoryEntry[]> {
  if (depth <= 0) return [];

  const config = getConfig();
  const fullPath = join(config.vaultPath, dirPath);
  const entries: DirectoryEntry[] = [];

  try {
    const items = await readdir(fullPath, { withFileTypes: true });

    for (const item of items) {
      // Skip hidden items and .obsidian
      if (item.name.startsWith('.')) continue;

      const itemPath = join(dirPath, item.name);

      if (item.isDirectory()) {
        const children = await getDirectoryTree(itemPath, depth - 1);
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
export async function noteExists(notePath: string): Promise<boolean> {
  const config = getConfig();
  const fullPath = join(config.vaultPath, notePath);

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
export async function findNoteByTitle(title: string): Promise<Note | null> {
  const allNotes = await listNotes('', true);
  const normalizedTitle = title.toLowerCase();

  for (const meta of allNotes) {
    if (meta.title.toLowerCase() === normalizedTitle) {
      return readNote(meta.path);
    }

    // Also check aliases
    if (meta.frontmatter.aliases) {
      for (const alias of meta.frontmatter.aliases) {
        if (alias.toLowerCase() === normalizedTitle) {
          return readNote(meta.path);
        }
      }
    }
  }

  return null;
}
