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
