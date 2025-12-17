# Phase 028: Version History

**Status**: Planning
**Start Date**: TBD
**Target Completion**: TBD
**Actual Completion**: -
**Owner**: Adam

## Objectives

- Implement version tracking for note changes
- Add `palace_history` tool to view note change history
- Add `palace_revert` tool to restore previous versions
- Add `palace_undo` tool to undo recent operations (leveraging Phase 023 operation tracking)
- Enable recovery from mistakes without manual git operations
- Provide diff viewing between versions

## Prerequisites

- [ ] Phase 023 complete (Note Lifecycle - deletion/cleanup)
- [ ] Phase 025 complete (Metadata Integrity)
- [ ] Understanding of current write operations

## Scope

### In Scope
- Per-note version history storage
- `palace_history` tool to list versions
- `palace_revert` tool to restore versions
- `palace_undo` tool to undo operations by ID (using Phase 023 operation tracking)
- Diff viewing between versions
- Configurable history retention
- Version metadata (timestamp, operation type)

### Out of Scope
- Git integration (use git for that)
- Branch/merge semantics
- Collaborative conflict resolution
- Real-time sync/backup

## Tasks

### 028.1: Version Storage Design
- [ ] Design version storage format (`.palace/history/` directory)
- [ ] Decide on storage approach:
  - Full copies (simple but storage-heavy)
  - Diffs (efficient but complex)
  - Hybrid (full + diffs)
- [ ] Implement version file naming scheme
- [ ] Add version limit configuration

### 028.2: Capture Versions on Write
- [ ] Hook into vault writer before modifications
- [ ] Save previous content before overwriting
- [ ] Record operation metadata:
  - Timestamp
  - Operation type (store, improve, batch)
  - Changed fields (frontmatter vs content)
- [ ] Increment `palace.version` in frontmatter

### 028.3: Implement palace_history Tool
- [ ] Create `src/tools/history.ts` with Zod schema
- [ ] List versions for a specific note
- [ ] Show version metadata (date, type, summary)
- [ ] Show diff between versions
- [ ] Register tool in `src/tools/index.ts`

### 028.4: Implement palace_revert Tool
- [ ] Create `src/tools/revert.ts` with Zod schema
- [ ] Restore note to specific version
- [ ] Option to revert frontmatter only
- [ ] Option to revert content only
- [ ] Create backup before revert (new version)
- [ ] Update index after revert

### 028.5: Implement palace_undo Tool
- [ ] Create `src/tools/undo.ts` with Zod schema
- [ ] Leverage Phase 023 operation tracking (`getOperation`, `getRecentOperations`)
- [ ] Undo `store` operations: delete created files, restore modified files from history
- [ ] Undo `improve` operations: restore modified files from history
- [ ] Undo `delete` operations: restore deleted files from history
- [ ] Support `palace_undo --list` to show recent undoable operations
- [ ] Dry-run mode by default
- [ ] Register tool in `src/tools/index.ts`

### 028.6: Diff Generation
- [ ] Generate text diffs between versions
- [ ] Highlight added/removed lines
- [ ] Generate frontmatter-specific diffs
- [ ] Format diffs for readable output

### 028.7: History Retention Policy
- [ ] Configurable max versions per note
- [ ] Configurable max age for versions
- [ ] Automatic cleanup of old versions
- [ ] Option to keep all versions for specific notes
- [ ] Manual cleanup tool

### 028.8: History Index
- [ ] Track versions in SQLite index
- [ ] Enable querying across all versions
- [ ] "What changed today/this week" queries
- [ ] Find notes with most changes

### 028.9: Testing & Validation
- [ ] Unit tests for version storage
- [ ] Unit tests for diff generation
- [ ] Integration tests for history/revert cycle
- [ ] Test retention policy cleanup

### 028.10: Documentation
- [ ] Document version history system in CLAUDE.md
- [ ] Document `palace_history`, `palace_revert`, and `palace_undo`
- [ ] Add examples for common recovery scenarios
- [ ] Document retention configuration

## Standards & References

- [CLAUDE.md](../../../CLAUDE.md) - Project guidelines
- [obsidian-palace-mcp-spec.md](../obsidian-palace-mcp-spec.md) - Full specification

## Technical Details

### Version Storage Structure

```
.palace/
├── index.sqlite
└── history/
    └── {note-hash}/
        ├── v001_2025-12-17T10-30-00.md
        ├── v002_2025-12-17T14-45-00.md
        └── v003_2025-12-18T09-15-00.md
```

### Version Metadata

```yaml
# Stored in version file frontmatter or separate metadata
palace_version:
  number: 3
  timestamp: '2025-12-17T14:45:00Z'
  operation: improve
  mode: replace
  previous_version: 2
  changes:
    - frontmatter
    - content
```

### palace_history Schema

```typescript
const historySchema = z.object({
  path: z.string().describe('Note path to show history for'),
  vault: z.string().optional(),
  limit: z.number().default(10).describe('Max versions to return'),
  show_diff: z.boolean().default(false).describe('Include diffs between versions'),
  from_version: z.number().optional().describe('Start from this version'),
  to_version: z.number().optional().describe('End at this version'),
});
```

### History Response

