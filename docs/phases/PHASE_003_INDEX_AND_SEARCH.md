# Phase 003: Index and Search

**Status**: Planning
**Start Date**: TBD
**Target Completion**: TBD
**Actual Completion**: -
**Owner**: TBD

## Objectives

- Implement SQLite index with FTS5 for fast full-text search
- Add file watcher to detect external vault changes
- Enhance palace_recall with SQLite-backed search
- Implement palace_query tool for property-based queries
- Implement palace_update tool for modifying existing notes

## Prerequisites

- [x] Phase 001 completed
- [x] Phase 002 completed
- [ ] better-sqlite3 dependency installed
- [ ] chokidar dependency installed
- [ ] Understanding of SQLite FTS5 syntax
- [ ] Test vault configured via PALACE_VAULT_PATH

## Scope

### In Scope

- SQLite database setup and migrations
- FTS5 virtual table for full-text search
- Notes table with metadata indexing
- Tags junction table
- Links table for wiki-link tracking
- File watcher service using chokidar
- Index synchronization on file changes
- Enhanced palace_recall using FTS5
- palace_query tool implementation
- palace_update tool implementation

### Out of Scope

- Graph traversal (Phase 4)
- Auto-linking (Phase 5)
- Dataview queries (Phase 6)

## Tasks

### Setup

- [ ] Create services/index/ directory structure
- [ ] Set up SQLite database initialization
- [ ] Define database schema migrations
- [ ] Create .envrc for direnv with test vault path
- [ ] Update README with environment configuration

### Development

- [ ] Implement services/index/sqlite.ts
  - [ ] Database connection management
  - [ ] Schema creation (notes, note_tags, links, notes_fts)
  - [ ] Migration system
- [ ] Implement services/index/query.ts
  - [ ] FTS5 search query builder
  - [ ] Filter query builder (type, tags, confidence, dates)
  - [ ] Result ranking and scoring
- [ ] Implement services/index/index.ts barrel export
- [ ] Implement services/vault/watcher.ts
  - [ ] chokidar file watcher setup
  - [ ] Handle file create/update/delete events
  - [ ] Debounce rapid changes
  - [ ] Trigger index updates
- [ ] Update services/vault/index.ts to export watcher
- [ ] Implement tools/update.ts (palace_update)
  - [ ] Replace content
  - [ ] Append content
  - [ ] Update frontmatter
- [ ] Enhance tools/recall.ts
  - [ ] Use FTS5 for search
  - [ ] Improved scoring with FTS5 ranking
- [ ] Implement tools/query.ts (palace_query)
  - [ ] Filter by type, tags, source
  - [ ] Filter by confidence, verified status
  - [ ] Filter by date range
  - [ ] Sorting options

### Testing & Validation

- [ ] Unit tests for SQLite service
- [ ] Unit tests for query builder
- [ ] Unit tests for file watcher
- [ ] Integration tests with test vault
- [ ] Performance tests for large vaults

### Documentation

- [ ] Update CLAUDE.md with new tools
- [ ] Document SQLite schema
- [ ] Document query syntax
- [ ] Update README with direnv setup

## Standards & References

- [CLAUDE.md](../../CLAUDE.md) - Project guidelines
- [Obsidian Palace MCP Spec](../obsidian-palace-mcp-spec.md) - Tool specifications
- [SQLite FTS5 Documentation](https://www.sqlite.org/fts5.html)
- [chokidar Documentation](https://github.com/paulmillr/chokidar)
- [direnv Documentation](https://direnv.net/)

## Technical Details

### Environment Configuration

All configuration via environment variables (use direnv for development):

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| PALACE_VAULT_PATH | Yes | - | Path to Obsidian vault |
| PALACE_INDEX_PATH | No | {vault}/.palace/index.sqlite | SQLite database location |
| PALACE_LOG_LEVEL | No | info | Logging level |
| PALACE_WATCH_ENABLED | No | true | Enable file watcher |

### Development Setup with direnv

Create `.envrc` in project root (git-ignored):
```bash
export PALACE_VAULT_PATH="/Users/adamc/Documents/Claude Palace"
export PALACE_LOG_LEVEL="debug"
```

Run `direnv allow` to activate.

### SQLite Schema

```sql
-- Notes table
CREATE TABLE notes (
    id INTEGER PRIMARY KEY,
    path TEXT UNIQUE NOT NULL,
    title TEXT,
    type TEXT,
    created TEXT,
    modified TEXT,
    source TEXT,
    confidence REAL,
    verified INTEGER,
    content TEXT,
    content_hash TEXT
);

-- Tags junction
CREATE TABLE note_tags (
    note_id INTEGER,
    tag TEXT,
    FOREIGN KEY (note_id) REFERENCES notes(id)
);

-- Links (wiki-links)
CREATE TABLE links (
    source_id INTEGER,
    target_path TEXT,
    FOREIGN KEY (source_id) REFERENCES notes(id)
);

-- Full-text search
CREATE VIRTUAL TABLE notes_fts USING fts5(
    title,
    content,
    content='notes',
    content_rowid='id'
);

-- Indexes
CREATE INDEX idx_notes_type ON notes(type);
CREATE INDEX idx_notes_path ON notes(path);
CREATE INDEX idx_note_tags_tag ON note_tags(tag);
CREATE INDEX idx_links_target ON links(target_path);
```

### Files to Create

```
src/services/
├── index/
│   ├── sqlite.ts      # Database setup and migrations
│   ├── query.ts       # Query builder
│   └── index.ts       # Barrel exports
└── vault/
    └── watcher.ts     # File system watcher

src/tools/
├── update.ts          # palace_update
└── query.ts           # palace_query
```

## Testing & Quality Assurance

### Test Vault

Located at: `/Users/adamc/Documents/Claude Palace`

This vault is used for development and integration testing.

### Test Coverage Requirements

- Unit tests: 80% coverage for new code
- Integration tests: Full CRUD cycle with index
- Performance: Search < 100ms for 10k notes

### Quality Checks

- [ ] Code review completed
- [ ] All tests passing
- [ ] Linting passes
- [ ] Documentation updated
- [ ] No regressions in existing tools

## Acceptance Criteria

- [ ] SQLite database created on first run
- [ ] Index updates when files change externally
- [ ] palace_recall uses FTS5 for faster search
- [ ] palace_query filters by all frontmatter properties
- [ ] palace_update modifies notes correctly
- [ ] Search performance acceptable for large vaults
- [ ] File watcher handles rapid changes gracefully
- [ ] Environment variables documented in README

## Risks & Mitigation

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| SQLite lock contention | Medium | Low | Use WAL mode, connection pooling |
| Large vault performance | High | Medium | Pagination, index optimization |
| File watcher memory usage | Medium | Low | Limit watched directories |
| Index corruption | High | Low | Transaction safety, backup on startup |

## Notes & Decisions

### TBD - Index Rebuild Strategy

- Context: When/how to rebuild index from scratch
- Options:
  1. On startup if hash mismatch
  2. Manual command
  3. Automatic with version tracking
- Decision: Pending
