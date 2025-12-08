# Phase 013: Standards System

**Status**: Completed
**Start Date**: 2025-12-08
**Target Completion**: 2025-12-08
**Owner**: Claude

## Objectives

- Implement binding standards that AI must follow
- Load standards with ai_binding: required automatically
- Provide standards to AI at session start
- Optional validation for compliance checking
- Enable user control over AI behavior through vault content

## Prerequisites

- [x] Phase 008 completed (Multi-Vault Configuration)
- [x] Phase 009 completed (Multi-Vault Tool Integration)
- [x] Phase 010 completed (Multi-Vault Index & Search)
- [x] Vault config with ai_binding settings
- [x] Standards path structure defined

## Scope

### In Scope

- Standards loader (find notes with ai_binding)
- Standards validation (optional compliance checking)
- `palace_standards` tool
- Session-start standards loading
- Cross-vault standards support
- Standards acknowledgment tracking

### Out of Scope

- Automatic standards enforcement in AI
- Standards versioning
- Standards inheritance
- Standards conflict resolution

## Tasks

### Standards Loader

- [x] Create src/services/standards/loader.ts
  - [x] Find all notes with ai_binding frontmatter
  - [x] Filter by binding level (required, recommended, optional)
  - [x] Sort by priority/specificity
  - [x] Load content for each standard
  - [x] Cache loaded standards (5-minute TTL)
- [x] Support domain filtering
- [x] Support applies_to filtering
- [x] Cross-vault standards (from standards_source vault)

### Standards Index

- [x] Update database schema for standards tracking
  - [x] ai_binding field in notes table
  - [x] applies_to field (JSON array)
  - [x] domain field (JSON array)
  - [x] Index for quick standard lookup (idx_notes_ai_binding)
- [x] Sync standards on vault scan (indexNote updates)
- [x] Track standard modifications

### Standards Validator

- [x] Create src/services/standards/validator.ts
  - [x] validateCompliance(notePath, options)
  - [x] Check frontmatter requirements
  - [x] Check content patterns
  - [x] Check naming conventions (via pattern matching)
- [x] Return compliance report:
  - [x] compliant: boolean
  - [x] violations: array
  - [x] warnings: array
  - [x] checked_against: array
- [x] Optional - only run when requested

### palace_standards Tool

- [x] Create src/tools/standards.ts
  - [x] Input: domain, applies_to, binding, vault, include_content
  - [x] Return matching standards
  - [x] Include full content for required standards
  - [x] Include summary for recommended/optional
- [x] Output format:
  - [x] standards array with path, title, binding, content, summary
  - [x] acknowledgment_required flag
  - [x] acknowledgment_message

### Session Integration

- [x] Session can load standards via palace_standards tool
- [x] palace_standards returns acknowledgment_required flag
- [ ] (Future) Auto-load on session start
- [ ] (Future) Track acknowledgment in session log

### Standards Frontmatter

- [x] Define standard note frontmatter:
  ```yaml
  type: standard
  ai_binding: required | recommended | optional
  applies_to: [all] | [typescript, python, ...]
  domain: [git, code-style, documentation]
  ```
- [x] Validate frontmatter on indexing (isStandardNote check)
- [x] Handle missing/invalid binding levels (filter out invalid)

### Cross-Vault Standards

- [x] Support standards_source in global config (via registry.getStandardsSourceVault)
- [x] Load standards from designated vault
- [x] Apply to all vault operations
- [x] Handle vault access modes (read-only OK)

### Testing

- [x] Unit tests for standards loader (exports, functions)
- [x] Unit tests for standards validator (exports, functions)
- [x] Unit tests for palace_standards tool (structure tests)
- [x] Test binding level priority
- [x] Test applies_to filtering
- [x] Test compliance report structure
- [x] Test summary extraction
- [x] 33 unit tests passing

### Documentation

- [x] Update CLAUDE.md with standards info
- [x] Document standard note format
- [x] Document ai_binding levels
- [x] Document applies_to values
- [x] Provide example standards (Git Workflow Standard)

## Standards & References

- [CLAUDE.md](../../CLAUDE.md) - Project guidelines
- [v2.0 Specification](../obsidian-palace-mcp-spec-v2.md) - Section 8.3
- [Git Workflow Standards](../GIT_WORKFLOW_STANDARDS.md)

## Technical Details

### Standard Note Format

```yaml
---
type: standard
title: Git Workflow Standard
domain: [git, version-control]
ai_binding: required
applies_to: [all]
status: active
created: 2025-12-06T10:00:00Z
modified: 2025-12-10T14:30:00Z
---

# Git Workflow Standard

## Overview

This standard defines how git operations should be performed.

## Requirements

### Branch Naming
- Feature branches: `feature/{name}`
- Bug fixes: `bugfix/{name}`

### Commit Messages
- Use conventional commits format
- Include scope when applicable

## Examples

...
```

