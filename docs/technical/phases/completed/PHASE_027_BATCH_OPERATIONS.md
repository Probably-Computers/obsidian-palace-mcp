# Phase 027: Batch Operations

**Status**: Complete
**Start Date**: 2025-12-18
**Target Completion**: 2025-12-18
**Actual Completion**: 2025-12-18
**Owner**: Adam

## Objectives

- Add `palace_batch` tool for multi-note operations
- Support glob patterns for note selection
- Enable bulk frontmatter updates
- Enable bulk move/rename operations
- Support bulk domain/tag changes
- Provide dry-run mode for all batch operations

## Prerequisites

- [x] Phase 023 complete (Note Lifecycle - deletion)
- [x] Phase 025 complete (Metadata Integrity - validation)
- [x] Understanding of vault querying mechanisms

## Scope

### In Scope
- `palace_batch` tool with multiple operation types
- Glob pattern selection for notes
- Bulk frontmatter updates
- Bulk move operations
- Bulk tag/domain changes
- Bulk delete (with confirmation)
- Dry-run mode for preview
- Progress reporting for large operations

### Out of Scope
- Concurrent/parallel execution (sequential for safety)
- Cross-vault batch operations
- Undo for batch operations (rely on git)
- Complex transformation rules

## Tasks

### 027.1: Implement palace_batch Tool
- [x] Create `src/tools/batch.ts` with Zod schema
- [x] Implement note selection by glob pattern
- [x] Implement note selection by query criteria
- [x] Register tool in `src/tools/index.ts`

### 027.2: Batch Update Operations
- [x] `update_frontmatter` - Modify frontmatter fields
- [x] `add_tags` - Add tags to selected notes
- [x] `remove_tags` - Remove tags from selected notes
- [x] `set_domain` - Update domain arrays (via update_frontmatter)
- [x] `set_type` - Change note type (via update_frontmatter)
- [x] `set_verified` - Mark notes as verified (via update_frontmatter)

### 027.3: Batch Move Operations
- [x] `move` - Move notes to new location
- [x] `rename` - Rename notes (with pattern support)
- [x] Update backlinks when moving/renaming
- [x] Handle hub + children moves together (handled via selection)
- [x] Prevent moving to protected directories

### 027.4: Batch Delete Operations
- [x] `delete` - Delete selected notes
- [x] Require explicit `confirm: true` for batch delete
- [x] Show count of affected files before confirming
- [x] Handle backlink cleanup option

### 027.5: Selection Mechanisms
- [x] Glob patterns (`**/*.md`, `projects/**/Related.md`)
- [x] Query criteria (type, tags, domain, dates)
- [x] Combined selection (glob AND query)
- [x] Exclusion patterns (`exclude: ["**/templates/**"]`)
- [x] Preview selection before operation (via dry_run)

### 027.6: Dry-Run Mode
- [x] Default to `dry_run: true`
- [x] Return detailed preview of what would change
- [x] Show before/after for frontmatter updates
- [x] Show source/destination for moves
- [x] List all files that would be deleted

### 027.7: Progress and Reporting
- [x] Return count of affected files
- [x] Return list of modified files
- [x] Return any errors/warnings
- [x] Support pagination for large result sets (via limit option)

### 027.8: Testing & Validation
- [x] Unit tests for selection mechanisms
- [x] Integration tests for each operation type
- [x] Test batch operations on large note sets
- [x] Test error handling (partial failures)

### 027.9: Documentation
- [x] Document `palace_batch` in CLAUDE.md
- [x] Document all operation types
- [x] Add examples for common batch tasks
- [x] Document selection patterns

## Standards & References

- [CLAUDE.md](../../../CLAUDE.md) - Project guidelines
- [obsidian-palace-mcp-spec.md](../obsidian-palace-mcp-spec.md) - Full specification

## Technical Details

### palace_batch Schema

```typescript
const batchSchema = z.object({
  vault: z.string().optional(),

  // Selection
  select: z.object({
    glob: z.string().optional().describe('Glob pattern for file selection'),
    type: z.string().optional(),
    tags: z.array(z.string()).optional(),
    domain: z.array(z.string()).optional(),
    path_prefix: z.string().optional(),
    exclude: z.array(z.string()).optional().describe('Patterns to exclude'),
  }),

  // Operation
  operation: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('update_frontmatter'),
      updates: z.record(z.any()).describe('Fields to update'),
      merge: z.boolean().default(true).describe('Merge with existing or replace'),
    }),
    z.object({
      type: z.literal('add_tags'),
      tags: z.array(z.string()),
    }),
    z.object({
      type: z.literal('remove_tags'),
      tags: z.array(z.string()),
    }),
    z.object({
      type: z.literal('move'),
      destination: z.string().describe('Destination directory'),
      update_backlinks: z.boolean().default(true),
    }),
    z.object({
      type: z.literal('rename'),
      pattern: z.string().describe('Rename pattern with $1, $2 captures'),
      match: z.string().describe('Regex to match filenames'),
    }),
    z.object({
      type: z.literal('delete'),
      handle_backlinks: z.enum(['remove', 'warn', 'ignore']).default('warn'),
    }),
  ]),

  // Options
  dry_run: z.boolean().default(true),
  confirm: z.boolean().default(false).describe('Required for delete operations'),
  limit: z.number().optional().describe('Max notes to process'),
});
```

### Response Structure

