/**
 * File system watcher using chokidar
 * Monitors vault for external changes and triggers index updates
 */

import chokidar from 'chokidar';
import { extname, relative } from 'path';
import { getConfig } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { readNote } from './reader.js';
import { indexNote, removeFromIndex } from '../index/index.js';

// Watcher instance
let watcher: chokidar.FSWatcher | null = null;

// Debounce map for rapid changes
const debounceMap = new Map<string, NodeJS.Timeout>();
const DEBOUNCE_MS = 300;

/**
 * Debounce file change handling
 */
function debounce(path: string, callback: () => void): void {
  const existing = debounceMap.get(path);
  if (existing) {
    clearTimeout(existing);
  }

  const timeout = setTimeout(() => {
    debounceMap.delete(path);
    callback();
  }, DEBOUNCE_MS);

  debounceMap.set(path, timeout);
}

/**
 * Handle file add/change event
 */
async function handleFileChange(fullPath: string): Promise<void> {
  const config = getConfig();
  const relativePath = relative(config.vaultPath, fullPath);

  logger.debug(`File changed: ${relativePath}`);

  try {
    const note = await readNote(relativePath);
    if (note) {
      indexNote(note);
    }
  } catch (error) {
    logger.error(`Failed to index file: ${relativePath}`, error);
  }
}

/**
 * Handle file delete event
 */
function handleFileDelete(fullPath: string): void {
  const config = getConfig();
  const relativePath = relative(config.vaultPath, fullPath);

  logger.debug(`File deleted: ${relativePath}`);
  removeFromIndex(relativePath);
}

/**
 * Start watching the vault for changes
 */
export function startWatcher(): void {
  const config = getConfig();

  if (!config.watchEnabled) {
    logger.info('File watcher disabled by configuration');
    return;
  }

  if (watcher) {
    logger.warn('Watcher already running');
    return;
  }

  logger.info(`Starting file watcher on: ${config.vaultPath}`);

  watcher = chokidar.watch(config.vaultPath, {
    ignored: [
      /(^|[/\\])\../, // Ignore dotfiles
      '**/node_modules/**',
      '**/.obsidian/**',
      '**/.palace/**',
    ],
    persistent: true,
    ignoreInitial: true, // Don't fire for existing files
    awaitWriteFinish: {
      stabilityThreshold: 200,
      pollInterval: 100,
    },
  });

  watcher
    .on('add', (path) => {
      if (extname(path) !== '.md') return;
      debounce(path, () => handleFileChange(path));
    })
    .on('change', (path) => {
      if (extname(path) !== '.md') return;
      debounce(path, () => handleFileChange(path));
    })
    .on('unlink', (path) => {
      if (extname(path) !== '.md') return;
      handleFileDelete(path);
    })
    .on('error', (error) => {
      logger.error('Watcher error:', error);
    })
    .on('ready', () => {
      logger.info('File watcher ready');
    });
}

/**
 * Stop the file watcher
 */
export async function stopWatcher(): Promise<void> {
  if (watcher) {
    await watcher.close();
    watcher = null;

    // Clear any pending debounces
    for (const timeout of debounceMap.values()) {
      clearTimeout(timeout);
    }
    debounceMap.clear();

    logger.info('File watcher stopped');
  }
}

/**
 * Check if watcher is running
 */
export function isWatcherRunning(): boolean {
  return watcher !== null;
}

/**
 * Perform initial vault scan and index all notes
 */
export async function performInitialScan(): Promise<number> {
  const { listNotes } = await import('./reader.js');

  logger.info('Performing initial vault scan...');

  const allNotes = await listNotes('', true);
  let indexed = 0;

  for (const meta of allNotes) {
    try {
      const note = await readNote(meta.path);
      if (note) {
        indexNote(note);
        indexed++;
      }
    } catch (error) {
      logger.error(`Failed to index: ${meta.path}`, error);
    }
  }

  logger.info(`Initial scan complete: ${indexed} notes indexed`);
  return indexed;
}
