# Phase 032: Code Quality and Coverage

**Status**: Planning
**Start Date**: 2026-02-19
**Target Completion**: 2026-02-28
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
- Refactoring complex functions (cyclomatic complexity > 8)
- Input validation for path-based security issues
- Documentation updates (README, CLAUDE.md, CONTRIBUTING.md, GIT_WORKFLOW_STANDARDS.md)
- Pin GitHub Actions to full commit SHAs

### Out of Scope

- Integration test expansion (focus on unit coverage first)
- Performance optimization
- New features or tools
- Codacy gate policy enforcement (set as target, not blocker)

## Current State

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

### Top Files by Issue Count

| File | Issues |
|------|--------|
| src/services/atomic/hub-manager.ts | 7 |
| src/tools/improve.ts | 7 |
| src/services/vault/reader.ts | 6 |
| src/services/vault/resolver.ts | 6 |
| src/services/atomic/children-count.ts | 4 |
| src/services/atomic/splitter.ts | 4 |
| src/services/export/exporter.ts | 4 |
| src/services/history/storage.ts | 4 |
| src/services/vault/writer.ts | 4 |

### Worst Complexity Offenders (CCN)

| Function | File | CCN | Limit |
|----------|------|-----|-------|
| escapeRegex | services/standards/validator.ts | 29 | 8 |
| mergeFrontmatter | utils/frontmatter.ts | 26 | 8 |
| analyzeDomains | services/metadata/domain-analyzer.ts | 21 | 8 |
| (anonymous) | services/index/sync.ts | 19 | 8 |
| checkIndexSync | services/metadata/index-sync.ts | 18 | 8 |
| buildMessage | tools/improve.ts | 15 | 8 |
| (anonymous) | services/project/context-loader.ts | 14 | 8 |
| renameNotes | services/batch/operations.ts | 14 | 8 |
| addRetroactiveLinks | services/graph/retroactive.ts | 13 | 8 |
| (anonymous) | services/dataview/executor.ts | 13 | 8 |

### Longest Functions (NLOC)

| Function | File | Lines | Limit |
|----------|------|-------|-------|
| generateDiff | services/history/diff.ts | 185 | 50 |
| findSkipZones | services/autolink/linker.ts | 108 | 50 |
| historyHandlerInternal | tools/history.ts | 88 | 50 |
| findOrphansInDir | services/operations/cleanup.ts | 85 | 50 |
| renameNotes | services/batch/operations.ts | 83 | 50 |
| buildChildContent | services/atomic/splitter.ts | 70 | 50 |
| registerTools | tools/index.ts | 67 | 50 |
| buildDomainPathFromVault | tools/check.ts | 52 | 50 |
| createDefaultVaultConfig | config/vault-config.ts | 51 | 50 |
| addRetroactiveLinks | services/graph/retroactive.ts | 51 | 50 |

## Tasks

### Task 1: Pin GitHub Actions to Commit SHAs

- [ ] Look up commit SHAs for `actions/checkout@v4`, `actions/setup-node@v4`, `codacy/codacy-coverage-reporter-action@v1.3.0`
- [ ] Update `.github/workflows/ci.yml` with pinned SHAs and version comments

### Task 2: Coverage — High-Impact Unit Tests

Priority: files with most source lines that have 0% coverage.

- [ ] Identify the 20 largest uncovered files by line count
- [ ] Write unit tests for services (highest ROI):
  - [ ] src/tools/store.ts (0% — the main storage tool)
  - [ ] src/tools/query.ts (0%)
  - [ ] src/tools/recall.ts (0%)
  - [ ] src/tools/structure.ts (0%)
  - [ ] src/tools/undo.ts (0%)
  - [ ] src/tools/revert.ts (0%)
  - [ ] src/tools/standards.ts (0%)
  - [ ] src/tools/stubs.ts (0%)
  - [ ] src/tools/related.ts (0%)
  - [ ] src/tools/project-summary.ts (0%)
  - [ ] src/tools/time-log.ts (0%)
  - [ ] src/tools/time-summary.ts (0%)
- [ ] Improve coverage for partially-covered files:
  - [ ] src/utils/wikilinks.ts (65%)
  - [ ] src/tools/orphans.ts (47%)
  - [ ] src/tools/read.ts (75%)

### Task 3: Coverage — Service Layer Tests

- [ ] src/services/vault/resolver.ts (path resolution logic)
- [ ] src/services/atomic/hub-manager.ts
- [ ] src/services/atomic/splitter.ts
- [ ] src/services/atomic/children-count.ts
- [ ] src/services/export/exporter.ts
- [ ] src/services/export/consolidator.ts
- [ ] src/services/graph/retroactive.ts
- [ ] src/services/migrate/executor.ts
- [ ] src/services/project/context-loader.ts
- [ ] src/services/time/storage.ts
- [ ] src/services/time/aggregator.ts

### Task 4: Complexity Refactoring

Refactor functions exceeding cyclomatic complexity limit (8):

- [ ] `escapeRegex` (CCN: 29) — services/standards/validator.ts
- [ ] `mergeFrontmatter` (CCN: 26) — utils/frontmatter.ts
- [ ] `analyzeDomains` (CCN: 21) — services/metadata/domain-analyzer.ts
- [ ] `(anonymous)` (CCN: 19) — services/index/sync.ts
- [ ] `checkIndexSync` (CCN: 18) — services/metadata/index-sync.ts
- [ ] `buildMessage` (CCN: 15) — tools/improve.ts
- [ ] `renameNotes` (CCN: 14) — services/batch/operations.ts

