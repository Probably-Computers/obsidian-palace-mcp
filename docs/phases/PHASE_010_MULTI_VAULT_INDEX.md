# Phase 010: Multi-Vault Index & Search

**Status**: Planning
**Start Date**: TBD
**Target Completion**: TBD
**Owner**: TBD

## Objectives

- Support multiple SQLite databases (one per vault)
- Implement cross-vault search aggregation
- Add vault-prefixed paths in search results
- Enable vault-aware indexing and sync
- Complete integration tests for multi-vault functionality

## Prerequisites

- [x] Phase 008 completed (Multi-Vault & Configuration)
- [ ] Phase 009 completed (Multi-Vault Tool Integration)
- [ ] Vault registry service with all tools updated
- [ ] Per-vault configuration loading

## Scope

### In Scope

- Per-vault SQLite database management
- Database location based on vault config
- Cross-vault search with result aggregation
- Vault-prefixed paths in all results
- Index synchronization per vault
- Vault-specific file watching
- Comprehensive integration tests

### Out of Scope

- Cross-vault linking resolution (future enhancement)
- Shared index for performance (complexity)
- Remote vault indexing
- Real-time cross-vault sync

## Tasks

### Per-Vault Database Architecture

- [ ] Update src/services/index/sqlite.ts
  - [ ] Support multiple database connections
  - [ ] Database path from vault config or default
  - [ ] Connection pool per vault
  - [ ] Lazy initialization on first access
- [ ] Create src/services/index/manager.ts
  - [ ] VaultIndexManager class
  - [ ] getIndex(vault: string) -> Database
  - [ ] initializeAllVaults()
  - [ ] closeAllConnections()
- [ ] Handle database migrations per vault
  - [ ] Track schema version per database
  - [ ] Run migrations on vault access
  - [ ] Handle migration failures gracefully

### Database Location Strategy

- [ ] Define database path resolution
  - [ ] Default: {vault}/.palace/index.sqlite
  - [ ] Override via vault config: index_path
  - [ ] Override via PALACE_INDEX_PATH (legacy single vault)
- [ ] Ensure .palace directory exists
- [ ] Handle permission errors

### Cross-Vault Search

- [ ] Update src/services/index/query.ts
  - [ ] searchAllVaults(query, options) -> AggregatedResults
  - [ ] Parallel search across vault databases
  - [ ] Merge and rank results
  - [ ] Respect vault order/priority
- [ ] Add vault field to search results
- [ ] Support vault filter in search options
  - [ ] Single vault: vault: "work"
  - [ ] Multiple vaults: vaults: ["work", "personal"]
  - [ ] Exclude vaults: exclude_vaults: ["vendor"]

### Result Aggregation

- [ ] Create src/services/index/aggregator.ts
  - [ ] Merge results from multiple vaults
  - [ ] Unified BM25 ranking across vaults
  - [ ] Deduplicate if same note in multiple vaults (unlikely)
  - [ ] Apply global limit after merge
  - [ ] Preserve vault attribution

### Vault-Prefixed Paths

- [ ] Update result format
  - [ ] path: "vault:work/notes/topic.md" for cross-vault
  - [ ] path: "notes/topic.md" for single-vault queries
- [ ] Add vault_path (original) and prefixed_path fields
- [ ] Update palace_recall output
- [ ] Update palace_query output
- [ ] Update palace_list output

### Index Synchronization

- [ ] Update src/services/index/sync.ts
  - [ ] Sync single vault: syncVault(alias)
  - [ ] Sync all vaults: syncAllVaults()
  - [ ] Track sync state per vault
  - [ ] Handle vault unavailable gracefully
- [ ] Respect ignore patterns during sync
- [ ] Track last sync time per vault

### Vault-Specific File Watching

- [ ] Update src/services/vault/watcher.ts
  - [ ] Watch multiple vault directories
  - [ ] Route events to correct database
  - [ ] Handle vault added/removed
- [ ] Respect watch_enabled per vault
- [ ] Handle watcher errors per vault

### palace_recall Updates

- [ ] Support cross-vault search
  - [ ] Default: search all vaults if cross_vault.search enabled
  - [ ] vault param: search single vault
  - [ ] vaults param: search specific vaults
- [ ] Include vault alias in results
- [ ] Update result ranking for cross-vault

### palace_query Updates

- [ ] Support cross-vault queries
- [ ] Aggregate results from multiple indexes
- [ ] Include vault in output

### Testing

- [ ] Create tests/integration/multi-vault-index.test.ts
  - [ ] Test per-vault database creation
  - [ ] Test cross-vault search
  - [ ] Test result aggregation
  - [ ] Test vault-prefixed paths
  - [ ] Test index sync per vault
- [ ] Create tests/unit/services/index/manager.test.ts
  - [ ] Test database initialization
  - [ ] Test connection management
  - [ ] Test error handling
- [ ] Create tests/unit/services/index/aggregator.test.ts
  - [ ] Test result merging
  - [ ] Test ranking across vaults
  - [ ] Test limit application
- [ ] Update existing index tests
  - [ ] Ensure backward compatibility
  - [ ] Test single vault mode

### Documentation

- [ ] Update CLAUDE.md with multi-vault search info
- [ ] Document database location strategy
- [ ] Document cross-vault search behavior
- [ ] Add performance considerations

## Standards & References

- [CLAUDE.md](../../CLAUDE.md) - Project guidelines
- [v2.0 Specification](../obsidian-palace-mcp-spec-v2.md) - Section 7
- [Git Workflow Standards](../GIT_WORKFLOW_STANDARDS.md)
- [Phase 008](./PHASE_008_MULTI_VAULT_CONFIG.md) - Multi-Vault Configuration
- [Phase 009](./PHASE_009_MULTI_VAULT_TOOLS.md) - Multi-Vault Tool Integration

