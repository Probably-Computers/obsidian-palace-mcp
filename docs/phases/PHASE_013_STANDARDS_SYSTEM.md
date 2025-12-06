# Phase 013: Standards System

**Status**: Planning
**Start Date**: TBD
**Target Completion**: TBD
**Owner**: TBD

## Objectives

- Implement binding standards that AI must follow
- Load standards with ai_binding: required automatically
- Provide standards to AI at session start
- Optional validation for compliance checking
- Enable user control over AI behavior through vault content

## Prerequisites

- [x] Phase 008 completed (Multi-Vault Configuration)
- [ ] Phase 009 completed (Multi-Vault Tool Integration)
- [ ] Phase 010 completed (Multi-Vault Index & Search)
- [ ] Vault config with ai_binding settings
- [ ] Standards path structure defined

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

- [ ] Create src/services/standards/loader.ts
  - [ ] Find all notes with ai_binding frontmatter
  - [ ] Filter by binding level (required, recommended, optional)
  - [ ] Sort by priority/specificity
  - [ ] Load content for each standard
  - [ ] Cache loaded standards
- [ ] Support domain filtering
- [ ] Support applies_to filtering
- [ ] Cross-vault standards (from standards_source vault)

### Standards Index

- [ ] Update database schema for standards tracking
  - [ ] ai_binding field in notes table
  - [ ] applies_to field (JSON array)
  - [ ] Index for quick standard lookup
- [ ] Sync standards on vault scan
- [ ] Track standard modifications

### Standards Validator

- [ ] Create src/services/standards/validator.ts
  - [ ] validateCompliance(note, standards)
  - [ ] Check frontmatter requirements
  - [ ] Check content patterns
  - [ ] Check naming conventions
- [ ] Return compliance report:
  - [ ] compliant: boolean
  - [ ] violations: array
  - [ ] warnings: array
- [ ] Optional - only run when requested

### palace_standards Tool

- [ ] Create src/tools/standards.ts
  - [ ] Input: domain, applies_to, binding, vault
  - [ ] Return matching standards
  - [ ] Include full content for required standards
  - [ ] Include summary for recommended/optional
- [ ] Output format:
  - [ ] standards array with path, title, binding, content
  - [ ] acknowledgment_required flag
  - [ ] acknowledgment_message

### Session Integration

- [ ] Update session start to load standards
- [ ] Automatically call palace_standards for required
- [ ] Include standards in session context
- [ ] Track which standards were acknowledged
- [ ] Log standards acknowledgment in session

### Standards Frontmatter

- [ ] Define standard note frontmatter:
  ```yaml
  type: standard
  ai_binding: required | recommended | optional
  applies_to: [all] | [typescript, python, ...]
  domain: [git, code-style, documentation]
  ```
- [ ] Validate frontmatter on indexing
- [ ] Handle missing/invalid binding levels

### Cross-Vault Standards

- [ ] Support standards_source in global config
- [ ] Load standards from designated vault
- [ ] Apply to all vault operations
- [ ] Handle vault access modes (read-only OK)

### Testing

- [ ] Unit tests for standards loader
- [ ] Unit tests for standards validator
- [ ] Unit tests for palace_standards tool
- [ ] Integration tests for session loading
- [ ] Test cross-vault standards
- [ ] Test domain filtering
- [ ] Test applies_to filtering

### Documentation

- [ ] Update CLAUDE.md with standards info
- [ ] Document standard note format
- [ ] Document ai_binding levels
- [ ] Document applies_to values
- [ ] Provide example standards

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

- [ ] All tests passing
- [ ] No TypeScript errors
- [ ] Linting passes
- [ ] Standards load quickly
- [ ] Cross-vault works correctly

## Acceptance Criteria

- [ ] Standards loader finds notes with ai_binding
- [ ] Standards filtered by domain correctly
- [ ] Standards filtered by applies_to correctly
- [ ] palace_standards returns correct standards
- [ ] Required standards loaded at session start
- [ ] Acknowledgment tracking works
- [ ] Validator identifies violations
- [ ] Cross-vault standards work
- [ ] All tests passing

## Risks & Mitigation

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| Too many required standards | Medium | Medium | Domain filtering, clear guidelines |
| Standards conflicts | Medium | Low | Document precedence rules |
| Performance with many standards | Low | Low | Caching, lazy loading |
| AI ignoring standards | Medium | Medium | Acknowledgment requirement |

## Notes & Decisions

*To be filled during implementation*
