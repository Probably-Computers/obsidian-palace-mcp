# Phase 023: Note Lifecycle Management

**Status**: ✅ Completed
**Start Date**: 2025-12-17
**Target Completion**: 2025-12-17
**Actual Completion**: 2025-12-17
**Owner**: Adam

## Objectives

- Add `palace_delete` tool for programmatic note/directory deletion
- Implement orphan cleanup capabilities
- Track files created during operations for easier rollback/cleanup
- Prevent orphan accumulation from failed or restructured operations
- Enable vault maintenance without leaving Claude sessions

## Prerequisites

- [x] Phase 022 complete (Smart Split System)
- [x] Understanding of current file operations in `src/services/vault/`
- [x] Understanding of index synchronization

## Scope

### In Scope
- `palace_delete` tool with single note and directory deletion
- Orphan detection and cleanup suggestions
- Operation tracking (files created per operation)
- Dry-run mode for all destructive operations
- Backlink handling during deletion
- Index cleanup after deletion

### Out of Scope
- Recycle bin / soft delete (future consideration)
- Cross-vault deletion operations
- Automatic scheduled cleanup

## Tasks

### 023.1: Implement palace_delete Tool
- [x] Create `src/tools/delete.ts` with Zod schema
- [x] Implement single note deletion
- [x] Implement directory deletion with confirmation requirement
- [x] Add `dry_run` option showing what would be deleted
- [x] Update index after deletion
- [x] Handle backlink cleanup options:
  - `remove_backlinks: true` - Remove [[links]] to deleted note from other files
  - `warn_backlinks: true` - Return list of files that will have broken links
- [x] Register tool in `src/tools/index.ts`

