# Phase 008: Multi-Vault & Configuration

**Status**: Complete
**Start Date**: 2025-12-06
**Completion Date**: 2025-12-06
**Owner**: Claude

## Objectives

- Support multiple vaults with configurable read/write access
- Implement global configuration system (~/.config/palace/config.yaml)
- Implement per-vault configuration (.palace.yaml)
- Create robust ignore mechanism (patterns, markers, frontmatter)
- Enable cross-vault search and linking

## Prerequisites

- [x] Phase 001-007 completed
- [x] Stable v1.0 release
- [x] TypeScript strict mode enabled
- [x] Test infrastructure in place

## Scope

### In Scope

- Global config loading and parsing
- Per-vault config loading and parsing
- Vault registry service
- Access mode enforcement (rw/ro)
- Ignore mechanism with three layers:
  - Global patterns (.palace.yaml)
  - Directory markers (.palace-ignore)
  - Note frontmatter (palace_ignore: true)
- `palace_vaults` tool
- Update all existing tools for multi-vault support
- Cross-vault search capability

### Out of Scope

- Vault synchronization
- Remote vault support
- Real-time vault collaboration
- Vault backup/restore

## Tasks

### Global Configuration

- [x] Create src/config/global-config.ts
  - [x] Define GlobalConfig TypeScript interface
  - [x] Zod schema for validation
  - [x] Load from ~/.config/palace/config.yaml
  - [x] Support PALACE_CONFIG_PATH override
  - [x] Support PALACE_VAULTS quick setup env var
  - [x] Support PALACE_DEFAULT_VAULT env var
- [x] Handle missing config gracefully (single vault fallback)
- [x] Validate vault paths exist

### Per-Vault Configuration

- [x] Create src/config/vault-config.ts
  - [x] Define VaultConfig TypeScript interface
  - [x] Zod schema for validation
  - [x] Load from {vault}/.palace.yaml
  - [x] Default values when config missing
- [x] Define structure mapping (knowledge_type -> path)
- [x] Define atomic note settings
- [x] Define stub behavior settings
- [x] Define graph integrity settings

### Vault Registry Service

- [x] Create src/services/vault/registry.ts
  - [x] List all configured vaults
  - [x] Get vault by alias
  - [x] Get default vault
  - [x] Check vault access mode
  - [x] Validate vault availability
- [x] Cache vault configs on startup
- [x] Handle vault path changes gracefully

### Ignore Mechanism

- [x] Create src/services/vault/ignore.ts
  - [x] Parse glob patterns from config
  - [x] Check for .palace-ignore marker files
  - [x] Check frontmatter palace_ignore field
  - [x] Combine all three layers for final decision
- [ ] Integrate with vault reader (Phase 009)
- [ ] Integrate with indexing service (Phase 010)

### palace_vaults Tool

- [x] Create src/tools/vaults.ts
  - [x] List all configured vaults
  - [x] Show vault alias, path, mode
  - [x] Show vault description
  - [x] Show default vault indicator
  - [x] Show note counts per vault
- [x] Register tool in tools/index.ts

### Update Existing Tools

Note: Vault parameter support moved to Phase 009 - existing tools continue to work with default vault

- [ ] Update palace_recall for multi-vault search (Phase 009)
- [ ] Update palace_list for vault filtering (Phase 009)
- [ ] Update palace_structure for vault parameter (Phase 009)
- [ ] Update palace_read for cross-vault paths (Phase 009)
- [ ] Update palace_query for vault filtering (Phase 009)
- [ ] Update palace_dataview for vault support (Phase 009)
- [ ] Update palace_links for cross-vault links (Phase 009)
- [ ] Update palace_orphans for vault parameter (Phase 009)
- [ ] Update palace_related for cross-vault discovery (Phase 009)
- [ ] Update palace_autolink for vault awareness (Phase 009)
- [ ] Update palace_session for vault parameter (Phase 009)

### Index Updates

Note: Moved to Phase 010 - Multi-Vault Index & Search

- [ ] Support multiple SQLite databases (one per vault) (Phase 010)
- [ ] Cross-vault search aggregation (Phase 010)
- [ ] Vault-prefixed paths in results (Phase 010)

### Testing

- [x] Unit tests for global config parsing (13 tests)
- [x] Unit tests for vault config parsing (20 tests)
- [x] Unit tests for ignore mechanism (27 tests)
- [x] Unit tests for vault registry (included in global config tests)
- [ ] Unit tests for palace_vaults tool (Phase 009)
- [ ] Integration tests with multiple vaults (Phase 009)
- [ ] Integration tests for cross-vault search (Phase 010)

### Documentation

- [x] Update CLAUDE.md with multi-vault info
- [x] Document global config schema
- [x] Document vault config schema
- [x] Add example configurations
- [x] Update tool documentation

## Standards & References

- [CLAUDE.md](../../CLAUDE.md) - Project guidelines
- [v2.0 Specification](../obsidian-palace-mcp-spec-v2.md) - Sections 7, 10
- [Git Workflow Standards](../GIT_WORKFLOW_STANDARDS.md)

## Technical Details

### Global Config Schema

