# Phase 032: Code Quality and Coverage

**Status**: Completed
**Start Date**: 2026-02-19
**Completion Date**: 2026-02-19
**Owner**: Adam

## Objectives

- Increase Codacy code coverage from 58% to 80%+ (Codacy goal: 60%, GIT_WORKFLOW_STANDARDS target: 80%)
- Resolve Codacy issues (308 total: security, complexity, CI)
- Update documentation to reflect the new CI pipeline, pre-commit hooks, and coverage tooling
- Pin GitHub Actions to commit SHAs for supply chain security

## Prerequisites

- [x] GitHub Actions CI pipeline running (v2.2.3)
- [x] Codacy coverage integration active (58.08% reported)
- [x] Husky + lint-staged pre-commit hooks installed
- [x] `@vitest/coverage-v8` installed and generating LCOV reports

## Scope

### In Scope

- Unit tests for uncovered and low-coverage source files
- Integration tests for critical tools (store, query, recall)
- Refactoring complex functions (cyclomatic complexity > 8)
- Input validation for path-based security issues
- Documentation updates (README, CLAUDE.md, CONTRIBUTING.md, GIT_WORKFLOW_STANDARDS.md)
- Pin GitHub Actions to full commit SHAs

### Out of Scope

- Performance optimization
- New features or tools
- Codacy gate policy enforcement (set as target, not blocker)

## Initial State

### Coverage (Codacy as of 2026-02-18)

| Metric | Value |
|--------|-------|
| Overall coverage | 58.08% |
| Covered lines | 16,524 / 28,452 |
| Files uncovered | 108 / 214 |
| Files with low coverage | 43 |
| Target | 80% |

### Codacy Issues (308 total, first 100 analyzed)

| Pattern | Category | Severity | Count (sample) | Description |
|---------|----------|----------|----------------|-------------|
| detect-non-literal-fs-filename | Security | High | 37 | Variable filenames in `fs` calls |
| path-join-resolve-traversal | Security | Error | 32 | `path.join`/`resolve` with user input |
| Lizard CCN | Complexity | Warning | 20 | Functions exceeding cyclomatic complexity 8 |
| Lizard NLOC | Complexity | Warning | 10 | Functions exceeding 50 lines |
| third-party-action-not-pinned | Security | High | 1 | Unpinned GitHub Action |

### Worst Complexity Offenders (CCN)

| Function | File | CCN | Limit | Outcome |
|----------|------|-----|-------|---------|
| escapeRegex | services/standards/validator.ts | 29 | 8 | False positive (one-liner regex char class) |
| mergeFrontmatter | utils/frontmatter.ts | 26 | 8 | Acceptable (38 lines, ternary inflation) |
| analyzeDomains | services/metadata/domain-analyzer.ts | 21 | 8 | **Refactored** — extracted 3 helpers |
| indexNote | services/index/sync.ts | 19 | 8 | **Refactored** — extracted 2 helpers |
| checkIndexSync | services/metadata/index-sync.ts | 18 | 8 | Acceptable (well-structured) |
| buildMessage | tools/improve.ts | 15 | 8 | Acceptable (optional chaining inflation) |
| renameNotes | services/batch/operations.ts | 14 | 8 | Acceptable (optional chaining inflation) |

## Final State

### Coverage (local vitest as of 2026-02-19)

| Metric | Value |
|--------|-------|
| Overall coverage | **81.51%** |
| Tests passing | **1085** (up from ~700) |
| Target | 80% |

### Quality Checks

| Check | Status |
|-------|--------|
| `npm run lint` | Passing |
| `npm run typecheck` | Passing |
| `npm run build` | Passing |
| `npm run test:coverage` >= 80% | **81.51%** |

## Tasks

### Task 1: Pin GitHub Actions to Commit SHAs

- [x] Look up commit SHAs for `actions/checkout@v4`, `actions/setup-node@v4`, `codacy/codacy-coverage-reporter-action@v1.3.0`
- [x] Update `.github/workflows/ci.yml` with pinned SHAs and version comments

### Task 2: Coverage — High-Impact Tool Handler Tests

Priority: files with most source lines that have 0% coverage.

