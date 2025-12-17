# Phase 025: Metadata Integrity

**Status**: Complete
**Start Date**: 2025-12-17
**Target Completion**: 2025-12-17
**Actual Completion**: 2025-12-17
**Owner**: Adam

## Objectives

- Fix type metadata corruption (e.g., `research_hub_hub`)
- Implement type validation against allowed values
- Auto-recalculate stale `children_count` values
- Prevent excessive stub creation for common words
- Add frontmatter validation and repair capabilities
- Ensure metadata consistency across operations

## Prerequisites

- [x] Phase 024 complete (Autolink Improvements - stop-words)
- [x] Understanding of current frontmatter handling in `src/utils/frontmatter.ts`
- [x] Test vault with examples of corrupted metadata

## Scope

### In Scope
- Type value validation and normalization
- `children_count` recalculation on read/query
- Stub creation controls (min confidence, stop-words)
- Frontmatter schema validation
- Metadata repair tool
- Domain tag validation

### Out of Scope
- Custom frontmatter schema definitions per vault
- Automatic migration of corrupted metadata
- Integration with Obsidian's frontmatter plugins

## Tasks

### 025.1: Type Validation
- [x] Define canonical type values in `src/types/note-types.ts`
- [x] Add validation when writing frontmatter
- [x] Prevent double-suffixing (`_hub_hub`, `_stub_stub`)
- [x] Normalize invalid types to closest valid type
- [x] Log warnings for corrected type values

### 025.2: Children Count Accuracy
- [x] Recalculate `children_count` on hub read/query
- [x] Don't rely on stored value; compute from actual children
- [x] Update stored value when children change
- [x] Add `validate_children` option to hub-manager
- [x] Handle orphaned children (children without hub)

### 025.3: Stub Creation Controls
- [x] Inherit stop-words from autolink configuration
- [x] Add `StubCreationOptions` interface
- [x] Minimum title length (configurable, default: 2)
- [x] Maximum stubs per operation limit (configurable, default: 10)
- [x] Domain-aware stub creation (same domain only option)
- [x] Confidence threshold for stub creation (configurable)

### 025.4: Frontmatter Schema Validation
- [x] Define required fields per note type
- [x] Define optional fields with defaults
- [x] Validate on read and write operations via `validateFrontmatter()`
- [x] Validation integrated into `palace_repair` tool
- [x] Return validation errors/warnings in responses

### 025.5: Metadata Repair Tool
- [x] Add `palace_repair` tool
- [x] Options:
  - `types` - Fix invalid type values
  - `children_count` - Recalculate hub children
  - `dates` - Fix invalid date formats
  - `domains` - Normalize domain arrays
  - `required_fields` - Add missing required fields
  - `all` - Perform all repairs
- [x] Dry-run mode for preview (default)
- [x] Batch repair across vault

### 025.6: Domain Tag Consistency
- [x] Validate domain arrays are actually arrays
- [x] Normalize domain casing (lowercase)
- [x] Detect orphaned domains (domains with no other notes)
- [x] Suggest domain consolidation for similar tags

### 025.7: Index Metadata Sync
- [x] Ensure index reflects actual file frontmatter
- [x] Detect and flag desync between file and index
- [x] Auto-repair index on desync detection
- [x] Add `fullReindex` option for full rebuild

### 025.8: Testing & Validation
- [x] Unit tests for type validation (25 tests)
- [x] Unit tests for frontmatter schema (18 tests)
- [x] All 523 tests passing
- [x] Type normalization tested with real-world cases

### 025.9: Documentation
- [x] Document valid type values in CLAUDE.md
- [x] Document frontmatter schema requirements
- [x] Add repair tool documentation
- [x] Add Valid Note Types section

## Standards & References

- [CLAUDE.md](../../../CLAUDE.md) - Project guidelines
- [obsidian-palace-mcp-spec.md](../obsidian-palace-mcp-spec.md) - Full specification
- Frontmatter handling: `src/utils/frontmatter.ts`

## Technical Details

### Valid Type Values