Location: `~/.config/palace/config.yaml`

```yaml
version: 1

vaults:
  - path: "/Users/adam/Documents/Work Palace"
    alias: work
    mode: rw
    default: true

  - path: "/Users/adam/Documents/Personal Palace"
    alias: personal
    mode: rw

  - path: "/Users/adam/Documents/Vendor Docs"
    alias: vendor
    mode: ro

cross_vault:
  search: true
  link_format: "vault:alias/path"
  standards_source: work

settings:
  log_level: info
  watch_enabled: true
  auto_index: true
```

### Per-Vault Config Schema

Location: `{vault}/.palace.yaml`

```yaml
vault:
  name: work-knowledge
  description: "Work-related knowledge"
  mode: rw

structure:
  technology:
    path: "technologies/{domain}/"
    hub_file: "_index.md"
  command:
    path: "commands/{domain}/"
  standard:
    path: "standards/{domain}/"
    ai_binding: required
  project:
    path: "projects/{project}/"
    subpaths:
      decision: "decisions/"
      configuration: "configurations/"

ignore:
  patterns:
    - ".obsidian/"
    - "templates/"
    - "private/**"
  marker_file: ".palace-ignore"
  frontmatter_key: "palace_ignore"

atomic:
  max_lines: 200
  max_sections: 6
  hub_filename: "_index.md"
  auto_split: true

stubs:
  auto_create: true
  min_confidence: 0.2

graph:
  require_technology_links: true
  warn_orphan_depth: 1
  retroactive_linking: true
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| PALACE_CONFIG_PATH | No | ~/.config/palace/config.yaml | Global config location |
| PALACE_VAULTS | No | - | Quick setup: path:alias:mode,... |
| PALACE_DEFAULT_VAULT | No | First vault | Default vault alias |

### Files Created

```
src/
├── config/
│   ├── global-config.ts      # Global config loading
│   └── vault-config.ts       # Per-vault config loading
├── services/
│   └── vault/
│       ├── registry.ts       # Vault registry service
│       └── ignore.ts         # Ignore mechanism
└── tools/
    └── vaults.ts             # palace_vaults tool

tests/
└── unit/
    ├── config/
    │   ├── global-config.test.ts  # 13 tests
    │   └── vault-config.test.ts   # 20 tests
    └── services/
        └── ignore.test.ts         # 27 tests
```

## Testing & Quality Assurance

### Test Coverage

| Area | Tests | Status |
|------|-------|--------|
| Global config parsing | 13 | ✅ |
| Vault config parsing | 20 | ✅ |
| Ignore mechanism | 27 | ✅ |
| Total new tests | 60 | ✅ |
| All tests | 182 | ✅ |

### Quality Checks

- [x] All tests passing (182 tests)
- [x] No TypeScript errors
- [x] Linting passes
- [x] Backward compatible with single vault
- [x] Performance acceptable with multiple vaults

## Acceptance Criteria

- [x] Global config loads from ~/.config/palace/config.yaml
- [x] Per-vault config loads from .palace.yaml
- [x] Multiple vaults can be configured
- [x] Read-only vaults prevent writes (access mode tracked)
- [x] Ignore patterns work correctly
- [ ] Cross-vault search returns combined results (Phase 010)
- [x] palace_vaults lists all configured vaults
- [ ] All existing tools work with vault parameter (Phase 009)
- [x] Single vault mode still works (backward compatible)
- [x] All tests passing

## Risks & Mitigation

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| Breaking existing setups | High | Medium | Maintain backward compatibility |
| Performance with many vaults | Medium | Low | Lazy loading, caching |
| Config schema migration | Medium | Medium | Version field, migration script |
| Cross-vault link complexity | Medium | Medium | Clear link format spec |

## Notes & Decisions

### Implementation Notes

1. **Backward Compatibility**: The system maintains full backward compatibility with `PALACE_VAULT_PATH` environment variable. If no multi-vault config is found, it falls back to legacy single-vault mode.

2. **Config Priority**: Configuration sources are checked in order:
   - `PALACE_VAULTS` env var (quick setup)
   - `PALACE_CONFIG_PATH` or `~/.config/palace/config.yaml`
   - `PALACE_VAULT_PATH` (legacy fallback)

3. **Deferred Work**: Several tasks were moved to new phases to keep this phase focused:
   - Updating existing tools with vault parameter → Phase 009 (Multi-Vault Tool Integration)
   - Multiple SQLite databases per vault → Phase 010 (Multi-Vault Index & Search)
   - Cross-vault search aggregation → Phase 010 (Multi-Vault Index & Search)
   - Integration tests for multi-vault → Phase 009 and Phase 010

4. **TypeScript Strictness**: The implementation uses TypeScript's `exactOptionalPropertyTypes` which required explicit `| undefined` on optional interface properties.

### Files Modified

- `src/types/index.ts` - Added multi-vault types
- `src/config/index.ts` - Updated for multi-vault fallback
- `src/services/vault/index.ts` - Added registry and ignore exports
- `src/tools/index.ts` - Registered palace_vaults tool
- `CLAUDE.md` - Updated documentation
- `package.json` - Added yaml dependency