### 023.2: Backlink Handling
- [x] Query backlinks before deletion
- [x] Option to remove references to deleted note from linking files
- [x] Option to leave references (creates broken links, user's choice)
- [x] Update frontmatter `related` arrays that reference deleted note
- [x] Log all backlink modifications

### 023.3: Directory Deletion
- [x] Require explicit `confirm: true` for directory deletion
- [x] List all files that will be deleted in dry-run
- [x] Handle hub+children structures (delete hub deletes children too)
- [x] Prevent deletion of protected directories (`.palace/`, `.obsidian/`)
- [x] Recursive deletion with depth limit

### 023.4: Operation Tracking
- [x] Add operation ID to store/improve responses
- [x] Track files created per operation in memory/index
- [x] Store operation metadata:
  - Operation type (store, improve, split)
  - Files created
  - Files modified
  - Timestamp

> **Note**: Full undo capability (`palace_undo`) moved to Phase 028 (Version History) which will store content snapshots.

### 023.5: Enhanced Orphan Management
- [x] Extend `palace_orphans` with cleanup suggestions
- [x] Add `delete_orphans: true` option to remove all isolated notes
- [x] Add `path_filter` to target specific directories for orphan cleanup
- [x] Categorize orphans:
  - Isolated (no links in or out)
  - Stub orphans (stubs with no backlinks)
  - Child orphans (children without hub)
- [x] Dry-run for orphan cleanup
- [x] Add `include_context: true` for AI review with:
  - Content preview per orphan
  - Similar notes suggestions
  - Per-orphan action recommendations (remove/link/expand/merge)
  - Action summary counts

### 023.6: Cleanup Suggestions
- [x] After major operations (store with split, improve with replace), suggest cleanup
- [x] Return `cleanup_suggestions` in response with:
  - Orphaned files that might need deletion
  - Stale children from replaced content
  - Broken link warnings

> **Note**: `auto_cleanup` option was considered but replaced by the richer `include_context` orphan review feature, which allows informed decisions per-orphan.

### 023.7: Testing & Validation
- [x] Unit tests for delete operations
- [x] Integration tests for backlink handling
- [x] Integration tests for directory deletion
- [x] Test orphan detection accuracy
- [x] Test index consistency after deletion

### 023.8: Documentation
- [x] Document `palace_delete` in CLAUDE.md
- [x] Add deletion section to tool documentation
- [x] Document backlink handling options
- [x] Add cleanup workflow examples

## Standards & References

- [CLAUDE.md](../../../CLAUDE.md) - Project guidelines
- [obsidian-palace-mcp-spec.md](../obsidian-palace-mcp-spec.md) - Full specification
- Current vault operations: `src/services/vault/`

## Technical Details

### palace_delete Schema

```typescript
const deleteSchema = z.object({
  path: z.string().describe('Path to note or directory to delete'),
  vault: z.string().optional().describe('Vault alias'),
  confirm: z.boolean().optional().describe('Required true for directory deletion'),
  dry_run: z.boolean().default(true).describe('Preview without deleting'),
  handle_backlinks: z.enum(['remove', 'warn', 'ignore']).default('warn'),
  recursive: z.boolean().default(false).describe('Delete directory contents'),
});
```

### Response Structure

```typescript
interface DeleteResult {
  success: boolean;
  deleted: string[];           // Paths that were deleted
  backlinks_found: string[];   // Files that linked to deleted note
  backlinks_updated: string[]; // Files where links were removed
  broken_links: string[];      // Files that will have broken links
  warnings: string[];
  dry_run: boolean;
}
```

### Backlink Removal Logic

```typescript
// When removing backlinks:
// 1. Find all [[Deleted Note]] and [[Deleted Note|alias]] patterns
// 2. Replace with just the display text (or remove entirely)
// 3. Update related arrays in frontmatter
// 4. Re-index modified files
```

### Files to Create/Modify

| File | Action |
|------|--------|
| `src/tools/delete.ts` | Create - new delete tool |
| `src/tools/index.ts` | Modify - register delete tool |
| `src/services/vault/writer.ts` | Modify - add delete methods |
| `src/services/index/sync.ts` | Modify - handle deletion sync |
| `src/tools/orphans.ts` | Modify - add cleanup options |
| `src/types/index.ts` | Modify - add delete types |

## Testing & Quality Assurance

### Test Coverage Requirements
- Unit tests for delete logic
- Integration tests for backlink handling
- Integration tests for directory deletion
- Tests for protected path handling
- Tests for dry-run accuracy

### Quality Checks
- [x] All existing tests still pass
- [x] Delete operations properly update index
- [x] Backlink handling is accurate
- [x] Protected paths cannot be deleted
- [x] Dry-run matches actual deletion

## Acceptance Criteria

- [x] `palace_delete` tool available and documented
- [x] Single note deletion works with backlink handling
- [x] Directory deletion requires `confirm: true`
- [x] `dry_run: true` (default) shows what would be deleted without deleting
- [x] Index is updated after deletion
- [x] `palace_orphans` can suggest and perform cleanup
- [x] Protected directories (`.palace/`, `.obsidian/`) cannot be deleted
- [x] All tests passing
- [x] Documentation updated

## Risks & Mitigation

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| Accidental data loss | Critical | Medium | Default dry_run, require confirm for directories |
| Index desync after deletion | High | Low | Atomic operations, index rebuild option |
| Backlink removal errors | Medium | Medium | Dry-run preview, conservative matching |
| Performance with large deletions | Medium | Low | Batch operations, progress feedback |

## Notes & Decisions

### Dry-Run Default
- **Context**: Deletion is destructive and irreversible
- **Decision**: `dry_run: true` is the default
- **Rationale**: Prevent accidental data loss; require explicit intent
- **Trade-off**: Slightly more verbose for intentional deletions

### No Recycle Bin (Yet)
- **Context**: Could implement soft-delete with recovery
- **Decision**: Hard delete only for now
- **Rationale**: Keeps implementation simple; Obsidian has its own trash; git provides history
- **Future**: Could add `.palace/trash/` with TTL-based cleanup

### Backlink Handling Options
- **Context**: Deleting a note can break links in other notes
- **Decision**: Three options - remove, warn, ignore
- **Rationale**: Different use cases need different behaviors
- **Default**: `warn` - show broken links but don't modify other files
