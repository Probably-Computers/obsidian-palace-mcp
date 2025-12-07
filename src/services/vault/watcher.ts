/**
 * Multi-vault file system watcher using chokidar
 * Monitors vaults for external changes and triggers index updates
 */

import chokidar from 'chokidar';
import { extname, relative } from 'path';
import { getVaultRegistry } from './registry.js';
import { getIndexManager } from '../index/manager.js';
import { indexNote, removeFromIndex } from '../index/sync.js';
import { logger } from '../../utils/logger.js';
import { readNote } from './reader.js';
import type { ResolvedVault } from '../../types/index.js';

/**
 * Vault watcher entry
 */
interface VaultWatcher {
  vault: ResolvedVault;
  watcher: chokidar.FSWatcher;
  debounceMap: Map<string, NodeJS.Timeout>;
}

// Map of vault alias to watcher
const watchers = new Map<string, VaultWatcher>();

const DEBOUNCE_MS = 300;

/**
 * Debounce file change handling for a vault
 */
function debounce(entry: VaultWatcher, path: string, callback: () => void): void {
  const existing = entry.debounceMap.get(path);
  if (existing) {
    clearTimeout(existing);
  }

  const timeout = setTimeout(() => {
    entry.debounceMap.delete(path);
    callback();
  }, DEBOUNCE_MS);

  entry.debounceMap.set(path, timeout);
}

/**
 * Handle file add/change event for a vault
 */
async function handleFileChange(vault: ResolvedVault, fullPath: string): Promise<void> {
  const relativePath = relative(vault.path, fullPath);

  logger.debug(`File changed in ${vault.alias}: ${relativePath}`);

  try {
    const note = await readNote(relativePath, { vaultPath: vault.path });
    if (note) {
      const manager = getIndexManager();
      const db = await manager.getIndex(vault.alias);
      indexNote(db, note);
    }
  } catch (error) {
    logger.error(`Failed to index file in ${vault.alias}: ${relativePath}`, error);
  }
}

/**
 * Handle file delete event for a vault
 */
async function handleFileDelete(vault: ResolvedVault, fullPath: string): Promise<void> {
  const relativePath = relative(vault.path, fullPath);

  logger.debug(`File deleted in ${vault.alias}: ${relativePath}`);

  try {
    const manager = getIndexManager();
    const db = await manager.getIndex(vault.alias);
    removeFromIndex(db, relativePath);
  } catch (error) {
    logger.error(`Failed to remove from index in ${vault.alias}: ${relativePath}`, error);
  }
}

/**
 * Build ignore patterns for a vault
 */
function getIgnorePatterns(vault: ResolvedVault): (string | RegExp)[] {
  const patterns: (string | RegExp)[] = [
    /(^|[/\\])\../, // Ignore dotfiles
    '**/node_modules/**',
    '**/.obsidian/**',
    '**/.palace/**',
  ];

  // Add vault-specific ignore patterns
  if (vault.config.ignore?.patterns) {
    for (const pattern of vault.config.ignore.patterns) {
      patterns.push(`**/${pattern}`);
    }
  }

  return patterns;
}

/**
 * Start watching a single vault
 */
export function startVaultWatcher(vault: ResolvedVault): void {
  if (watchers.has(vault.alias)) {
    logger.warn(`Watcher already running for vault: ${vault.alias}`);
    return;
  }

  logger.info(`Starting file watcher for vault '${vault.alias}' at: ${vault.path}`);

  const watcher = chokidar.watch(vault.path, {
    ignored: getIgnorePatterns(vault),
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 200,
      pollInterval: 100,
    },
  });

  const entry: VaultWatcher = {
    vault,
    watcher,
    debounceMap: new Map(),
  };

  watcher
    .on('add', (path) => {
      if (extname(path) !== '.md') return;
      debounce(entry, path, () => handleFileChange(vault, path));
    })
    .on('change', (path) => {
      if (extname(path) !== '.md') return;
      debounce(entry, path, () => handleFileChange(vault, path));
    })
    .on('unlink', (path) => {
      if (extname(path) !== '.md') return;
      handleFileDelete(vault, path);
    })
    .on('error', (error) => {
      logger.error(`Watcher error for vault ${vault.alias}:`, error);
    })
    .on('ready', () => {
      logger.info(`File watcher ready for vault: ${vault.alias}`);
    });

  watchers.set(vault.alias, entry);
}

/**
 * Stop watching a single vault
 */
export async function stopVaultWatcher(vaultAlias: string): Promise<void> {
  const entry = watchers.get(vaultAlias);
  if (entry) {
    await entry.watcher.close();

    // Clear any pending debounces
    for (const timeout of entry.debounceMap.values()) {
      clearTimeout(timeout);
    }
    entry.debounceMap.clear();

    watchers.delete(vaultAlias);
    logger.info(`File watcher stopped for vault: ${vaultAlias}`);
  }
}

/**
 * Start watching all vaults
 */
export function startAllWatchers(): void {
  const registry = getVaultRegistry();
  const globalConfig = registry.getGlobalConfig();

  if (!globalConfig.settings.watch_enabled) {
    logger.info('File watchers disabled by configuration');
    return;
  }

  for (const vault of registry.listVaults()) {
    try {
      startVaultWatcher(vault);
    } catch (error) {
      logger.error(`Failed to start watcher for vault ${vault.alias}:`, error);
    }
  }
}

/**
 * Stop all watchers
 */
export async function stopAllWatchers(): Promise<void> {
  const aliases = Array.from(watchers.keys());
  for (const alias of aliases) {
    await stopVaultWatcher(alias);
  }
  logger.info('All file watchers stopped');
}

/**
 * Check if a vault is being watched
 */
export function isVaultWatched(vaultAlias: string): boolean {
  return watchers.has(vaultAlias);
}

/**
 * List all watched vault aliases
 */
export function listWatchedVaults(): string[] {
  return Array.from(watchers.keys());
}

/**
 * Perform initial scan and index for a vault
 */
export async function performVaultScan(vault: ResolvedVault): Promise<number> {
  const { listNotes } = await import('./reader.js');
  const manager = getIndexManager();
  const db = await manager.getIndex(vault.alias);

  logger.info(`Performing initial scan for vault: ${vault.alias}`);

  const allNotes = await listNotes('', true, { vaultPath: vault.path });
  let indexed = 0;

  for (const meta of allNotes) {
    try {
      const note = await readNote(meta.path, { vaultPath: vault.path });
      if (note) {
        indexNote(db, note);
        indexed++;
      }
    } catch (error) {
      logger.error(`Failed to index in ${vault.alias}: ${meta.path}`, error);
    }
  }

  logger.info(`Vault scan complete for ${vault.alias}: ${indexed} notes indexed`);
  return indexed;
}

/**
 * Perform initial scan for all vaults
 */
export async function performAllVaultScans(): Promise<Map<string, number>> {
  const registry = getVaultRegistry();
  const results = new Map<string, number>();

  for (const vault of registry.listVaults()) {
    try {
      const count = await performVaultScan(vault);
      results.set(vault.alias, count);
    } catch (error) {
      logger.error(`Failed to scan vault ${vault.alias}:`, error);
      results.set(vault.alias, 0);
    }
  }

  return results;
}
