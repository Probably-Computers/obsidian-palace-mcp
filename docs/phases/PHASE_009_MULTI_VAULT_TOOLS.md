# Phase 009: Multi-Vault Tool Integration

**Status**: Planning
**Start Date**: TBD
**Target Completion**: TBD
**Owner**: TBD

## Objectives

- Update all existing tools to support vault parameter
- Enable cross-vault path resolution in tools
- Maintain backward compatibility (default vault when not specified)
- Integrate ignore mechanism with vault reader
- Add unit tests for palace_vaults tool

## Prerequisites

- [x] Phase 008 completed (Multi-Vault & Configuration)
- [x] Vault registry service available
- [x] Ignore mechanism implemented
- [x] Per-vault configuration loading

## Scope

### In Scope

- Add vault parameter to all applicable tools
- Update palace_recall for multi-vault search
- Update palace_list for vault filtering
- Update palace_structure for vault parameter
- Update palace_read for cross-vault paths
- Update palace_query for vault filtering
- Update palace_dataview for vault support
- Update palace_links for cross-vault links
- Update palace_orphans for vault parameter
- Update palace_related for cross-vault discovery
- Update palace_autolink for vault awareness
- Update palace_session for vault parameter
- Update palace_remember for vault selection
- Update palace_update for vault awareness
- Integrate ignore mechanism with vault reader
- Add comprehensive tests for palace_vaults tool

### Out of Scope

- Multiple SQLite databases per vault (Phase 010)
- Cross-vault search aggregation (Phase 010)
- Intent-based storage (Phase 011)
- New tools beyond vault parameter support

## Tasks

### Vault Parameter Support

- [ ] Define common vault parameter schema
  - [ ] vault?: string (alias or path)
  - [ ] Default to registry's default vault
  - [ ] Validate vault exists and is accessible
- [ ] Create shared vault resolution utility
  - [ ] resolveVaultFromParam(param?: string) -> ResolvedVault
  - [ ] Handle alias lookup
  - [ ] Handle path lookup
  - [ ] Error on invalid vault

### Integrate Ignore Mechanism

- [ ] Update src/services/vault/reader.ts
  - [ ] Accept ignore config parameter
  - [ ] Filter files based on ignore patterns
  - [ ] Check for .palace-ignore markers during traversal
  - [ ] Skip ignored files in listings
- [ ] Update file enumeration methods
  - [ ] listFiles() respects ignore
  - [ ] walkDirectory() respects ignore
  - [ ] getNote() checks ignore (optional)

### Update palace_recall

- [ ] Add vault parameter to input schema
- [ ] Filter search to specified vault
- [ ] Include vault alias in results
- [ ] Update tests

### Update palace_list

- [ ] Add vault parameter to input schema
- [ ] List from specified vault
- [ ] Include vault alias in output
- [ ] Respect ignore patterns
- [ ] Update tests

### Update palace_structure

- [ ] Add vault parameter to input schema
- [ ] Show structure of specified vault
- [ ] Filter ignored directories
- [ ] Update tests

### Update palace_read

- [ ] Add vault parameter to input schema
- [ ] Support cross-vault path format (vault:alias/path)
- [ ] Resolve vault from parameter or path prefix
- [ ] Update tests

### Update palace_query

- [ ] Add vault parameter to input schema
- [ ] Filter query to specified vault
- [ ] Include vault alias in results
- [ ] Update tests

### Update palace_dataview

- [ ] Add vault parameter to input schema
- [ ] Execute DQL against specified vault
- [ ] Support FROM "vault:alias/path" syntax
- [ ] Update tests

### Update palace_links

- [ ] Add vault parameter to input schema
- [ ] Track links within specified vault
- [ ] Identify cross-vault link targets
- [ ] Update tests

### Update palace_orphans

- [ ] Add vault parameter to input schema
- [ ] Find orphans in specified vault
- [ ] Update tests

### Update palace_related

- [ ] Add vault parameter to input schema
- [ ] Find related notes in specified vault
- [ ] Update tests

### Update palace_autolink

- [ ] Add vault parameter to input schema
- [ ] Scan specified vault for linkable terms
- [ ] Respect vault's ignore patterns
- [ ] Update tests

### Update palace_session

- [ ] Add vault parameter to input schema
- [ ] Create session in specified vault's daily folder
- [ ] Update tests

### Update palace_remember

- [ ] Add vault parameter to input schema
- [ ] Create note in specified vault
- [ ] Enforce write access (reject ro vaults)
- [ ] Update tests

### Update palace_update

- [ ] Add vault parameter to input schema
- [ ] Update note in specified vault
- [ ] Enforce write access
- [ ] Update tests

### palace_vaults Tests

