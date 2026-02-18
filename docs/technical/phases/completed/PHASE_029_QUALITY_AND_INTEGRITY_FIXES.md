# Phase 029: Quality and Integrity Fixes

**Status**: Completed
**Start Date**: 2026-02-18
**Target Completion**: 2026-03-04
**Owner**: Adam

## Objectives

- Fix critical data integrity bugs in the autolink and retroactive linking systems
- Improve search relevance by prioritizing title matches in FTS5 ranking
- Enforce parent-prefixed naming for auto-split child notes to prevent generic name collisions
- Improve tool description discoverability for key options (e.g., `create_stubs`)
- Build a vault migration/health tool that inspects existing vaults and generates fix instructions

## Prerequisites

- [x] Phase 028 (Version History) completed
- [x] Auto-linking system (Phase 005, 024) operational
- [x] Retroactive linking system operational
- [x] FTS5 search index (Phase 003) operational
- [x] Atomic note splitting (Phase 012, 022) operational

## Scope

### In Scope
- Retroactive linker heading protection (Bug 1)
- Retroactive linker match specificity improvements (Bug 2)
- FTS5 column weight tuning for title prioritization (Bug 3)
- Parent-prefixed child note naming convention (Bug 4)
- Tool description improvements for stub creation discoverability (Bug 5)
- Vault health inspection and migration tool (palace_migrate)

### Out of Scope
- Time tracking / session duration features (separate phase - FR1)
- Project management / summary tools (separate phase - FR2)
- Note pinning / priority system (not needed for MCP use case)
- Cross-vault linking (explicitly not supported by design)
- Changes to the auto-linker's forward-linking path (already has heading skip zones)

## Tasks

### Bug 1: Retroactive Linker Heading Protection
- [ ] Add heading line detection to `findMentionsInContent()` in `src/services/graph/retroactive.ts`
- [ ] Skip all lines matching `^#{1,6}\s+` in the retroactive linker (consistent with auto-linker skip zones)
- [ ] Add protection for wiki-link display text in retroactive linker (verify `isInsideLink()` handles all edge cases)
- [ ] Add unit tests for heading skip in retroactive linking
- [ ] Add unit tests for wiki-link display text protection

### Bug 2: Retroactive Linking Match Specificity
- [ ] Remove single-word alias generation from `buildRetroactiveAliases()` in `src/tools/store.ts` -- only use full title and explicit aliases
- [ ] Add minimum word count threshold for retroactive matching (titles with 1 common word should not trigger vault-wide linking)
- [ ] Add tag-aware scoring to `findUnlinkedMentions()` -- prioritize matches in notes that share tags with the new note
- [ ] Consider adding a `retroactive_link_scope` option to `palace_store` for explicit control
- [ ] Add unit tests for alias specificity
- [ ] Add unit tests for tag-aware matching

### Bug 3: FTS5 Title-Prioritized Search Ranking
- [ ] Update `bm25()` call in `src/services/index/query.ts` to use column weights: `bm25(notes_fts, 10.0, 1.0, 5.0, 2.0)` (title, content, tags, domain)
- [ ] Verify column order in FTS5 table definition matches weight order
- [ ] Add unit/integration tests to verify title matches rank above content-only matches
- [ ] Test edge cases: exact title match, partial title match, multi-word queries

### Bug 4: Parent-Prefixed Child Note Naming
- [ ] Update `splitBySections()` in `src/services/atomic/splitter.ts` to prefix child filenames with parent title: `{Parent Title} - {Section Title}.md`
- [ ] Update `splitByLargeSections()` with same prefix convention
- [ ] Update `splitBySubConcepts()` with same prefix convention
- [ ] Update hub Knowledge Map generation in `src/services/atomic/hub-manager.ts` to use prefixed wiki-links
- [ ] Update any child-to-parent inline link generation to use prefixed names
- [ ] Add unit tests for prefixed child naming
- [ ] Verify Obsidian wiki-link resolution with prefixed names

