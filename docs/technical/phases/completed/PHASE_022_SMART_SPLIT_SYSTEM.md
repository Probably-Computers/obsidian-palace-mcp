# Phase 022: Smart Split System

**Status**: Complete
**Start Date**: 2025-12-17
**Target Completion**: 2025-12-17
**Actual Completion**: 2025-12-17
**Owner**: Adam

## Objectives

- Fix the overly aggressive and context-unaware auto-split behavior
- Preserve hub content during split operations (prevent content destruction)
- Make auto-split disable option reliable and absolute
- Add consolidation capability to merge children back into hub
- Implement content-aware splitting that respects code blocks and templates

## Prerequisites

- [x] Phase 020 substantially complete (npm published)
- [x] Understanding of current atomic splitting implementation in `src/services/atomic/`
- [ ] Test vault with examples of problematic splits

## Scope

### In Scope
- Content-aware split detection (recognize code blocks, template content)
- Hub content preservation during splits
- Reliable `auto_split: false` option
- New `consolidate` option for `palace_improve`
- Section-level split control annotations
- Configurable split thresholds beyond line count

### Out of Scope
- AI/ML-based content analysis (future consideration)
- Retroactive fix of existing corrupted vaults (separate cleanup effort)
- Changes to the basic atomic limits configuration

## Tasks

### 022.1: Analyze Current Implementation
- [x] Review `src/services/atomic/splitter.ts` and related files
- [x] Document current split decision logic
- [x] Identify all entry points that trigger splitting
- [x] Create test cases reproducing the reported issues:
  - Template content inside documents being split
  - Hub content destruction after split
  - `auto_split: false` being ignored

### 022.2: Content-Aware Split Detection
- [x] Implement code block detection (fenced and indented)
- [x] Skip H2 headers inside code blocks when analyzing structure
- [x] Detect markdown template/example content patterns
- [x] Add `<!-- palace:keep -->` annotation support to prevent section splitting
- [x] Add `<!-- palace:split -->` annotation for explicit split hints
- [x] Create unit tests for content detection

**Implementation Notes:**
- Added `buildCodeBlockLineSet()` function in `analyzer.ts` to track lines inside code blocks
- Updated `extractSections()` and `detectSubConcepts()` to skip headers inside code blocks
- Updated `splitBySections()` in `splitter.ts` to use code-block aware intro extraction
- Added `detectAnnotation()` function to detect `<!-- palace:keep -->` and `<!-- palace:split -->` annotations
- Added `isTemplateSection()` function to detect template/example content by title patterns, markers, and blockquote ratio
- Added `annotation` and `isTemplateContent` fields to `SectionInfo` type

### 022.3: Hub Content Preservation
- [x] Modify split logic to preserve content before first H2
- [x] Keep "quick reference" or "summary" sections in hub (configurable)
- [x] Ensure hub overview isn't replaced with generic "Brief overview" text
- [x] Add `hub_sections` config option to specify sections that stay in hub
- [x] Test with real-world documents (standards, documentation)

**Implementation Notes:**
- Added `overview` parameter to `createHub()` in `hub-manager.ts`
- Updated both `store.ts` and `improve.ts` to extract and pass overview content from split results
- Hub intro content is now preserved during splits instead of being replaced
- Added `hub_sections` to `AtomicConfig` type and vault config schema
- Added `hubSections` to `SplitOptions` for per-operation overrides
- Sections with `palace:keep` annotation, template content, or matching `hub_sections` patterns stay in hub

### 022.4: Reliable Auto-Split Disable
- [x] Audit all code paths that call split logic
- [x] Ensure `auto_split: false` is respected absolutely
- [x] Add `force_single_file: true` option for guaranteed no-split storage
  - **Decision**: `auto_split: false` is already absolute, making `force_single_file` redundant
  - `auto_split` option added to `store.ts` with backwards compatibility for deprecated `force_atomic`
- [x] Document the difference between `auto_split: false` and `force_single_file`
- [x] Add warnings when content exceeds atomic limits but split is disabled

**Implementation Notes:**
- Added `auto_split` option to both `store.ts` and `improve.ts`
- Added `atomic_warning` field to output when content exceeds limits but splitting is disabled

### 022.5: Consolidation Feature
- [x] Add `consolidate: boolean` option to `palace_improve`
  - Implemented as new mode: `mode: 'consolidate'`
- [x] Implement logic to read children and merge back into hub
- [x] Handle child ordering (by filename, by link order in hub, etc.)
  - Children are merged in the order they appear in the hub's Knowledge Map
- [x] Clean up orphaned child files after consolidation
  - Controlled via `delete_children` option (default: true)
- [x] Maintain backlinks during consolidation
- [x] Test consolidation with various hub structures

**Implementation Notes:**
- Added `handleConsolidate()` function in `improve.ts`
- Consolidation converts child H1 headings back to H2 sections
- Hub type is updated (removes `_hub` suffix)
- Added `consolidation_result` to output with details about merged/deleted children

### 022.6: Configurable Split Thresholds
- [x] Add per-operation split threshold overrides
  - Added `split_thresholds` option to `palace_store`
