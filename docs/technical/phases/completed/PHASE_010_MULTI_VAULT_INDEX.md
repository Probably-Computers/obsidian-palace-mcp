# Phase 010: Multi-Vault Index & Search

**Status**: Complete
**Start Date**: 2025-12-07
**Completion Date**: 2025-12-07
**Owner**: Claude

## Objectives

- Support multiple SQLite databases (one per vault)
- Implement cross-vault search aggregation
- Add vault-prefixed paths in search results
- Enable vault-aware indexing and sync
- Complete integration tests for multi-vault functionality

## Prerequisites

- [x] Phase 008 completed (Multi-Vault & Configuration)
- [x] Phase 009 completed (Multi-Vault Tool Integration)
- [x] Vault registry service with all tools updated
- [x] Per-vault configuration loading

## Scope

### In Scope

- Per-vault SQLite database management
- Database location based on vault config
- Cross-vault search with result aggregation
- Vault-prefixed paths in all results
- Index synchronization per vault
- Vault-specific file watching
- Comprehensive integration tests

### Out of Scope (By Design)

- **Cross-vault linking** - NOT planned; vaults are isolated brains
- **Shared index** - NOT planned; each vault maintains its own index
- **Knowledge mixing** - NOT planned; vaults never share or reference content
- Remote vault indexing - Future consideration
- Real-time sync between vaults - Not needed due to isolation

## Tasks

### Per-Vault Database Architecture

- [x] Update src/services/index/sqlite.ts
  - [x] Removed singleton pattern, now provides schema and initialization helpers
  - [x] createDatabase(dbPath) for creating new databases
  - [x] initializeSchema(db) for schema initialization
- [x] Create src/services/index/manager.ts
  - [x] VaultIndexManager class
  - [x] getIndex(vaultAlias) -> Database
  - [x] getIndexSync(vaultAlias) -> Database
  - [x] initializeAllVaults()
  - [x] closeAll()
- [x] Handle database migrations per vault
  - [x] Track schema version per database
  - [x] Run migrations on vault access
  - [x] Handle migration failures gracefully

### Database Location Strategy

- [x] Define database path resolution
  - [x] Default: {vault}/.palace/index.sqlite
  - [x] Ensure .palace directory exists
- [x] Handle permission errors with proper logging

### Cross-Vault Search

- [x] Update src/services/index/query.ts
  - [x] searchNotesInVault(db, options) -> SearchResult[]
  - [x] searchAllVaults(options) -> VaultSearchResult[]
  - [x] Parallel search across vault databases
  - [x] Merge and rank results
- [x] Add vault field to search results
- [x] Support vault filter in search options
  - [x] Single vault: vault parameter
  - [x] Multiple vaults: vaults array
  - [x] Exclude vaults: excludeVaults array

### Result Aggregation

- [x] Create src/services/index/aggregator.ts
  - [x] aggregateSearchResults() for search result merging
  - [x] aggregateQueryResults() for query result merging
  - [x] Unified BM25 ranking across vaults
  - [x] Apply global limit after merge
  - [x] Preserve vault attribution

### Vault-Prefixed Paths

- [x] Update result format
  - [x] VaultSearchResult with vault, vaultPath, prefixedPath
  - [x] VaultQueryResult with vault, vaultPath, prefixedPath
- [x] Update palace_recall output
- [x] Update palace_query output

### Index Synchronization

- [x] Update src/services/index/sync.ts
  - [x] indexNote(db, note) with db parameter
  - [x] removeFromIndex(db, path) with db parameter
  - [x] syncVault(vaultAlias) for single vault sync
  - [x] syncAllVaults() for all vaults
- [x] Respect ignore patterns during sync

### Vault-Specific File Watching

- [x] Update src/services/vault/watcher.ts
  - [x] startVaultWatcher(vault) per vault
  - [x] stopVaultWatcher(vaultAlias)
  - [x] startAllWatchers() for all vaults
  - [x] stopAllWatchers() for cleanup
  - [x] performVaultScan(vault) for initial indexing
  - [x] performAllVaultScans() for all vaults

### palace_recall Updates

- [x] Support cross-vault search
  - [x] Default: search all vaults if cross_vault.search enabled
  - [x] vault param: search single vault
  - [x] vaults param: search specific vaults
  - [x] exclude_vaults param: exclude specific vaults
- [x] Include vault alias in results
- [x] Update result format with vault attribution

### palace_query Updates

- [x] Support cross-vault queries
- [x] Aggregate results from multiple indexes
- [x] Include vault in output

### Testing

- [x] Update existing tests for new multi-vault API
  - [x] tests/unit/services/index.test.ts - Updated to use db parameter
  - [x] tests/unit/services/graph.test.ts - Updated to use db parameter
  - [x] tests/integration/workflow.test.ts - Updated for new API
- [x] Existing tests/integration/multi-vault.test.ts passes

### Documentation

- [x] Update phase document with completion status
- [x] Document cross-vault search behavior in tool schemas

## Standards & References

- [CLAUDE.md](../../CLAUDE.md) - Project guidelines
- [v2.0 Specification](../obsidian-palace-mcp-spec-v2.md) - Section 7
- [Git Workflow Standards](../GIT_WORKFLOW_STANDARDS.md)
- [Phase 008](./PHASE_008_MULTI_VAULT_CONFIG.md) - Multi-Vault Configuration
- [Phase 009](./PHASE_009_MULTI_VAULT_TOOLS.md) - Multi-Vault Tool Integration