- [x] Identify the 20 largest uncovered files by line count
- [x] Write unit tests for tool handlers:
  - [x] src/tools/store.ts (0% -> 94%)
  - [x] src/tools/query.ts (0% -> covered)
  - [x] src/tools/recall.ts (0% -> covered)
  - [x] src/tools/structure.ts (0% -> 100%)
  - [x] src/tools/links.ts (0% -> covered)
  - [x] src/tools/list.ts (0% -> covered)
  - [x] src/tools/dataview.ts (0% -> covered)
  - [x] src/tools/history.ts (0% -> covered)
  - [x] src/tools/autolink.ts (0% -> covered)
  - [x] src/tools/clarify.ts (0% -> covered)
  - [x] src/tools/migrate.ts (0% -> covered)
  - [x] src/tools/check.ts (0% -> covered)
  - [x] src/tools/time-log.ts (0% -> 100%)
  - [x] src/tools/time-summary.ts (0% -> 100%)
- [x] Improve coverage for partially-covered files:
  - [x] src/utils/wikilinks.ts (65% -> 100%)
  - [x] src/tools/orphans.ts (47% -> covered)

### Task 3: Coverage — Service Layer Tests

- [x] src/services/standards/loader.ts (0% -> covered)
- [x] src/services/standards/validator.ts (0% -> covered)
- [x] src/services/metadata/domain-analyzer.ts (0% -> covered)
- [x] src/services/metadata/index-sync.ts (0% -> 100%)
- [x] src/services/operations/cleanup.ts (24% -> 100%)
- [x] src/services/migrate/executor.ts (0% -> covered)

### Task 4: Complexity Refactoring

Refactored functions exceeding cyclomatic complexity limit (8):

- [x] `analyzeDomains` (CCN: 21) — extracted `parseDomainValue()`, `buildDomainUsageMap()`, `findSimilarDomainPairs()`
- [x] `indexNote` (CCN: 19) — extracted `extractIndexFields()`, `buildNoteParams()`
- [x] `escapeRegex` (CCN: 29) — triaged as false positive (single-line regex character class, Lizard counts each `|` branch)
- [x] `mergeFrontmatter` (CCN: 26) — triaged as acceptable (38 lines, CCN inflated by ternary/nullish-coalescing operators)
- [x] `buildMessage` (CCN: 15) — triaged as acceptable (optional chaining inflates CCN)
- [x] `renameNotes` (CCN: 14) — triaged as acceptable (optional chaining inflates CCN)

Long function analysis (>50 LOC):

- [x] `generateDiff` (185 LOC) — already decomposed into 4 helper functions in prior phases
- [x] `findSkipZones` (108 LOC) — clean single-purpose scanner, no further decomposition needed

### Task 5: Security Issue Triage

- [x] Audit path-traversal issues — determined tool entry points need validation, internal calls are safe
- [x] Add `validateNotePath()` utility to `src/utils/vault-param.ts` (rejects absolute paths, `../` traversal)
- [x] Apply `validateNotePath()` to all 6 tool handlers that accept user-supplied paths:
  - [x] `palace_read` (read.ts)
  - [x] `palace_delete` (delete.ts)
  - [x] `palace_improve` (improve.ts)
  - [x] `palace_export` (export.ts)
  - [x] `palace_history` (history.ts)
  - [x] `palace_revert` (revert.ts)
- [x] Remove buggy unused `isPathWithinVault()` from `resolver.ts` (used `join()` instead of `resolve()`, never imported)
- [x] Write 8 unit tests for `validateNotePath()` covering all edge cases
- [x] Non-literal-fs-filename issues (37) triaged as expected for file-system tool — internal calls, not direct user input

### Task 6: Documentation Updates

#### README.md
- [x] Add CI status badge
- [x] Add Codacy coverage badge
- [x] Update Development section to mention pre-commit hooks and coverage

#### CLAUDE.md
- [x] Add "Continuous Integration" section documenting the pipeline
- [x] Add "Pre-commit Hooks" section documenting Husky + lint-staged
- [x] Update "Testing" section with coverage tooling details

#### CONTRIBUTING.md
- [x] Add note that `npm install` sets up Husky hooks automatically
- [x] Add "Pre-commit Hooks" subsection
- [x] Add "Continuous Integration" section
- [x] Update Pull Request section to reference CI checks

