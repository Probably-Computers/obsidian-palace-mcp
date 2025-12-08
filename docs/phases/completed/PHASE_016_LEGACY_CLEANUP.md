# Phase 016: Legacy Cleanup

**Status**: Complete
**Start Date**: 2025-12-08
**Completion Date**: 2025-12-08
**Owner**: AI Assistant

## Objectives

- Remove all legacy/deprecated code since there is no prior release
- Simplify database schema to single version (no migrations needed)
- Remove backward compatibility code paths
- Clean up unused imports and dead code
- Ensure codebase is lean for initial v2.0 release

## Context

Since Obsidian Palace MCP has not had a public release, there is no need to maintain backward compatibility. Code was added during development to support both old and new patterns, but this complexity is unnecessary for a fresh release.

## Prerequisites

- [x] Phase 008-015 completed
- [x] All tests passing
- [x] Documentation complete

## Scope

### In Scope

- Remove deprecated tools (palace_remember, palace_update)
- Simplify SQLite schema to single version
- Remove migration code
- Remove legacy environment variable fallbacks
- Clean up unused imports and variables
- Remove any "backward compatible" code paths
- Update tool registrations
- Update documentation references
- Update tests to remove legacy tool tests

### Out of Scope

- New features
- Refactoring beyond cleanup
- Performance optimization

## Tasks

### Remove Deprecated Tools

- [x] Delete `src/tools/remember.ts`
  - Replaced by `store.ts`
- [x] Delete `src/tools/update.ts`
  - Replaced by `improve.ts`
- [x] Update `src/tools/index.ts`
  - Remove `palace_remember` registration
  - Remove `palace_update` registration
- [x] Remove any imports of deleted tools

### Simplify Database Schema

- [x] Update `src/services/index/sqlite.ts`
  - Remove schema version tracking (PRAGMA user_version)
  - Remove migration functions (migrateV1ToV2, migrateV2ToV3, etc.)
  - Keep single current schema only
  - Simplify `initializeSchema()` to just create tables
- [x] Document that fresh installs get current schema
  - Future versions can add migrations if needed

### Remove Legacy Environment Variables

- [x] Update `src/config/index.ts`
  - Remove `PALACE_VAULT_PATH` single-vault fallback
  - Require proper multi-vault configuration
  - Provide clear error message for missing config
- [x] Update `src/config/global-config.ts`
  - Remove legacy config detection
  - Clean up fallback logic
- [x] Update documentation
  - Remove references to legacy env vars
  - Update setup instructions

### Clean Up Code Quality Issues

- [x] Run `npm run lint` and fix all issues
- [x] Remove unused imports across all files
- [x] Fix sourceStr handling for object sources in sync.ts

### Update Tests

- [x] Update integration tests to use PALACE_VAULTS
- [x] Update unit tests to use PALACE_VAULTS
- [x] Remove legacy migration-related tests
- [x] Update global-config tests for removed PALACE_VAULT_PATH
- [x] Ensure all tests pass after cleanup

### Update Documentation

- [x] Update `README.md`
  - Remove any references to palace_remember
  - Remove any references to palace_update
  - Remove legacy env var documentation
- [x] Update `docs/API.md`
  - Remove deprecated tool documentation
  - Ensure only current tools listed
- [x] Update `docs/CONFIGURATION.md`
  - Remove legacy configuration options
- [x] Update `CLAUDE.md`
  - Remove deprecated tool references
- [x] Update `docs/CHANGELOG.md`
  - Note that deprecated tools removed before initial release

### Final Verification

- [x] Run full test suite: `npm test`
- [x] Run linter: `npm run lint`
- [x] Run type check: `npm run typecheck`
- [x] Build project: `npm run build`
- [x] Verify tool count matches documentation (19 tools)

## Standards & References

- [CLAUDE.md](../../CLAUDE.md) - Project guidelines
- [Git Workflow Standards](../GIT_WORKFLOW_STANDARDS.md) - Git practices
- [v2.0 Specification](../obsidian-palace-mcp-spec-v2.md) - Full specification

## Technical Details

### Current Schema (Kept)

