/**
 * Index service exports
 */

// Database schema and initialization
export {
  SCHEMA_VERSION,
  SCHEMA_SQL,
  FTS_SQL,
  initializeSchema,
  createDatabase,
} from './sqlite.js';

// Vault index manager
export {
  getIndexManager,
  resetIndexManager,
  type VaultIndexManager,
} from './manager.js';

// Query functions
export {
  searchNotesInVault,
  searchAllVaults,
  queryNotesInVault,
  queryAllVaults,
  getNoteTags,
  getNoteByPath,
  countNotesInVault,
  countNotesAllVaults,
  type SearchOptions,
  type CrossVaultSearchOptions,
  type FilterOptions,
  type CrossVaultFilterOptions,
} from './query.js';

// Result aggregation
export {
  addVaultAttribution,
  addVaultAttributionToNote,
  aggregateSearchResults,
  aggregateQueryResults,
  deduplicateResults,
  filterByVaults,
  type VaultSearchResult,
  type VaultQueryResult,
} from './aggregator.js';

// Index synchronization
export {
  indexNote,
  removeFromIndex,
  needsReindex,
  getIndexedPaths,
  clearIndex,
  rebuildFtsIndex,
  getIndexStats,
  syncVault,
  syncAllVaults,
} from './sync.js';
