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
} from './reader.js';

export {
  createNote,
  updateNote,
  appendToNote,
  updateFrontmatter,
  deleteNote,
} from './writer.js';

export {
  startWatcher,
  stopWatcher,
  isWatcherRunning,
  performInitialScan,
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