### Bug 5: Tool Description Discoverability
- [ ] Update `palace_store` tool description in `src/tools/store.ts` to prominently mention `create_stubs: false` option
- [ ] Add response hints when stubs are created (e.g., "X stubs created. Use create_stubs: false to suppress.")
- [ ] Review all tool descriptions for missing or buried options
- [ ] Ensure tool input schemas have clear `description` fields for all parameters

### Vault Health & Migration Tool (palace_migrate)
- [ ] Design the migration tool as a read-first, act-second tool (inspect → report → user approves → execute)
- [ ] Implement vault inspection: detect unprefixed child notes, orphaned fragments, naming inconsistencies
- [ ] Implement inspection for notes with corrupted headings (wiki-links in H1)
- [ ] Implement inspection for retroactive link noise (notes with suspicious cross-domain links)
- [ ] Generate a migration report with recommended actions and estimated impact
- [ ] Implement migration execution mode that applies approved changes
- [ ] Register `palace_migrate` tool with MCP server
- [ ] Add unit tests for vault inspection logic
- [ ] Add integration tests for migration execution
- [ ] Update CLAUDE.md with palace_migrate documentation

### Testing & Validation
- [ ] Run full test suite after all bug fixes
- [ ] Test against a real vault with known issues (inspect existing vault health)
- [ ] Verify no regressions in auto-linking, retroactive linking, search, or splitting
- [ ] Verify migration tool works on existing vault data without data loss

### Documentation
- [ ] Update CLAUDE.md tool schemas for any changed interfaces
- [ ] Update tool descriptions in source code
- [ ] Document migration tool usage and options
- [ ] Add notes about retroactive linking behavior changes

## Standards & References

- [CLAUDE.md](../../../CLAUDE.md) - Project guidelines and tool schemas
- [Phase Guide](../PHASE_GUIDE.md) - Phase management standards
- [Git Workflow](../GIT_WORKFLOW_STANDARDS.md) - Commit and branching standards
- [Phase 005](completed/PHASE_005_AUTO_LINKING.md) - Original auto-linking implementation
- [Phase 024](completed/PHASE_024_AUTOLINK_IMPROVEMENTS.md) - Autolink improvements (link modes, stop words, domain scoping)
- [Phase 012](completed/PHASE_012_ATOMIC_NOTE_SYSTEM.md) - Atomic note splitting
- [Phase 022](completed/PHASE_022_SMART_SPLIT_SYSTEM.md) - Smart split improvements

## Technical Details

### Bug 1: Retroactive Linker Fix

The retroactive linker in `src/services/graph/retroactive.ts` has a `findMentionsInContent()` function that processes content line-by-line. It skips frontmatter and code block markers but does NOT skip heading lines. The fix adds a heading check:

```typescript
// In findMentionsInContent(), after code block check (line ~115)
// Skip heading lines - identity text should not be modified
if (/^#{1,6}\s+/.test(line)) {
  continue;
}
```

The auto-linker (`src/services/autolink/linker.ts`) already has heading skip zones at lines 95-103, so this brings the retroactive linker to parity.

### Bug 2: Match Specificity

Current `buildRetroactiveAliases()` in `store.ts` extracts individual domain terms as aliases. For a note with domain `['consulting', 'analysis']`, the word "analysis" becomes a search term that matches across the entire vault.

Fix approach:
1. Only use full title and explicitly declared aliases for retroactive matching
2. Stop generating aliases from domain terms
3. Add minimum match length (e.g., titles must be 2+ words or 8+ characters to retroactively link)
4. Use tag overlap as a relevance signal -- notes sharing tags with the new note are higher priority for retroactive linking

### Bug 3: FTS5 Column Weights

Current query uses `bm25(notes_fts)` with no column weights (all equal). Fix:

```sql
-- Column order in FTS5 table: title, content, tags, domain
-- Weights: title=10, content=1, tags=5, domain=2
bm25(notes_fts, 10.0, 1.0, 5.0, 2.0)
```

This gives title matches 10x the weight of content matches. A search for "time tracking" will rank a note titled "Time Tracking Requirements" above a hub that mentions it in passing.

### Bug 4: Child Naming Convention

