# Phase 024: Autolink Improvements

**Status**: Completed
**Start Date**: 2025-12-17
**Target Completion**: 2025-12-17
**Actual Completion**: 2025-12-17
**Owner**: Adam

## Objectives

- ✅ Fix overly aggressive auto-linking that creates visual clutter
- ✅ Implement first-occurrence-only linking per section
- ✅ Add configurable stop-word list to prevent linking common terms
- ✅ Add domain-scoped linking to prevent cross-domain pollution
- ✅ Fix double-linking and nested bracket corruption bugs
- ✅ Prevent linking within headings and titles

## Prerequisites

- [x] Phase 022 complete (Smart Split System - content parsing)
- [x] Understanding of current autolink implementation in `src/services/autolink/`
- [x] Test vault with examples of problematic auto-linking

## Scope

### In Scope
- First-occurrence-only linking (configurable)
- Stop-word list (common terms to never link)
- Domain-scoped linking option
- Fix double-link bug (`[[A]] [[A]]` patterns)
- Fix nested bracket corruption (`[[[[A]]]]`)
- Skip linking in headings/titles
- Skip linking within existing links
- Configurable link density limits

### Out of Scope
- Semantic/contextual link suggestions
- Manual link approval workflow
- Link recommendation engine

## Tasks

### 024.1: Analyze Current Issues
- [x] Review `src/services/autolink/` implementation
- [x] Document current linking logic
- [x] Create test cases for reported issues:
  - Double linking (`[[A]] [[A]]`)
  - Nested brackets (`[[[[A]]]]`)
  - Cross-domain pollution (IoT in drift car notes)
  - Headings being linked
  - Every occurrence linked (visual clutter)

### 024.2: Fix Critical Bugs
- [x] Fix double-linking bug (same term linked twice in a row)
- [x] Fix nested bracket corruption
- [x] Fix title/content corruption (e.g., "Standards" → "CLAUDE")
- [x] Add detection for already-linked text to skip
- [x] Add unit tests for each bug fix

### 024.3: First-Occurrence Linking
- [x] Implement per-section first-occurrence tracking
- [x] Add `link_mode` option: `all` | `first_per_section` | `first_per_note`
- [x] Default to `first_per_section` for new operations
- [x] Track linked terms during processing to avoid duplicates
- [x] Reset tracking at section boundaries (H2 headers)

### 024.4: Stop-Word Configuration
- [x] Create default stop-word list:
  - Generic terms: Overview, Related, Documentation, Configuration, etc.
  - Common words: Development, Performance, Deployment, etc.
- [x] Add `stop_words` to vault config (`.palace.yaml`)
- [x] Add `stop_words` option to individual operations
- [x] Allow pattern-based stop words (regex support via `/pattern/flags` syntax)

### 024.5: Domain-Scoped Linking
- [x] Add `domain_scope` option: `same_domain` | `any` | `specified`
- [x] When `same_domain`, only link to notes in same domain
- [x] Extract domain from note path and frontmatter
- [x] Prevent cross-domain pollution (IoT not linked from automotive)
- [x] Document domain scoping behavior

### 024.6: Heading Protection
- [x] Never auto-link text within markdown headings (`# `, `## `, etc.)
- [x] Never modify the title in frontmatter
- [x] Never link within the first H1 of a document
- [x] Add tests for heading protection

### 024.7: Link Density Controls
- [x] Add `max_links_per_paragraph` option
- [x] Add `min_word_distance` between links
- [x] Implement density-aware linking that spaces out links
- [x] Warn when content would have excessive link density (`warn_density` option)

### 024.8: Retroactive Link Cleanup
**Deferred to Phase 026 (Export & Portability)** - Link stripping functionality will be implemented as part of the export system, which already includes link processing logic.

- [ ] Add `palace_unlink` or cleanup mode to remove auto-links
- [ ] Option to strip all wiki-links from a note
- [ ] Option to strip only auto-generated links (if distinguishable)
- [ ] Preserve manually-added links where possible

### 024.9: Testing & Validation
- [x] Unit tests for all bug fixes
- [x] Integration tests for first-occurrence linking
- [x] Integration tests for stop-words
- [x] Integration tests for domain scoping
- [x] Unit tests for regex stop words
- [x] Unit tests for link density warnings

### 024.10: Documentation
- [x] Update CLAUDE.md with new autolink options
- [x] Document stop-word configuration
- [x] Document domain scoping
- [x] Add troubleshooting for link-related issues