```typescript
interface BatchResult {
  success: boolean;
  dry_run: boolean;
  selected_count: number;
  processed_count: number;
  affected_files: Array<{
    path: string;
    action: 'updated' | 'moved' | 'renamed' | 'deleted';
    details?: Record<string, any>;
  }>;
  errors: Array<{
    path: string;
    error: string;
  }>;
  warnings: string[];
}
```

### Selection Logic

```typescript
async function selectNotes(select: SelectCriteria): Promise<string[]> {
  let paths: string[] = [];

  if (select.glob) {
    paths = await globMatch(select.glob);
  }

  if (select.type || select.tags || select.domain) {
    const queryResults = await queryNotes({
      type: select.type,
      tags: select.tags,
      path: select.path_prefix,
    });

    if (paths.length > 0) {
      // Intersection of glob and query results
      paths = paths.filter(p => queryResults.includes(p));
    } else {
      paths = queryResults;
    }
  }

  if (select.exclude) {
    for (const pattern of select.exclude) {
      paths = paths.filter(p => !minimatch(p, pattern));
    }
  }

  return paths;
}
```

### Example Operations

```typescript
// Remove all "Related.md" files
palace_batch({
  select: { glob: "**/Related.md" },
  operation: { type: "delete" },
  confirm: true,
  dry_run: false,
});

// Add tag to all notes in a domain
palace_batch({
  select: { domain: ["kubernetes"] },
  operation: { type: "add_tags", tags: ["infrastructure"] },
  dry_run: false,
});

// Move all stubs to a stubs directory
palace_batch({
  select: { type: "stub" },
  operation: {
    type: "move",
    destination: "_stubs/",
    update_backlinks: true,
  },
  dry_run: false,
});

// Rename files matching a pattern
palace_batch({
  select: { glob: "**/Overview.md" },
  operation: {
    type: "rename",
    match: "^(.+)/Overview\\.md$",
    pattern: "$1/$1 Overview.md",
  },
  dry_run: true,
});
```

### Files to Create/Modify

| File | Action |
|------|---------|
| `src/tools/batch.ts` | Create - new batch tool |
| `src/tools/index.ts` | Modify - register batch tool |
| `src/services/batch/` | Create - batch service directory |
| `src/services/batch/selector.ts` | Create - selection logic |
| `src/services/batch/operations.ts` | Create - operation implementations |

## Testing & Quality Assurance

### Test Coverage Requirements
- Unit tests for selection mechanisms
- Unit tests for each operation type
- Integration tests for batch workflows
- Tests for error handling

### Quality Checks
- [x] All existing tests still pass (632 tests)
- [x] Batch operations maintain index consistency
- [x] Dry-run matches actual execution
- [x] Large batch operations perform acceptably

## Acceptance Criteria

- [x] `palace_batch` tool available and documented
- [x] Glob pattern selection works correctly
- [x] Query-based selection works correctly
- [x] All operation types implemented
- [x] Dry-run (default) shows accurate preview
- [x] Delete requires explicit `confirm: true`
- [x] Backlinks updated during move/rename
- [x] All tests passing
- [x] Documentation updated

## Risks & Mitigation

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| Accidental mass deletion | Critical | Medium | Dry-run default, require confirm |
| Partial failure leaves vault inconsistent | High | Low | Transaction-like rollback (or clear error reporting) |
| Performance with large selections | Medium | Medium | Limit option, progress reporting |
| Backlink update misses references | Medium | Medium | Comprehensive link detection |

## Notes & Decisions

### Sequential vs Parallel Execution
- **Context**: Parallel could be faster for large batches
- **Decision**: Sequential execution
- **Rationale**: Safer, easier to debug, prevents race conditions
- **Future**: Could add parallel mode with careful locking

### Dry-Run Default
- **Context**: Batch operations are high-risk
- **Decision**: `dry_run: true` is the default
- **Rationale**: Always preview before executing
- **Trade-off**: Extra step for intentional operations

### No Cross-Vault Batch
- **Context**: Could batch across multiple vaults
- **Decision**: Single vault only per operation
- **Rationale**: Vaults are isolated; cross-vault operations add complexity
- **Note**: User can run multiple batch operations, one per vault

## Implementation Notes

### Files Created
- `src/services/batch/selector.ts` - Note selection logic with glob and query support
- `src/services/batch/operations.ts` - Batch operation implementations
- `src/services/batch/index.ts` - Service exports
- `src/tools/batch.ts` - palace_batch tool definition and handler
- `tests/unit/services/batch.test.ts` - Unit tests (14 tests)
- `tests/integration/batch.test.ts` - Integration tests (17 tests)

### Key Implementation Details

1. **Glob Pattern Matching**: Custom regex-based implementation (no external dependencies like minimatch/glob) that supports `*`, `**`, and `?` wildcards.

2. **Array Handling in Frontmatter**: Fixed `mergeFrontmatter` to use replacement semantics when arrays are explicitly provided (Phase 027 fix). This ensures `remove_tags` and `add_tags` operations work correctly.

3. **Protected Paths**: `.palace/`, `.obsidian/`, and `.git/` directories are protected from move/rename/delete operations.

4. **Backlink Updates**: Move and rename operations can optionally update wiki-links in notes that reference the moved/renamed notes.

### Test Coverage
- 31 tests total (14 unit + 17 integration)
- All 632 existing tests continue to pass