```typescript
interface HistoryResult {
  path: string;
  current_version: number;
  versions: Array<{
    version: number;
    timestamp: string;
    operation: string;
    changes: string[];
    diff?: string;  // If show_diff is true
  }>;
  total_versions: number;
}
```

### palace_revert Schema

```typescript
const revertSchema = z.object({
  path: z.string().describe('Note path to revert'),
  vault: z.string().optional(),
  to_version: z.number().describe('Version number to restore'),
  revert_scope: z.enum([
    'all',           // Revert entire note
    'frontmatter',   // Only revert frontmatter
    'content',       // Only revert content
  ]).default('all'),
  dry_run: z.boolean().default(true),
  create_backup: z.boolean().default(true).describe('Save current as new version before revert'),
});
```

### Revert Response

```typescript
interface RevertResult {
  success: boolean;
  path: string;
  reverted_from: number;
  reverted_to: number;
  backup_version?: number;  // If create_backup was true
  changes_reverted: string[];
  dry_run: boolean;
}
```

### palace_undo Schema

```typescript
const undoSchema = z.object({
  operation_id: z.string().optional().describe('Specific operation ID to undo'),
  vault: z.string().optional(),
  list: z.boolean().default(false).describe('List recent undoable operations'),
  limit: z.number().default(10).describe('Max operations to list'),
  dry_run: z.boolean().default(true),
});
```

### Undo Response

```typescript
interface UndoResult {
  success: boolean;
  operation_id: string;
  operation_type: 'store' | 'improve' | 'delete' | 'split';
  files_deleted: string[];    // Created files that were deleted
  files_restored: string[];   // Modified/deleted files restored from history
  dry_run: boolean;
}

interface UndoListResult {
  operations: Array<{
    id: string;
    type: string;
    timestamp: string;
    files_created: number;
    files_modified: number;
    files_deleted: number;
    undoable: boolean;        // Has history available
  }>;
}
```

### Diff Generation

```typescript
import { diffLines } from 'diff';

function generateDiff(oldContent: string, newContent: string): string {
  const diff = diffLines(oldContent, newContent);

  return diff.map(part => {
    if (part.added) return `+ ${part.value}`;
    if (part.removed) return `- ${part.value}`;
    return `  ${part.value}`;
  }).join('');
}
```

### Configuration

```yaml
# .palace.yaml
history:
  enabled: true
  max_versions_per_note: 50
  max_age_days: 90
  auto_cleanup: true
  exclude_patterns:
    - "daily/**"  # Don't version daily notes
```

### Files to Create/Modify

| File | Action |
|------|---------|
| `src/tools/history.ts` | Create - history viewing tool |
| `src/tools/revert.ts` | Create - revert tool |
| `src/tools/undo.ts` | Create - undo operation tool |
| `src/tools/index.ts` | Modify - register tools |
| `src/services/history/` | Create - history service directory |
| `src/services/history/storage.ts` | Create - version storage |
| `src/services/history/diff.ts` | Create - diff generation |
| `src/services/vault/writer.ts` | Modify - hook version capture |
| `src/config/vault-config.ts` | Modify - history settings |

## Testing & Quality Assurance

### Test Coverage Requirements
- Unit tests for version storage
- Unit tests for diff generation
- Integration tests for history viewing
- Integration tests for revert operations

### Quality Checks
- [ ] All existing tests still pass
- [ ] Version capture doesn't impact write performance significantly
- [ ] Diffs are accurate and readable
- [ ] Revert correctly restores content

## Acceptance Criteria

- [ ] Versions captured on every write operation
- [ ] `palace_history` shows version list with metadata
- [ ] `palace_history` can show diffs between versions
- [ ] `palace_revert` restores to specified version
- [ ] `palace_undo` can undo recent operations by ID
- [ ] `palace_undo --list` shows recent undoable operations
- [ ] Revert creates backup of current before restoring
- [ ] Retention policy limits storage growth
- [ ] All tests passing
- [ ] Documentation updated

## Risks & Mitigation

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| Storage growth | Medium | High | Retention limits, cleanup policy |
| Performance impact on writes | Medium | Medium | Async version storage, batching |
| Version corruption | High | Low | Validate on read, checksums |
| Revert loses newer changes | Medium | Medium | Create backup before revert |

## Notes & Decisions

### Full Copies vs Diffs
- **Context**: Storage efficiency vs implementation complexity
- **Decision**: Start with full copies
- **Rationale**: Simpler to implement, disk is cheap, can optimize later
- **Future**: Could add diff-based storage for notes with many versions

### Git Integration
- **Context**: Git already provides version history
- **Decision**: Don't integrate with git; provide independent history
- **Rationale**:
  - Not all users use git
  - Git history is commit-based, not note-based
  - Palace history is AI-operation-aware
- **Note**: Recommend git for backup; Palace history for quick recovery

### Version Numbering
- **Context**: How to identify versions
- **Decision**: Sequential integers per note (v1, v2, v3...)
- **Rationale**: Simple, sortable, human-readable
- **Note**: Timestamp also stored for chronological queries

### Dry-Run Default for Revert
- **Context**: Revert is potentially destructive
- **Decision**: `dry_run: true` is the default
- **Rationale**: Preview what will change before committing
- **Trade-off**: Extra step for intentional reverts