## Standards & References

- [CLAUDE.md](../../../CLAUDE.md) - Project guidelines
- [obsidian-palace-mcp-spec.md](../obsidian-palace-mcp-spec.md) - Full specification
- Current autolink implementation: `src/services/autolink/`

## Technical Details

### Current Autolink Behavior (Problematic)

```typescript
// Current: links every occurrence of every matching term
for (const term of linkableTerms) {
  content = content.replace(new RegExp(term, 'gi'), `[[${term}]]`);
}
// Problems:
// 1. Replaces ALL occurrences
// 2. Can replace inside existing links
// 3. No domain awareness
// 4. No heading protection
```

### Proposed Linking Logic

```typescript
interface AutolinkOptions {
  link_mode: 'all' | 'first_per_section' | 'first_per_note';
  stop_words: string[];
  domain_scope: 'same_domain' | 'any' | string[];
  skip_headings: boolean;
  max_links_per_paragraph: number;
  min_word_distance: number;
}

function autolink(content: string, options: AutolinkOptions): string {
  const blocks = parseContentBlocks(content); // From Phase 022
  const linkedTerms = new Set<string>();

  for (const block of blocks) {
    if (block.type === 'heading') continue;
    if (block.type === 'code_block') continue;

    // Process prose blocks with tracking
    block.content = linkBlock(block.content, linkedTerms, options);

    // Reset at section boundaries if first_per_section
    if (options.link_mode === 'first_per_section' && block.isNewSection) {
      linkedTerms.clear();
    }
  }

  return reassembleContent(blocks);
}
```

### Default Stop Words

```yaml
# .palace.yaml
autolink:
  stop_words:
    - Overview
    - Related
    - Documentation
    - Configuration
    - Deployment
    - Performance
    - Development
    - Implementation
    - Architecture
    - Introduction
    - Summary
    - Notes
    - References
    - Examples
```

### Files to Modify

| File | Changes |
|------|---------|
| `src/services/autolink/linker.ts` | First-occurrence, bug fixes |
| `src/services/autolink/scanner.ts` | Domain-aware scanning |
| `src/config/vault-config.ts` | Stop-word configuration |
| `src/tools/store.ts` | New autolink options |
| `src/tools/improve.ts` | New autolink options |
| `src/tools/autolink.ts` | New options, cleanup mode |

## Testing & Quality Assurance

### Test Coverage Requirements
- Unit tests for each bug fix
- Unit tests for first-occurrence tracking
- Integration tests for stop-words
- Integration tests for domain scoping
- Tests for heading protection

### Quality Checks
- [x] All existing tests still pass
- [x] Bug fixes verified with real examples
- [x] No regression in linking accuracy
- [x] Performance acceptable for large documents

## Acceptance Criteria

- [x] No double-linking (`[[A]] [[A]]` never occurs)
- [x] No nested bracket corruption
- [x] Headings are never auto-linked
- [x] Stop-words are respected
- [x] First-occurrence mode works correctly
- [x] Domain scoping prevents cross-domain pollution
- [x] Existing corrupted content doesn't get worse
- [x] All tests passing (480 tests)
- [x] Documentation updated

## Risks & Mitigation

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| Breaking existing links | High | Medium | Conservative matching, test thoroughly |
| Over-filtering (too few links) | Medium | Medium | Tunable thresholds, good defaults |
| Performance regression | Medium | Low | Profile linking operations |
| Stop-word list too generic | Medium | Medium | Domain-aware defaults, user configuration |

## Notes & Decisions

### First-Occurrence Default
- **Context**: Every-occurrence linking creates visual noise
- **Decision**: Default to `first_per_section`
- **Rationale**: Balances discoverability with readability
- **Trade-off**: Some useful links might not be created

### Domain Scoping Complexity
- **Context**: Cross-domain pollution is confusing but sometimes useful
- **Decision**: Default to `any`, document `same_domain` option
- **Rationale**: Don't break existing behavior; let users opt-in to stricter scoping
- **Future**: Could use semantic analysis to determine link relevance

### Stop-Word Approach
- **Context**: Generic terms like "Overview" don't need dedicated notes
- **Decision**: Configurable stop-word list with sensible defaults
- **Rationale**: Different vaults have different needs
- **Note**: Terms can be notes in one vault, stop-words in another