```sql
-- Notes table
CREATE TABLE notes (
    id INTEGER PRIMARY KEY,
    path TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    type TEXT,
    status TEXT DEFAULT 'active',
    domain TEXT,                       -- JSON array
    tags TEXT,                         -- JSON array
    parent_path TEXT,
    technology_path TEXT,
    source TEXT,                       -- String or JSON object
    confidence REAL,
    verified INTEGER DEFAULT 0,
    ai_binding TEXT,                   -- For standards
    applies_to TEXT,                   -- JSON array, for standards
    created TEXT,
    modified TEXT,
    content TEXT,
    content_hash TEXT,
    line_count INTEGER,
    section_count INTEGER,
    word_count INTEGER,
    palace_version INTEGER DEFAULT 1,
    last_agent TEXT,
    children_count INTEGER DEFAULT 0
);

-- Tags junction table
CREATE TABLE note_tags (
    note_id INTEGER,
    tag TEXT,
    PRIMARY KEY (note_id, tag),
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
);

-- Domain junction table
CREATE TABLE note_domains (
    note_id INTEGER,
    domain TEXT,
    position INTEGER,
    PRIMARY KEY (note_id, domain, position),
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
);

-- Links table
CREATE TABLE links (
    id INTEGER PRIMARY KEY,
    source_id INTEGER,
    target_path TEXT,
    target_id INTEGER,
    link_text TEXT,
    resolved INTEGER DEFAULT 0,
    FOREIGN KEY (source_id) REFERENCES notes(id) ON DELETE CASCADE,
    FOREIGN KEY (target_id) REFERENCES notes(id) ON DELETE SET NULL
);

-- Technology mentions
CREATE TABLE technology_mentions (
    id INTEGER PRIMARY KEY,
    note_id INTEGER,
    technology TEXT,
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
);

-- Authors table
CREATE TABLE authors (
    id INTEGER PRIMARY KEY,
    note_id INTEGER,
    agent TEXT,
    action TEXT,
    date TEXT,
    context TEXT,
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
);

-- Full-text search
CREATE VIRTUAL TABLE notes_fts USING fts5(
    title,
    content,
    tags,
    domain,
    content='notes',
    content_rowid='id',
    tokenize='porter unicode61'
);
```

### Files Deleted

```
src/tools/remember.ts           # Replaced by store.ts
src/tools/update.ts             # Replaced by improve.ts
```

### Files Modified

```
src/config/index.ts             # Remove PALACE_VAULT_PATH fallback
src/config/global-config.ts     # Remove legacy detection
src/services/index/sqlite.ts    # Remove migrations
src/services/index/sync.ts      # Fix source handling
src/tools/index.ts              # Remove deprecated registrations
tests/integration/workflow.test.ts  # Use PALACE_VAULTS
tests/unit/services/index.test.ts   # Use PALACE_VAULTS
tests/unit/tools/session.test.ts    # Use PALACE_VAULTS
tests/unit/config/global-config.test.ts  # Update tests
README.md                       # Remove deprecated references
docs/API.md                     # Remove deprecated tools
docs/CONFIGURATION.md           # Remove legacy options
CLAUDE.md                       # Update tool list
docs/CHANGELOG.md               # Note cleanup
```

## Testing & Quality Assurance

### Test Results

- All 347 tests pass
- No TypeScript errors
- No linting errors
- Build succeeds
- 19 tools registered (palace_remember and palace_update removed)

## Acceptance Criteria

- [x] No deprecated tools in codebase
- [x] Single database schema (no migrations)
- [x] No legacy environment variable support
- [x] All tests passing
- [x] No linting errors
- [x] Documentation accurate
- [x] Build succeeds

## Notes & Decisions

### Why Remove Migrations?

Migrations are useful for released software where users have existing databases. Since v2.0 is the first release:

1. No one has an existing Palace database to migrate
2. Adding migration complexity before release is premature
3. Future releases can add migrations if schema changes
4. Simpler code is easier to maintain

### Why Remove PALACE_VAULT_PATH?

The single-vault legacy mode was kept for "backward compatibility" but:

1. No one is using it yet
2. Multi-vault config is more flexible
3. Single vault works fine with multi-vault config (just configure one vault)
4. Removes confusing dual-configuration paths

### Configuration After Cleanup

Users must configure vaults via one of:

1. `~/.config/palace/config.yaml` (recommended)
2. `PALACE_VAULTS` environment variable (quick setup)
3. `PALACE_CONFIG_PATH` pointing to custom config location

Single vault example:
```yaml
version: 1
vaults:
  - path: "/path/to/my/vault"
    alias: main
    mode: rw
    default: true
```

Or via environment variable:
```bash
export PALACE_VAULTS="/path/to/my/vault:main:rw"
```

This is cleaner than having two different configuration methods.