- [x] Add `min_section_lines` to avoid splitting tiny sections
- [x] Add `max_children` to limit fragmentation
- [ ] Document new configuration options in CLAUDE.md (pending 022.8)

**Implementation Notes:**
- Added `min_section_lines` and `max_children` to `AtomicConfig` type
- Added `split_thresholds` option in `StorageOptions` for per-operation overrides
- Default values: `min_section_lines: 5`, `max_children: 10`

### 022.7: Testing & Validation
- [x] Unit tests for all new content detection logic
  - All 403 tests pass with new Phase 022 tests
- [x] Integration tests for split scenarios
- [x] Test with the problematic examples from the issues report:
  - PR template with `## Description`, `## Type of Change` as examples
  - Git Workflow Standard with quick reference sections
- [x] Test consolidation with existing fragmented hubs

**Implementation Notes:**
- Added 13 new tests for Phase 022 features in `atomic.test.ts`
- Tests cover: code block awareness, annotation detection, template detection, hub_sections config
- Integration tests verify that sections stay in hub when annotated or matched by patterns

### 022.8: Documentation
- [x] Update CLAUDE.md with new options and behaviors
- [x] Add "Content Splitting" section to documentation
- [x] Document annotation syntax (`<!-- palace:keep -->`, `<!-- palace:split -->`)
- [x] Add troubleshooting guide for split-related issues

**Implementation Notes:**
- Added `auto_split`, `split_thresholds` documentation to palace_store
- Added `consolidate` mode and `delete_children` documentation to palace_improve
- Added "Content-Aware Splitting" section explaining code-block awareness
- Added "Section-Level Split Control" section documenting annotations and hub_sections
- Added "Split Troubleshooting" section with common issues and solutions

## Standards & References

- [CLAUDE.md](../../../CLAUDE.md) - Project guidelines
- [obsidian-palace-mcp-spec.md](../obsidian-palace-mcp-spec.md) - Full specification
- Current atomic implementation: `src/services/atomic/`

## Technical Details

### Current Split Behavior (Problematic)

```typescript
// Current: splits on ANY H2 header
const sections = content.split(/^## /gm);
// Problem: doesn't check if H2 is inside code block
```

### Proposed Content Detection

```typescript
interface ContentBlock {
  type: 'prose' | 'code_block' | 'template' | 'annotation';
  startLine: number;
  endLine: number;
  content: string;
}

// Parse content into blocks, then only split on H2 in prose blocks
function parseContentBlocks(content: string): ContentBlock[];
```

### Annotation Syntax

```markdown
## Quick Reference
<!-- palace:keep -->
This section stays in the hub even during split.

## Detailed Implementation
<!-- palace:split -->
This section can be extracted to a child note.
```

### Files to Modify

| File | Changes |
|------|---------|
| `src/services/atomic/splitter.ts` | Content-aware detection, annotations |
| `src/services/atomic/analyzer.ts` | Block parsing, template detection |
| `src/tools/store.ts` | `force_single_file` option |
| `src/tools/improve.ts` | `consolidate` option |
| `src/types/index.ts` | New option types |

## Testing & Quality Assurance

### Test Coverage Requirements
- Unit tests for content block parsing
- Unit tests for annotation detection
- Integration tests for split scenarios
- Integration tests for consolidation

### Quality Checks
- [x] All existing tests still pass (365 tests)
- [x] New tests cover reported issues
- [ ] Code review completed
- [x] Documentation updated

## Acceptance Criteria

- [x] Code blocks are never split (H2 inside code block ignored)
- [x] Hub content before first H2 is preserved during split
- [x] `auto_split: false` absolutely prevents splitting
- [x] `force_single_file: true` guarantees single file output (implemented via `auto_split: false`)
- [x] `consolidate: true` merges children back into hub (mode: 'consolidate')
- [x] `<!-- palace:keep -->` annotation prevents section extraction
- [x] Template content patterns are detected and not split
- [x] `hub_sections` config keeps specified sections in hub
- [x] All tests passing (403 tests)
- [x] Documentation updated

## Risks & Mitigation

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| Breaking existing split behavior | High | Medium | Comprehensive test suite, gradual rollout |
| Consolidation data loss | High | Low | Backup before consolidation, dry-run option |
| Performance impact from content analysis | Medium | Low | Profile and optimize, cache parsed results |
| Complex edge cases in template detection | Medium | Medium | Start with common patterns, iterate |

## Notes & Decisions

### Why Content-Aware vs Simple Threshold
- **Context**: Simple line-count splitting creates nonsensical fragments
- **Decision**: Implement semantic content analysis
- **Rationale**: The cost of fixing corrupted vaults far exceeds development time
- **Alternatives considered**: Just increasing thresholds (doesn't fix template issue)

### Annotation Syntax Choice
- **Context**: Need way to control split behavior per-section
- **Decision**: HTML comments (`<!-- palace:keep -->`)
- **Rationale**: Compatible with all markdown renderers, won't display in Obsidian
- **Alternatives considered**: YAML in headers (ugly), special markers (conflict risk)