```typescript
const VALID_NOTE_TYPES = [
  'research',
  'research_hub',
  'command',
  'infrastructure',
  'client',
  'project',
  'pattern',
  'troubleshooting',
  'standard',
  'stub',
  'daily',
] as const;

type NoteType = typeof VALID_NOTE_TYPES[number];

function normalizeType(type: string): NoteType {
  // Remove double suffixes
  type = type.replace(/_hub_hub$/, '_hub');
  type = type.replace(/_stub_stub$/, '_stub');

  // Validate against allowed types
  if (VALID_NOTE_TYPES.includes(type as NoteType)) {
    return type as NoteType;
  }

  // Map common mistakes
  const typeMap: Record<string, NoteType> = {
    'research_hub_hub': 'research_hub',
    'hub': 'research_hub',
    'note': 'research',
  };

  return typeMap[type] || 'research';
}
```

### Children Count Calculation

```typescript
async function getAccurateChildrenCount(hubPath: string): Promise<number> {
  const hubDir = path.dirname(hubPath);
  const hubName = path.basename(hubPath, '.md');

  // Find children by:
  // 1. Notes in same directory that aren't the hub
  // 2. Notes with parent reference in frontmatter
  // 3. Notes linked from hub's Knowledge Map section

  const children = await findChildren(hubPath);
  return children.length;
}
```

### Frontmatter Schema

```typescript
const frontmatterSchema = z.object({
  type: z.enum(VALID_NOTE_TYPES),
  title: z.string().min(1),
  status: z.enum(['active', 'stub', 'archived']).optional(),
  domain: z.array(z.string()).optional(),
  created: z.string().datetime().optional(),
  modified: z.string().datetime().optional(),
  confidence: z.number().min(0).max(1).optional(),
  verified: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  related: z.array(z.string()).optional(),
  children_count: z.number().int().min(0).optional(),
  palace: z.object({
    version: z.number(),
  }).optional(),
});
```

### Repair Tool Schema

```typescript
const repairSchema = z.object({
  path: z.string().optional().describe('Note or directory to repair'),
  vault: z.string().optional(),
  dry_run: z.boolean().default(true),
  repairs: z.array(z.enum([
    'types',
    'children_count',
    'dates',
    'domains',
    'required_fields',
    'all',
  ])).default(['all']),
});
```

### Files to Modify

| File | Changes |
|------|---------|
| `src/types/index.ts` | Valid types enum, schema |
| `src/utils/frontmatter.ts` | Validation, normalization |
| `src/services/vault/writer.ts` | Validate on write |
| `src/services/vault/reader.ts` | Validate on read, repair option |
| `src/tools/repair.ts` | Create - new repair tool |
| `src/tools/store.ts` | Stub creation controls |

## Testing & Quality Assurance

### Test Coverage Requirements
- Unit tests for type validation
- Unit tests for schema validation
- Integration tests for repair operations
- Tests for children_count accuracy

### Quality Checks
- [x] All existing tests still pass (480 original + 43 new = 523)
- [x] Validation doesn't break valid notes
- [x] Repair operations are idempotent
- [x] Performance acceptable for large vaults

## Acceptance Criteria

- [x] Invalid types are normalized to valid values
- [x] `_hub_hub` double-suffixing never occurs
- [x] `children_count` is always accurate
- [x] Stubs not created for stop-words
- [x] `palace_repair` tool available and documented
- [x] Frontmatter validation catches common issues
- [x] All tests passing (523 tests)
- [x] Documentation updated

## Risks & Mitigation

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| Breaking valid but unusual types | High | Medium | Comprehensive type list, warning before normalization |
| Repair causing data loss | High | Low | Dry-run default, backup recommendation |
| Performance impact of validation | Medium | Medium | Cache validation results, lazy validation |
| Over-aggressive stub filtering | Medium | Medium | Configurable thresholds |

## Notes & Decisions

### Type Normalization vs Rejection
- **Context**: Invalid types exist in vaults
- **Decision**: Normalize rather than reject
- **Rationale**: Better to fix silently than break operations
- **Trade-off**: Could mask data entry errors

### Children Count: Stored vs Computed
- **Context**: Stored children_count becomes stale
- **Decision**: Always compute on read, update stored value
- **Rationale**: Accuracy more important than minor performance cost
- **Future**: Could cache with invalidation on child changes

### Stub Stop-Words
- **Context**: Terms like "Overview" create useless stubs
- **Decision**: Share stop-words with autolink configuration
- **Rationale**: Same terms shouldn't be linked OR stubbed
- **Note**: Can have separate stub-specific stop-words too