## Technical Details

### Per-Vault Database Manager

```typescript
// src/services/index/manager.ts
import Database from 'better-sqlite3';
import { getVaultRegistry } from '../vault/registry';

class VaultIndexManager {
  private connections: Map<string, Database.Database> = new Map();

  getIndex(vaultAlias: string): Database.Database {
    if (this.connections.has(vaultAlias)) {
      return this.connections.get(vaultAlias)!;
    }

    const registry = getVaultRegistry();
    const vault = registry.getVault(vaultAlias);
    if (!vault) {
      throw new Error(`Vault not found: ${vaultAlias}`);
    }

    const dbPath = vault.config.index_path ||
      join(vault.path, '.palace', 'index.sqlite');

    const db = initializeDatabase(dbPath);
    this.connections.set(vaultAlias, db);
    return db;
  }

  getAllIndexes(): Map<string, Database.Database> {
    const registry = getVaultRegistry();
    for (const vault of registry.listVaults()) {
      this.getIndex(vault.alias);
    }
    return this.connections;
  }

  close(): void {
    for (const db of this.connections.values()) {
      db.close();
    }
    this.connections.clear();
  }
}

let manager: VaultIndexManager | null = null;

export function getIndexManager(): VaultIndexManager {
  if (!manager) {
    manager = new VaultIndexManager();
  }
  return manager;
}
```

### Cross-Vault Search

```typescript
// src/services/index/query.ts
interface CrossVaultSearchOptions {
  query: string;
  vaults?: string[];        // Limit to specific vaults
  exclude_vaults?: string[]; // Exclude specific vaults
  limit?: number;
  include_content?: boolean;
}

interface CrossVaultResult {
  vault: string;
  vault_path: string;       // Original path within vault
  prefixed_path: string;    // vault:alias/path format
  title: string;
  score: number;
  // ... other fields
}

async function searchAllVaults(
  options: CrossVaultSearchOptions
): Promise<CrossVaultResult[]> {
  const registry = getVaultRegistry();
  const globalConfig = registry.getGlobalConfig();

  if (!globalConfig.cross_vault.search) {
    // Cross-vault search disabled, use default vault only
    const defaultVault = registry.getDefaultVault();
    return searchVault(defaultVault.alias, options);
  }

  const vaults = options.vaults ||
    registry.listVaults()
      .filter(v => !options.exclude_vaults?.includes(v.alias))
      .map(v => v.alias);

  // Search all vaults in parallel
  const results = await Promise.all(
    vaults.map(alias => searchVault(alias, options))
  );

  // Aggregate and rank
  return aggregateResults(results.flat(), options.limit);
}
```

### Result Aggregation

```typescript
// src/services/index/aggregator.ts
interface VaultResult {
  vault: string;
  score: number;
  // ... other fields
}

function aggregateResults(
  results: VaultResult[],
  limit: number = 20
): VaultResult[] {
  // Sort by score descending
  const sorted = results.sort((a, b) => b.score - a.score);

  // Apply limit
  return sorted.slice(0, limit);
}
```

### Vault-Prefixed Path Format

```
Single vault query:
  path: "notes/topic.md"

Cross-vault query:
  vault: "work"
  vault_path: "notes/topic.md"
  prefixed_path: "vault:work/notes/topic.md"
```

### Files to Create/Modify

```
src/services/index/
├── manager.ts          # New: vault database manager
├── aggregator.ts       # New: result aggregation
├── sqlite.ts           # Update: support multiple DBs
├── query.ts            # Update: cross-vault search
├── sync.ts             # Update: per-vault sync
└── index.ts            # Update: exports

src/services/vault/
└── watcher.ts          # Update: multi-vault watching

tests/
├── unit/
│   └── services/
│       └── index/
│           ├── manager.test.ts     # New
│           └── aggregator.test.ts  # New
└── integration/
    └── multi-vault-index.test.ts   # New
```

## Testing & Quality Assurance

### Test Coverage Requirements

| Area | Target |
|------|--------|
| Database manager | 90% |
| Cross-vault search | 85% |
| Result aggregation | 90% |
| Vault-prefixed paths | 85% |
| Integration tests | 80% |

### Test Scenarios

1. **Single vault mode** - Backward compatible
2. **Multiple vaults** - Each gets own database
3. **Cross-vault search** - Results from all vaults
4. **Vault filtering** - Search specific vaults only
5. **Result ranking** - Consistent across vaults
6. **Vault unavailable** - Graceful degradation
7. **Index sync** - Per-vault synchronization

### Quality Checks

- [ ] All tests passing
- [ ] No TypeScript errors
- [ ] Linting passes
- [ ] Performance acceptable with multiple databases
- [ ] Memory usage reasonable
- [ ] Backward compatible with single vault

## Acceptance Criteria

- [ ] Each vault has separate SQLite database
- [ ] Database location configurable per vault
- [ ] Cross-vault search aggregates results
- [ ] Results include vault attribution
- [ ] Vault-prefixed paths in cross-vault results
- [ ] Index sync works per vault
- [ ] File watcher handles multiple vaults
- [ ] Backward compatible with single vault setup
- [ ] All tests passing

## Risks & Mitigation

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| Memory with many DBs | Medium | Medium | Lazy loading, connection limits |
| Cross-vault ranking | Medium | Medium | Unified BM25 scoring |
| Complex testing | High | Medium | Comprehensive fixtures |
| Migration complexity | Medium | Low | Per-vault migration tracking |

## Notes & Decisions

*To be filled during implementation*