#### GIT_WORKFLOW_STANDARDS.md
- [x] **Overhaul "Git Hooks" section** — replace Python tooling (flake8, black, pre-commit) with Husky + lint-staged
- [x] **Overhaul "Continuous Integration" section** — replace generic description with actual GitHub Actions setup
- [x] Update "Branch Protection" required status checks to reflect reality
- [x] Replace Python `.gitignore` example with Node.js/TypeScript version
- [x] Update "Additional Resources" links (Husky + lint-staged instead of pre-commit framework)
- [x] Remove Django/Python references throughout
- [x] Update document metadata (Last Updated date)

### Task 7: Integration Tests

- [x] `tests/integration/store.test.ts` — 16 tests (path conflicts, stub creation, retroactive linking, atomic splitting, operation tracking, file I/O)
- [x] `tests/integration/query.test.ts` — 14 tests (vault filtering, date filters, type queries, confidence, cross-vault attribution, pagination)
- [x] `tests/integration/recall.test.ts` — 16 tests (vault filtering, search mode, filter options, FTS scoring, content loading, metadata)

### Task 8: Verification

- [x] `npm run lint` passes
- [x] `npm run typecheck` passes
- [x] `npm run build` passes
- [x] `npm run test:coverage` shows >= 80% coverage (81.51%)
- [x] No new lint or typecheck errors introduced
- [x] All documentation accurate and consistent

## Standards & References

- [CLAUDE.md](../../CLAUDE.md) - Project guidelines
- [Git Workflow Standards](../GIT_WORKFLOW_STANDARDS.md) - Git practices (updated this phase)
- [Contributing Guide](../CONTRIBUTING.md) - Contributor documentation (updated this phase)
- [Phase Guide](../PHASE_GUIDE.md) - Phase management

## Technical Details

### Coverage Strategy

Focus on unit tests for maximum coverage ROI:
1. **Tool handlers** — Most were 0% covered, each is 100-300 lines. Mocked all dependencies, tested handler logic.
2. **Service modules** — Used in-memory SQLite for database-dependent services (index-sync, cleanup, domain-analyzer).
3. **Utilities** — Filled gaps in wikilinks.ts (65% -> 100%), vault-param.ts (added validateNotePath tests).

### Security Issue Analysis

The security patterns flagged by Codacy (Semgrep) are largely expected for a file-system-based tool:
- `path.join(vaultPath, userPath)` is the fundamental operation of this tool
- **Mitigation implemented**: `validateNotePath()` added at all 6 tool entry points that accept user-supplied paths
- Uses `path.resolve()` + `startsWith()` containment check (not the buggy `join()` approach)
- Non-literal-fs-filename issues (37) are internal service calls — accepted risk
- Removed unused buggy `isPathWithinVault()` that was never imported by any tool

### Complexity Approach

- Focused refactoring on genuinely complex functions (`analyzeDomains`, `indexNote`)
- Identified Lizard false positives: regex character classes, ternary operators, nullish coalescing, and optional chaining all inflate CCN
- Functions like `escapeRegex` (CCN 29) are one-liners — Lizard counts each `|` in regex alternation
- Functions like `mergeFrontmatter` (CCN 26) are 38 lines — CCN inflated by `??` operators
- Decision: refactor where genuine complexity exists, document false positives rather than chase metrics

### Test Files Created

| Test File | Tests | Coverage Target |
|-----------|-------|-----------------|
| tests/unit/tools/store.test.ts | 12 | store.ts |
| tests/unit/tools/check.test.ts | 10 | check.ts |
| tests/unit/tools/links.test.ts | 7 | links.ts |
| tests/unit/tools/list.test.ts | 5 | list.ts |
| tests/unit/tools/dataview.test.ts | 5 | dataview.ts |
| tests/unit/tools/history.test.ts | 5 | history.ts |
| tests/unit/tools/autolink.test.ts | 5 | autolink.ts |
| tests/unit/tools/clarify.test.ts | 5 | clarify.ts |
| tests/unit/tools/migrate.test.ts | 5 | migrate.ts |
| tests/unit/tools/query.test.ts | 6 | query.ts |
| tests/unit/tools/recall.test.ts | 6 | recall.ts |
| tests/unit/tools/time-log.test.ts | 4 | time-log.ts |
| tests/unit/tools/time-summary.test.ts | 4 | time-summary.ts |
| tests/unit/tools/orphans-handler.test.ts | 16 | orphans.ts |
| tests/unit/services/standards.test.ts | 16 | standards loader & validator |
| tests/unit/services/domain-analyzer.test.ts | 16 | domain-analyzer.ts |
| tests/unit/utils/wikilinks.test.ts | 20 | wikilinks.ts |
| tests/unit/services/index-sync.test.ts | 14 | index-sync.ts |
| tests/unit/services/cleanup.test.ts | 16 | cleanup.ts |
| tests/unit/services/migrate-executor.test.ts | 8 | migrate/executor.ts |
| tests/integration/store.test.ts | 16 | store.ts (integration) |
| tests/integration/query.test.ts | 14 | query.ts (integration) |
| tests/integration/recall.test.ts | 16 | recall.ts (integration) |