- [ ] Create tests/unit/tools/vaults.test.ts
  - [ ] Test listing vaults
  - [ ] Test include_counts option
  - [ ] Test include_config option
  - [ ] Test default vault indicator
  - [ ] Test empty vault list handling
  - [ ] Test error handling

### Integration Testing

- [ ] Create tests/integration/multi-vault.test.ts
  - [ ] Test tool operations across vaults
  - [ ] Test read-only enforcement
  - [ ] Test ignore pattern integration
  - [ ] Test cross-vault path resolution

### Documentation

- [ ] Update CLAUDE.md with vault parameter info
- [ ] Document cross-vault path format
- [ ] Update each tool's documentation
- [ ] Add examples for multi-vault usage

## Standards & References

- [CLAUDE.md](../../CLAUDE.md) - Project guidelines
- [v2.0 Specification](../obsidian-palace-mcp-spec-v2.md) - Section 7, 10
- [Git Workflow Standards](../GIT_WORKFLOW_STANDARDS.md)
- [Phase 008](./PHASE_008_MULTI_VAULT_CONFIG.md) - Multi-Vault Configuration

## Technical Details

### Vault Parameter Schema

```typescript
// Common vault parameter for all tools
const vaultParam = z.object({
  vault: z.string().optional().describe(
    'Vault alias or path. Defaults to the default vault.'
  ),
});

// Usage in tool input schema
const inputSchema = z.object({
  // ... tool-specific params
  vault: z.string().optional(),
});
```

### Vault Resolution Utility

```typescript
// src/utils/vault-param.ts
import { getVaultRegistry } from '../services/vault/registry';

export function resolveVaultParam(vault?: string): ResolvedVault {
  const registry = getVaultRegistry();

  if (!vault) {
    return registry.getDefaultVault();
  }

  // Try alias first
  const byAlias = registry.getVault(vault);
  if (byAlias) {
    return byAlias;
  }

  // Try path match
  for (const v of registry.listVaults()) {
    if (v.path === vault) {
      return v;
    }
  }

  throw new Error(`Vault not found: ${vault}`);
}

export function enforceWriteAccess(vault: ResolvedVault): void {
  if (vault.mode === 'ro') {
    throw new Error(`Vault '${vault.alias}' is read-only`);
  }
}
```

### Cross-Vault Path Format

```
vault:alias/path/to/note.md

Examples:
- vault:work/projects/myproject/README.md
- vault:personal/daily/2025-12-06.md
```

### Tool Output with Vault

```typescript
interface ToolResultWithVault {
  success: boolean;
  vault: string;  // Vault alias
  data: unknown;
}
```

### Files to Modify

```
src/
├── utils/
│   └── vault-param.ts          # New: vault parameter utilities
├── services/
│   └── vault/
│       └── reader.ts           # Update: integrate ignore
├── tools/
│   ├── recall.ts               # Update: add vault param
│   ├── list.ts                 # Update: add vault param
│   ├── structure.ts            # Update: add vault param
│   ├── read.ts                 # Update: add vault param
│   ├── query.ts                # Update: add vault param
│   ├── dataview.ts             # Update: add vault param
│   ├── links.ts                # Update: add vault param
│   ├── orphans.ts              # Update: add vault param
│   ├── related.ts              # Update: add vault param
│   ├── autolink.ts             # Update: add vault param
│   ├── session.ts              # Update: add vault param
│   ├── remember.ts             # Update: add vault param
│   └── update.ts               # Update: add vault param
└── tests/
    ├── unit/
    │   └── tools/
    │       └── vaults.test.ts  # New: palace_vaults tests
    └── integration/
        └── multi-vault.test.ts # New: multi-vault integration
```

## Testing & Quality Assurance

### Test Coverage Requirements

| Area | Target |
|------|--------|
| Vault parameter utility | 95% |
| Tool vault param handling | 85% |
| Ignore integration | 90% |
| palace_vaults tool | 90% |
| Integration tests | 80% |

### Quality Checks

- [ ] All tests passing
- [ ] No TypeScript errors
- [ ] Linting passes
- [ ] Backward compatible (no vault param = default vault)
- [ ] Read-only enforcement working
- [ ] Ignore patterns respected

## Acceptance Criteria

- [ ] All tools accept vault parameter
- [ ] Default vault used when parameter not specified
- [ ] Read-only vaults reject write operations
- [ ] Cross-vault path format works
- [ ] Ignore patterns integrated with reader
- [ ] palace_vaults has comprehensive tests
- [ ] All existing tests still passing
- [ ] Documentation updated

## Risks & Mitigation

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| Breaking existing tool behavior | High | Low | Comprehensive backward compatibility |
| Performance with vault resolution | Low | Low | Cache vault lookups |
| Complex testing across vaults | Medium | Medium | Use test fixtures |
| Inconsistent vault handling | Medium | Medium | Shared utility function |

## Notes & Decisions

*To be filled during implementation*