Current: `splitter.ts` generates child filenames from section title only: `Overview.md`
New: `{Parent Title} - {Section Title}.md` → `Kubernetes - Overview.md`

Separator: ` - ` (space-dash-space) for readability in Obsidian sidebar.

Wiki-links in Knowledge Map update from `[[Overview]]` to `[[Kubernetes - Overview]]`.

### Migration Tool Design

The `palace_migrate` tool follows a safe, two-phase approach:

1. **Inspect mode** (default): Scan vault, identify issues, generate report
2. **Execute mode**: Apply approved changes with version history backup

The tool should NEVER auto-execute without user approval. It generates an instruction set that the AI can present to the user for review.

Inspection categories:
- Unprefixed child notes (need renaming)
- Corrupted headings (wiki-links in H1)
- Orphaned fragments (children without valid hub reference)
- Naming inconsistencies
- Retroactive link noise

## Testing & Quality Assurance

### Test Coverage Requirements
- Unit tests for all bug fixes (heading skip, alias specificity, column weights, child naming)
- Integration tests for migration tool
- Regression tests for existing autolink, retroactive link, search, and split functionality

### Quality Checks
- [ ] All existing tests passing after changes
- [ ] New tests cover all bug fix scenarios
- [ ] No data corruption possible from migration tool (dry_run default)
- [ ] Tool descriptions reviewed and improved

## Acceptance Criteria

- [ ] Retroactive linker never modifies heading lines (H1-H6)
- [ ] Retroactive linker never modifies content inside existing wiki-links
- [ ] Single common words no longer trigger vault-wide retroactive linking
- [ ] Search for "time tracking" ranks title matches above content-only matches
- [ ] Auto-split children use `{Parent} - {Section}.md` naming convention
- [ ] `palace_store` response includes stub creation hints when stubs are created
- [ ] `palace_migrate` tool can inspect a vault and generate a health report
- [ ] `palace_migrate` tool can apply approved changes with backup
- [ ] All existing tests pass (no regressions)
- [ ] All new tests pass

## Risks & Mitigation

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| Child renaming breaks existing wiki-links | High | Medium | Migration tool updates backlinks; version history provides rollback |
| FTS5 weight changes alter search behavior unexpectedly | Medium | Low | Test with known queries; weights are tunable |
| Retroactive link changes reduce valid linking | Medium | Low | Tag-aware scoring adds relevance, not just removes noise |
| Migration tool corrupts vault data | High | Low | Dry-run default; version history backup before changes; user approval required |

## Notes & Decisions

### 2026-02-18 - Phase Scope Decision
- Context: User feedback identified 5 bugs and 3 feature requests
- Decision: Bugs 1-5 go into this phase; FR1 (time tracking) and FR2 (project management) get separate phases with research; FR3 (pinning) is not needed for MCP use case
- Rationale: Bugs are data integrity issues that need fixing before adding new features

### 2026-02-18 - Child Naming Convention
- Context: Auto-split creates generic names like Overview.md, Impact.md
- Decision: Use parent-title prefix (`Kubernetes - Overview.md`) instead of subdirectories
- Rationale: Keeps flat directory structure, avoids nesting, enforces uniqueness, reads well in Obsidian sidebar

### 2026-02-18 - Retroactive Linking Approach
- Context: Cross-domain retroactive linking is intended (second brain concept) but match specificity is too loose
- Decision: Keep vault-wide linking but fix match specificity -- stop generating single-word aliases from domain terms, use tag overlap for relevance
- Rationale: Preserves knowledge traceability while eliminating noise from common word matches

### 2026-02-18 - Migration Tool Design
- Context: Existing vaults may have unprefixed children, corrupted headings, and other issues from pre-fix behavior
- Decision: Build as inspect-first tool that generates recommendations for user approval, never auto-executes
- Rationale: User's data integrity is paramount; the tool should assist, not assume

### 2026-02-18 - MCP Tool Discovery
- Context: Question about whether AI clients need a help tool to discover MCP features
- Decision: No help tool needed -- MCP protocol handles tool discovery via `tools/list`
- Rationale: Tool descriptions ARE the documentation. Improving descriptions is the right fix for discoverability issues.
