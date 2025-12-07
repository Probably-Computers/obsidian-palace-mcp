/**
 * Vault service exports
 */

export {
  readNote,
  readNotes,
  listNotes,
  getDirectoryTree,
  noteExists,
  findNoteByTitle,
  type ReadOptions,
} from './reader.js';

export {
  createNote,
  updateNote,
  appendToNote,
  updateFrontmatter,
  deleteNote,
  type WriteOptions,
} from './writer.js';

export {
  startVaultWatcher,
  stopVaultWatcher,
  startAllWatchers,
  stopAllWatchers,
  isVaultWatched,
  listWatchedVaults,
  performVaultScan,
  performAllVaultScans,
} from './watcher.js';

export {
  getVaultRegistry,
  initializeRegistry,
  resetRegistry,
  resolveVaultPath,
  canWriteToVault,
  getDefaultVaultPath,
  getDefaultVaultAlias,
} from './registry.js';

export {
  shouldIgnore,
  matchesIgnorePatterns,
  hasIgnoreMarker,
  hasIgnoreMarkerInPath,
  hasIgnoreFrontmatter,
  createIgnoreFilter,
  mergeIgnorePatterns,
  DEFAULT_IGNORE_PATTERNS,
} from './ignore.js';