### ai_binding Levels

| Level | Meaning | AI Behavior |
|-------|---------|-------------|
| required | Must follow | Load at session start, acknowledge before proceeding |
| recommended | Should follow | Load on request, warn if not followed |
| optional | May follow | Available for reference only |

### applies_to Values

- `all` - Applies to all contexts
- `typescript`, `python`, etc. - Language-specific
- `git`, `documentation`, etc. - Domain-specific
- `client:{name}` - Client-specific
- `project:{name}` - Project-specific

### palace_standards Input

```typescript
interface PalaceStandardsInput {
  domain?: string[];           // Filter by domain
  applies_to?: string;         // Filter by what it applies to
  binding?: 'required' | 'recommended' | 'optional' | 'all';
  vault?: string;              // Specific vault (default: standards_source)
}
```

### palace_standards Output

```typescript
interface PalaceStandardsOutput {
  success: boolean;

  standards: Array<{
    path: string;
    vault: string;
    title: string;
    binding: 'required' | 'recommended' | 'optional';
    applies_to: string[];
    domain: string[];
    content: string;          // Full content for required
    summary: string;          // Brief for recommended/optional
  }>;

  acknowledgment_required: boolean;
  acknowledgment_message?: string;
}
```

### Session Standards Flow

```
Session starts
    ↓
palace_standards({ binding: 'required' })
    ↓
┌─ Standards found? ────────────────────┐
│                                        │
│  YES → Return standards array          │
│        Set acknowledgment_required     │
│        AI must acknowledge            │
│                                        │
│  NO → Return empty array              │
│       No acknowledgment needed        │
└────────────────────────────────────────┘
    ↓
AI acknowledges (logged to session)
    ↓
Session proceeds with standards in context
```

### Compliance Report

```typescript
interface ComplianceReport {
  compliant: boolean;

  violations: Array<{
    standard: string;
    requirement: string;
    actual: string;
    severity: 'error' | 'warning';
  }>;

  warnings: Array<{
    standard: string;
    message: string;
  }>;

  checked_against: string[];  // Standard paths
}
```

### Files to Create

```
src/services/standards/
├── loader.ts         # Find and load standards
├── validator.ts      # Compliance checking
└── index.ts          # Barrel export

src/tools/
└── standards.ts      # palace_standards tool
```

## Testing & Quality Assurance

### Test Coverage Requirements

| Area | Target |
|------|--------|
| Standards loader | 90% |
| Standards validator | 85% |
| palace_standards | 85% |
| Session integration | 80% |

### Test Scenarios

1. **Load required standards** - Returns all required for domain
2. **Domain filtering** - Only returns matching domain
3. **applies_to filtering** - Respects applies_to field
4. **Cross-vault** - Loads from standards_source vault
5. **No standards** - Handles empty gracefully
6. **Invalid frontmatter** - Skips invalid, logs warning
7. **Session integration** - Loads on session start

### Quality Checks

- [x] All tests passing (300 tests)
- [x] No TypeScript errors
- [x] Linting passes
- [x] Standards load quickly (with caching)
- [x] Cross-vault works correctly

## Acceptance Criteria

- [x] Standards loader finds notes with ai_binding
- [x] Standards filtered by domain correctly
- [x] Standards filtered by applies_to correctly
- [x] palace_standards returns correct standards
- [x] Acknowledgment tracking works (acknowledgment_required flag)
- [x] Validator identifies violations
- [x] Cross-vault standards work
- [x] All tests passing

## Risks & Mitigation

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| Too many required standards | Medium | Medium | Domain filtering, clear guidelines |
| Standards conflicts | Medium | Low | Document precedence rules |
| Performance with many standards | Low | Low | Caching, lazy loading |
| AI ignoring standards | Medium | Medium | Acknowledgment requirement |

## Notes & Decisions

### Implementation Notes

1. **Standards loaded from file system** - Standards are loaded by scanning notes with `type: standard` and valid `ai_binding` field, rather than indexed in database first. This provides flexibility but may be slower for large vaults.

2. **5-minute cache TTL** - Standards are cached per-vault with a 5-minute TTL to balance freshness with performance.

3. **palace_standards_validate tool added** - In addition to palace_standards, a palace_standards_validate tool was added for compliance checking.

4. **Session integration deferred** - Auto-loading standards at session start and tracking acknowledgment in session logs are marked as future work. The current implementation provides the tools needed for AI to manually load and acknowledge standards.

5. **Summary extraction** - Summaries are automatically extracted from the first paragraph after the title, truncated to 200 characters.

6. **Validator pattern matching** - The validator extracts "Must have X" and "Should have X" patterns from the Requirements section of standards and creates regex rules for checking.
