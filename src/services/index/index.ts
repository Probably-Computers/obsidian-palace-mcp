/**
 * Index service exports
 */

// Database management
export {
  getDatabase,
  getDatabaseSync,
  closeDatabase,
  resetDatabase,
} from './sqlite.js';

// Query functions
export {
  searchNotes,
  queryNotes,
  getNoteByPath,
  getNoteTags,
  countNotes,
  type SearchOptions,
  type FilterOptions,
} from './query.js';

// Index synchronization
export {
  indexNote,
  removeFromIndex,
  needsReindex,
  getIndexedPaths,
  clearIndex,
  rebuildFtsIndex,
  getIndexStats,
} from './sync.js';
