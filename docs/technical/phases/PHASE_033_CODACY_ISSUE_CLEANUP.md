# Phase 033: Codacy Issue Cleanup

**Status**: In Progress — Semgrep UI toggle pending
**Start Date**: 2026-02-19
**Completion Date**: 2026-02-19
**Owner**: Adam

## Objectives

- Reduce Codacy reported issues from 273 to 0
- Fix Trivy dependency CVEs (5 issues)
- Fix markdownlint MD024 duplicate heading warnings (8 issues)
- Suppress 2 Semgrep security patterns that are false positives for a filesystem MCP tool (211 issues)
- Refactor 4 complex functions with CCN > 15
- Document triage decisions for CCN false positives (~45 issues)

## Prerequisites

- [x] Phase 032 complete (81.52% coverage, 273 issues remaining)
- [x] Codacy integration active with CI pipeline
- [x] Path traversal prevention via `validateNotePath()` in all tool entry points

## Current Issue Breakdown (273 total)

| Pattern | Count | Category | Approach |
|---------|-------|----------|----------|
| detect-non-literal-fs-filename (Semgrep) | 111 | Security | Suppress — expected for filesystem tool |
| path-join-resolve-traversal (Semgrep) | 100 | Security | Suppress — mitigated by validateNotePath() |
| Lizard CCN > 8 | 49 | Complexity | Refactor 4 functions, suppress false positives |
| markdownlint MD024 | 8 | BestPractice | Fix duplicate headings |
| Trivy dependency CVEs | 5 | Security | Update dependencies |

## Tasks

### Task 1: Fix Trivy Dependency CVEs (5 issues)

- [x] Update `@modelcontextprotocol/sdk` to ^1.26.0 (2 CVEs: ReDoS + data leak)
- [x] Update `qs` to 6.15.0 via lockfile (2 CVEs: DoS)
- [ ] ~~Add npm overrides for `ajv` >= 8.18.0~~ — dev-only dep (eslint), not a runtime concern

### Task 2: Fix Markdownlint MD024 (8 issues)

- [x] Create `.markdownlint.json` with `{ "MD024": { "siblings_only": true } }` — allows duplicate headings under different parents (standard for changelogs)

### Task 3: Suppress Semgrep Security Patterns (211 issues)

- [ ] **Manual step — Codacy repo-level Code Patterns override:**
  1. Go to https://app.codacy.com/gh/Probably-Computers/obsidian-palace-mcp/patterns
  2. Click **Customize** to create a repo-level override of the Default coding standard
  3. Select **Semgrep** tool in the left sidebar
  4. Search for and **uncheck**:
     - "Detect Non-Literal File System Filename Usage" (`detect-non-literal-fs-filename`, 111 issues)
     - "Prevent Path Traversal in Express Path Join or Resolve" and related `path-join-resolve-traversal` variants for JavaScript/TypeScript (100 issues)

**Rationale:** This is a filesystem MCP tool — `path.join(vaultPath, notePath)` IS the core operation. All tool entry points validate paths with `validateNotePath()` (Phase 032). Internal service calls receive pre-validated paths. Suppressing these patterns does not reduce security posture.

### Task 4: Refactor 4 Complex Functions (CCN > 15)

- [x] `historyHandlerInternal` (src/tools/history.ts, CCN 20) — Extracted `buildVersionResults()`
- [x] `checkIndexSync` (src/services/metadata/index-sync.ts, CCN 18) — Extracted `findMissingNotes()`, `checkMetadataMismatches()`
- [x] `exportNote` (src/services/export/exporter.ts, CCN 16) — Extracted `consolidateForExport()`, `buildExportResult()`
- [x] `getAccurateChildrenCount` (src/services/atomic/children-count.ts, CCN 16) — Extracted `verifyLinkedChildren()`, `findOrphanedChildrenInDir()`

### Task 5: Document CCN False Positive Triage (~45 issues)

- [x] Documented triage decisions for inflated CCN functions

Functions with inflated CCN due to Lizard counting switch cases, ternary operators, nullish coalescing, and regex alternations as branches:

| Function | Reported CCN | Reason |
|----------|-------------|--------|
| `escapeRegex` | 29 | Single-line regex; each `\|` alternation counted as branch |
| `mergeFrontmatter` | 26 | Ternary/nullish coalescing inflation |
| `isFieldComplete` | 28 | Switch statement — each case counted as branch |
| `generateDiff` | 66 | Already decomposed into 4 helpers; Lizard aggregates |

**Decision:** Accept as known false positives. These functions are already well-structured and further decomposition would reduce readability.

## Verification

- [x] `npm run lint` passes
- [x] `npm run typecheck` passes
- [x] `npm run build` passes
- [x] `npm run test:coverage` >= 80% (81.54%)
- [ ] Codacy re-analysis shows 0 issues (after UI config changes)

## Changes Made

### Dependencies (Task 1)
- Updated `@modelcontextprotocol/sdk` from `^1.0.0` to `^1.26.0` (fixes 2 CVEs: ReDoS + data leak)
- `qs` updated to 6.15.0 via lockfile (fixes 2 CVEs: DoS)
- Remaining audit items are dev-only dependencies (eslint/minimatch, esbuild/vite) — not runtime concerns

### Markdownlint Config (Task 2)
- Created `.markdownlint.json` with `MD024.siblings_only: true`

### Refactored Functions (Task 4)
1. **`historyHandlerInternal`** (src/tools/history.ts): Extracted `buildVersionResults()` — handles version iteration and diff generation
2. **`checkIndexSync`** (src/services/metadata/index-sync.ts): Extracted `findMissingNotes()` and `checkMetadataMismatches()` — each handles one comparison direction
3. **`exportNote`** (src/services/export/exporter.ts): Extracted `consolidateForExport()` and `buildExportResult()` — hub consolidation and output writing
4. **`getAccurateChildrenCount`** (src/services/atomic/children-count.ts): Extracted `verifyLinkedChildren()` and `findOrphanedChildrenInDir()` — disk verification and orphan detection

### Remaining — Manual Steps Required
- [ ] Customize Codacy Code Patterns for this repo (override Default coding standard)
- [ ] Disable `detect-non-literal-fs-filename` in Semgrep patterns
- [ ] Disable `path-join-resolve-traversal` variants in Semgrep patterns
- [ ] Verify Codacy re-analysis shows reduced issues
- [ ] Move phase to `completed/` once confirmed