## Acceptance Criteria

- [x] Local coverage >= 80% (achieved: **81.51%**)
- [x] CI pipeline green on all Node versions
- [x] All 4 documentation files updated
- [x] GIT_WORKFLOW_STANDARDS.md no longer references Python tooling
- [x] GitHub Actions pinned to commit SHAs
- [x] No new lint or typecheck errors introduced
- [x] Path traversal prevention added to all tool entry points

## Risks & Mitigation

| Risk | Impact | Probability | Mitigation Strategy | Outcome |
|------|--------|-------------|---------------------|---------|
| Refactoring introduces regressions | High | Medium | Write tests before refactoring, run full suite after each change | No regressions — 1085 tests passing throughout |
| 80% coverage unreachable without mocking overhaul | Medium | Low | Focus on testable units first, use dependency injection where needed | Achieved 81.51% with standard vi.mock() approach |
| Security false positives inflate issue count | Low | High | Triage and mark accepted risks in Codacy | 37 non-literal-fs-filename issues are expected internal usage |
| Large scope creep | Medium | Medium | Prioritize coverage and docs first, complexity refactoring second | Scope expanded to include integration tests, still completed in 1 day |

## Notes & Decisions

### 2026-02-18 - Phase Creation

- Context: CI pipeline added (v2.2.3), Codacy reporting 58% coverage, 308 issues
- Decision: Create dedicated phase for quality improvement
- Rationale: Coverage gap (58% vs 80% target) and stale documentation need focused attention
- Priority order: Docs + CI pinning (quick wins) -> Coverage (bulk of work) -> Complexity (refactoring) -> Security (triage)

### 2026-02-19 - Coverage Strategy

- Decision: Write mocked unit tests for tool handlers first (highest ROI — 0% coverage files with 100-300 lines each)
- Decision: Use in-memory SQLite for database-dependent service tests (index-sync, cleanup, domain-analyzer)
- Result: Coverage jumped from 58% to 77% with tool handler tests alone

### 2026-02-19 - Complexity Triage

- Decision: Only refactor genuinely complex functions, document false positives
- Finding: Lizard CCN is inflated by regex alternation, ternary operators, nullish coalescing, and optional chaining
- `escapeRegex` (CCN 29) is a single-line function — each `|` in the regex character class counts as a branch
- `mergeFrontmatter` (CCN 26) is 38 lines — `??` operators inflate CCN but code is readable
- Refactored `analyzeDomains` (CCN 21 -> ~6 per function) and `indexNote` (CCN 19 -> ~8) — genuinely complex

### 2026-02-19 - Security Triage

- Finding: `isPathWithinVault()` exists in resolver.ts but is never imported by any tool handler
- Finding: The function uses `join()` instead of `resolve()`, making it vulnerable to `../` traversal
- Decision: Create corrected `validateNotePath()` in vault-param.ts using `resolve()` + `startsWith()` containment check
- Applied to all 6 tool handlers: read, delete, improve, export, history, revert
- Removed buggy unused `isPathWithinVault()`

### 2026-02-19 - Integration Tests Added

- Decision: Add integration tests for the 3 most critical tools (store, query, recall) in addition to unit tests
- Rationale: User explicitly requested both mocked unit tests AND integration tests for critical tools
- Result: 46 additional integration tests covering complex workflows (stub creation, retroactive linking, vault filtering, FTS scoring)