Break long functions (>50 LOC) into smaller units:

- [ ] `generateDiff` (185 LOC) — services/history/diff.ts
- [ ] `findSkipZones` (108 LOC) — services/autolink/linker.ts
- [ ] `historyHandlerInternal` (88 LOC) — tools/history.ts
- [ ] `findOrphansInDir` (85 LOC) — services/operations/cleanup.ts
- [ ] `renameNotes` (83 LOC) — services/batch/operations.ts

### Task 5: Security Issue Triage

- [ ] Audit path-traversal issues (32 instances) — determine which need input validation vs. which are expected internal usage
- [ ] Audit non-literal-fs-filename issues (37 instances) — add path validation where user input reaches `fs` calls
- [ ] Add a `validateVaultPath()` utility to sanitize paths at tool entry points
- [ ] Mark confirmed false positives in Codacy (if applicable)

### Task 6: Documentation Updates

#### README.md
- [ ] Add CI status badge
- [ ] Add Codacy coverage badge
- [ ] Update Development section to mention pre-commit hooks and coverage

#### CLAUDE.md
- [ ] Add "Continuous Integration" section documenting the pipeline
- [ ] Add "Pre-commit Hooks" section documenting Husky + lint-staged
- [ ] Update "Testing" section with coverage tooling details

#### CONTRIBUTING.md
- [ ] Add note that `npm install` sets up Husky hooks automatically
- [ ] Add "Pre-commit Hooks" subsection
- [ ] Add "Continuous Integration" section
- [ ] Update Pull Request section to reference CI checks

#### GIT_WORKFLOW_STANDARDS.md
- [ ] **Overhaul "Git Hooks" section** — replace Python tooling (flake8, black, pre-commit) with Husky + lint-staged
- [ ] **Overhaul "Continuous Integration" section** — replace generic description with actual GitHub Actions setup
- [ ] Update "Branch Protection" required status checks to reflect reality
- [ ] Replace Python `.gitignore` example with Node.js/TypeScript version
- [ ] Update "Additional Resources" links (Husky + lint-staged instead of pre-commit framework)
- [ ] Remove Django/Python references throughout
- [ ] Update document metadata (Last Updated date)

### Task 7: Verification

- [ ] `npm run lint` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run build` passes
- [ ] `npm run test:coverage` shows >= 80% coverage
- [ ] CI pipeline green on all Node versions (18, 20, 22)
- [ ] Codacy dashboard reflects >= 80% coverage
- [ ] Codacy issues reduced (target: < 100)
- [ ] All documentation accurate and consistent

## Standards & References

- [CLAUDE.md](../../CLAUDE.md) - Project guidelines
- [Git Workflow Standards](../GIT_WORKFLOW_STANDARDS.md) - Git practices (to be updated)
- [Contributing Guide](../CONTRIBUTING.md) - Contributor documentation (to be updated)
- [Phase Guide](../PHASE_GUIDE.md) - Phase management

## Technical Details

### Coverage Strategy

Focus on unit tests for maximum coverage ROI:
1. **Tool handlers** — Most are 0% covered, each is 100-300 lines
2. **Service modules** — Core logic with complex branching
3. **Utilities** — Already partially covered, fill gaps

### Security Issue Analysis

The security patterns flagged by Codacy (Semgrep) are largely expected for a file-system-based tool:
- `path.join(vaultPath, userPath)` is the fundamental operation of this tool
- Mitigation: validate paths don't escape vault root (path traversal prevention)
- Many `fs` calls with variable filenames are internal — not direct user input
- Strategy: add validation at tool entry points, mark internals as accepted risk

### Complexity Approach

- Extract helper functions from complex methods
- Use early returns to reduce nesting
- Replace switch/if chains with lookup maps where appropriate
- Ensure refactored code has test coverage before and after

## Testing & Quality Assurance

### Test Coverage Requirements

- Overall coverage: >= 80% (up from 58%)
- New test files should target uncovered modules
- Each refactored function should have tests confirming behavior is preserved

### Quality Checks

- [ ] All CI checks passing
- [ ] Codacy grade maintained at A
- [ ] No regression in existing tests
- [ ] Documentation reviewed for accuracy

## Acceptance Criteria

- [ ] Codacy coverage >= 80%
- [ ] Codacy issues < 100 (down from 308)
- [ ] CI pipeline green on all Node versions
- [ ] All 4 documentation files updated
- [ ] GIT_WORKFLOW_STANDARDS.md no longer references Python tooling
- [ ] GitHub Actions pinned to commit SHAs
- [ ] No new lint or typecheck errors introduced

## Risks & Mitigation

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| Refactoring introduces regressions | High | Medium | Write tests before refactoring, run full suite after each change |
| 80% coverage unreachable without mocking overhaul | Medium | Low | Focus on testable units first, use dependency injection where needed |
| Security false positives inflate issue count | Low | High | Triage and mark accepted risks in Codacy |
| Large scope creep | Medium | Medium | Prioritize coverage and docs first, complexity refactoring second |

## Notes & Decisions

### 2026-02-18 - Phase Creation

- Context: CI pipeline added (v2.2.3), Codacy reporting 58% coverage, 308 issues
- Decision: Create dedicated phase for quality improvement
- Rationale: Coverage gap (58% vs 80% target) and stale documentation need focused attention
- Priority order: Docs + CI pinning (quick wins) -> Coverage (bulk of work) -> Complexity (refactoring) -> Security (triage)