## Technical Details

### Per-Vault Database Manager

Created `src/services/index/manager.ts`:

```typescript
class VaultIndexManagerImpl {
  private connections: Map<string, ConnectionEntry> = new Map();

  async getIndex(vaultAlias: string): Promise<Database.Database>
  getIndexSync(vaultAlias: string): Database.Database
  async initializeAllVaults(): Promise<void>
  closeAll(): void
}

export function getIndexManager(): VaultIndexManagerImpl
export function resetIndexManager(): void
```

### Cross-Vault Search

Updated `src/services/index/query.ts`:

```typescript
// Single vault search
function searchNotesInVault(db: Database.Database, options: SearchOptions): SearchResult[]

// Cross-vault search
async function searchAllVaults(options: CrossVaultSearchOptions): Promise<VaultSearchResult[]>

// Single vault query
function queryNotesInVault(db: Database.Database, options: FilterOptions): NoteMetadata[]

// Cross-vault query
async function queryAllVaults(options: CrossVaultFilterOptions): Promise<VaultQueryResult[]>
```

### Result Aggregation

Created `src/services/index/aggregator.ts`:

```typescript
interface VaultSearchResult extends SearchResult {
  vault: string;
  vaultPath: string;
  prefixedPath: string;
}

interface VaultQueryResult {
  vault: string;
  vaultPath: string;
  prefixedPath: string;
  note: NoteMetadata;
}

function aggregateSearchResults(results: VaultSearchResult[], limit?: number): VaultSearchResult[]
function aggregateQueryResults(results: VaultQueryResult[], limit?: number): VaultQueryResult[]
```

### Files Created/Modified

```
src/services/index/
├── manager.ts          # New: vault database manager
├── aggregator.ts       # New: result aggregation
├── sqlite.ts           # Updated: removed singleton, schema helpers only
├── query.ts            # Updated: cross-vault search with db parameter
├── sync.ts             # Updated: per-vault sync with db parameter
└── index.ts            # Updated: exports

src/services/vault/
└── watcher.ts          # Updated: multi-vault watching

src/services/graph/
├── links.ts            # Updated: all functions take db parameter
└── relationships.ts    # Updated: all functions take db parameter

src/services/dataview/
└── executor.ts         # Updated: functions take db parameter

src/services/autolink/
├── scanner.ts          # Updated: functions take db parameter
└── aliases.ts          # Updated: functions take db parameter

src/tools/
├── recall.ts           # Updated: cross-vault search support
├── query.ts            # Updated: cross-vault query support
├── links.ts            # Updated: uses db from manager
├── related.ts          # Updated: uses db from manager
├── orphans.ts          # Updated: uses db from manager
├── autolink.ts         # Updated: uses db from manager
├── dataview.ts         # Updated: uses db from manager
├── remember.ts         # Updated: uses db from manager
├── update.ts           # Updated: uses db from manager
└── vaults.ts           # Updated: uses countNotesInVault

src/index.ts            # Updated: multi-vault initialization
```

## Testing & Quality Assurance

### Test Results

All 214 tests passing:
- Unit tests updated for new db parameter API
- Integration tests updated for new API
- Multi-vault integration tests passing

### Quality Checks

- [x] All tests passing (214/214)
- [x] No TypeScript errors
- [x] All functions accept db parameter instead of using singletons
- [x] Backward compatible with single vault setup (via default vault)

## Acceptance Criteria

- [x] Each vault has separate SQLite database
- [x] Database location default: {vault}/.palace/index.sqlite
- [x] Cross-vault search aggregates results
- [x] Results include vault attribution (vault, vaultPath, prefixedPath)
- [x] Index sync works per vault
- [x] File watcher handles multiple vaults
- [x] All tests passing

## Notes & Decisions

### Key Design Decisions

1. **No Backward Compatibility Code**: Following user guidance, removed all legacy singleton patterns. All functions now require explicit database parameter.

2. **VaultIndexManager Pattern**: Central manager handles database connections per vault with lazy initialization.

3. **Consistent Parameter Ordering**: All functions that work with databases take `db` as first parameter.

4. **Cross-Vault Search Default**: When `cross_vault.search` is enabled in global config, searches default to all vaults.

5. **Result Attribution**: Cross-vault results always include `vault`, `vaultPath`, and `prefixedPath` fields.

### Migration Notes

- All services updated to accept `db: Database.Database` parameter
- Tests updated to create databases directly using `createDatabase()` and `initializeSchema()`
- Main entry point (`src/index.ts`) initializes all vaults at startup

## Architecture Principle: Vault Isolation

**Each vault is a completely separate "brain" - an independent memory palace.**

Key principles:
- Vaults are **never aware of one another**
- Knowledge is **not mixed between vaults**
- Cross-vault linking is **explicitly NOT supported** by design
- Each vault maintains its own index, relationships, and knowledge graph
- When AI acquires new knowledge and is uncertain about which vault it belongs to, **it should ask the user**

This isolation ensures:
- Clean separation of concerns (work vs personal, different projects, etc.)
- No accidental knowledge leakage between contexts
- Each vault can have its own structure, standards, and purpose
- AI can access multiple vaults but treats each as independent

The "cross-vault search" feature in this phase allows searching multiple vaults simultaneously, but results are **always attributed to their source vault** and remain logically separate.
