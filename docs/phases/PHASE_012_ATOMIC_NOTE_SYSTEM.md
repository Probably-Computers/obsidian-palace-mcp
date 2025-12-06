# Phase 012: Atomic Note System

**Status**: Planning
**Start Date**: TBD
**Target Completion**: TBD
**Owner**: TBD

## Objectives

- Implement atomic notes with enforced size limits
- One concept per file, maximum 200 lines
- Hub pattern for organizing related atomic notes
- Auto-splitting when limits exceeded
- Maintain graph integrity during splits

## Prerequisites

- [x] Phase 008 completed (Multi-Vault & Configuration)
- [ ] Phase 009 completed (Multi-Vault Tool Integration)
- [ ] Phase 010 completed (Multi-Vault Index & Search)
- [ ] Phase 011 completed (Intent-Based Storage)
- [ ] Vault config with atomic settings available
- [ ] Storage resolution working correctly

## Scope

### In Scope

- Content analyzer (lines, sections, sub-concepts)
- Split decision engine
- Content splitter (preserves links, creates hubs)
- Hub manager (create, update, maintain children count)
- Integration with palace_store
- Integration with palace_improve
- Automatic splitting on content creation/update
- Manual split request support

### Out of Scope

- Content merging (combining small notes)
- Automatic content reorganization
- AI-assisted splitting decisions
- Visual split preview

## Tasks

### Content Analyzer

- [ ] Create src/services/atomic/analyzer.ts
  - [ ] Count total lines in content
  - [ ] Extract H2 sections with line counts
  - [ ] Detect sub-concepts (H3+ with substantial content)
  - [ ] Calculate word count
  - [ ] Identify code blocks and their sizes
- [ ] Return comprehensive analysis:
  - [ ] lineCount, sectionCount, wordCount
  - [ ] sections array with start/end lines
  - [ ] largeSections (> 50 lines)
  - [ ] subConcepts detected
- [ ] Handle frontmatter separately

### Split Decision Engine

- [ ] Create src/services/atomic/decision.ts
  - [ ] shouldSplit(content, config) -> SplitDecision
  - [ ] Check against atomic limits:
    - [ ] max_lines (default: 200)
    - [ ] max_sections (default: 6)
    - [ ] section_max_lines (default: 50)
  - [ ] Detect sub-concept patterns
  - [ ] Return decision with reason
- [ ] Support different thresholds per knowledge type
- [ ] Consider content type (code-heavy needs different limits)

### Content Splitter

- [ ] Create src/services/atomic/splitter.ts
  - [ ] splitByHeadings(content, metadata)
  - [ ] splitBySubConcepts(content, subConcepts, metadata)
  - [ ] extractLargeSections(content, sections, metadata)
- [ ] Preserve all wiki-links during split
- [ ] Update internal links to point to new locations
- [ ] Generate hub content from split result
- [ ] Generate child content with proper frontmatter
- [ ] Handle cross-references between children

### Hub Manager

- [ ] Create src/services/atomic/hub-manager.ts
  - [ ] createHub(path, title, children)
  - [ ] updateHub(path, changes)
  - [ ] addChild(hubPath, childInfo)
  - [ ] removeChild(hubPath, childPath)
  - [ ] getHubInfo(path)
- [ ] Hub note format:
  - [ ] Navigation-focused content
  - [ ] Children list with summaries
  - [ ] Max 150 lines
  - [ ] type: *_hub in frontmatter
- [ ] Maintain children_count in frontmatter
- [ ] Update hub when children change

### Hub Note Template

- [ ] Define hub note structure:
  ```markdown
  # {Title}

  Brief overview (2-3 paragraphs max)

  ## Knowledge Map

  ### {Category 1}
  - [[child1|Title]] - Brief description
  - [[child2|Title]] - Brief description

  ## Used In
  - [[project links]]

  ## Related
  - [[sibling hubs]]
  ```
- [ ] Generate from split results
- [ ] Support nested hubs (sub-hubs)

### Integration with palace_store

- [ ] Update store.ts to analyze content before saving
- [ ] If split required:
  - [ ] Call splitter to generate hub + children
  - [ ] Create hub file at intended location
  - [ ] Create children in subdirectory
  - [ ] Return split result with all paths
- [ ] Support options.force_atomic to skip splitting
- [ ] Handle existing hub (add to children)

### Integration with palace_improve

- [ ] Update improve.ts to re-analyze after update
- [ ] If updated content exceeds limits:
  - [ ] Convert to hub structure
  - [ ] Migrate existing content to child
  - [ ] Add new content as additional child
- [ ] Update hub children_count
- [ ] Handle mode=append_section carefully

### Atomic File Structure

- [ ] Implement directory convention:
  ```
  technologies/kubernetes/
  ├── _index.md           # Root hub
  ├── concepts/
  │   ├── _index.md       # Concepts hub
  │   ├── pods.md         # Atomic
  │   └── services.md     # Atomic
  └── commands/
      ├── _index.md       # Commands hub
      └── kubectl.md      # Atomic
  ```
- [ ] Auto-create subdirectories as needed
- [ ] Handle hub_filename config

### Frontmatter Updates

- [ ] Hub notes get type with _hub suffix
- [ ] Children get parent field pointing to hub
- [ ] Children get technology field for root tech
- [ ] Track children_count in hubs
- [ ] Update modified timestamps

### Database Updates

- [ ] Track hub relationships in database
- [ ] Index parent relationships
- [ ] Query children by hub path
- [ ] Support hub traversal

### Testing

- [ ] Unit tests for content analyzer
- [ ] Unit tests for split decision
- [ ] Unit tests for content splitter
- [ ] Unit tests for hub manager
- [ ] Integration tests for auto-split on store
- [ ] Integration tests for auto-split on improve
- [ ] Edge case tests:
  - [ ] Content with code blocks
  - [ ] Content with tables
  - [ ] Already near-limit content
  - [ ] Nested headings

### Documentation

- [ ] Update CLAUDE.md with atomic note info
- [ ] Document atomic limits
- [ ] Document hub pattern
- [ ] Provide examples of split results

## Standards & References

- [CLAUDE.md](../../CLAUDE.md) - Project guidelines
- [v2.0 Specification](../obsidian-palace-mcp-spec-v2.md) - Section 6
- [Git Workflow Standards](../GIT_WORKFLOW_STANDARDS.md)

## Technical Details

### Atomic Limits

| Metric | Default | Configurable |
|--------|---------|--------------|
| Total lines | 200 | max_lines |
| H2 sections | 6 | max_sections |
| Section lines | 50 | section_max_lines |
| Hub lines | 150 | hub_max_lines |
| Hub filename | _index.md | hub_filename |

### SplitAnalysis Interface

```typescript
interface SplitAnalysis {
  shouldSplit: boolean;
  reason: string;
  metrics: {
    lineCount: number;
    sectionCount: number;
    wordCount: number;
    largeSections: number;
    subConcepts: number;
  };
  suggestedStructure?: {
    hub: {
      title: string;
      path: string;
      content: string;
    };
    children: Array<{
      title: string;
      path: string;
      content: string;
      fromSection?: string;
    }>;
  };
}
```

### Split Decision Flow

```
Content submitted for storage
    ↓
analyzeContent(content)
    ↓
┌─ Check limits ────────────────────────┐
│                                        │
│  lines > 200?                         │
│  OR sections > 6?                     │
│  OR any section > 50 lines?           │
│  OR sub-concepts >= 3?                │
│                                        │
│  YES → generateSplitStructure()       │
│        Create hub + children          │
│        Return multiple paths          │
│                                        │
│  NO → Save as single atomic note      │
│       Return single path              │
└────────────────────────────────────────┘
```

### Hub Note Example

```yaml
---
type: technology_hub
title: Kubernetes
domain: [containers, orchestration]
status: active
children_count: 12
official_docs: https://kubernetes.io/docs/
created: 2025-12-06T10:00:00Z
modified: 2025-12-10T14:30:00Z
palace:
  version: 3
  last_agent: claude
---

# Kubernetes

Container orchestration platform for automating deployment, scaling, and management.

## Overview

Brief 2-3 paragraph introduction.

## Knowledge Map

### Core Concepts -> [[kubernetes/concepts/_index]]
- [[kubernetes/concepts/pods|Pods]] - Smallest deployable unit
- [[kubernetes/concepts/services|Services]] - Network abstraction

### Commands -> [[kubernetes/commands/_index]]
- [[kubernetes/commands/kubectl-basics|kubectl Basics]]

## Used In

- [[projects/xlink/infrastructure]]

## Related

- [[technologies/docker/_index|Docker]]
```

### Atomic Note Example

```yaml
---
type: concept
title: Kubernetes Pods
parent: "[[kubernetes/concepts/_index]]"
technology: "[[kubernetes/_index]]"
domain: [kubernetes, containers]
status: active
confidence: 0.8
created: 2025-12-06T10:00:00Z
modified: 2025-12-10T14:30:00Z
palace:
  version: 3
  last_agent: claude
---

# Kubernetes Pods

A Pod is the smallest deployable unit in Kubernetes.

## Overview

[Content - max 50 lines]

## Key Characteristics

[Content - max 50 lines]

## See Also

- [[kubernetes/concepts/deployments|Deployments]]
```

### Files to Create

```
src/services/atomic/
├── analyzer.ts       # Content analysis
├── decision.ts       # Split decision logic
├── splitter.ts       # Content splitting
├── hub-manager.ts    # Hub CRUD operations
└── index.ts          # Barrel export
```

## Testing & Quality Assurance

### Test Coverage Requirements

| Area | Target |
|------|--------|
| Content analyzer | 90% |
| Split decision | 90% |
| Content splitter | 85% |
| Hub manager | 85% |
| Integration | 80% |

### Test Scenarios

1. **Small content** - Should not split
2. **Large content (>200 lines)** - Should split by sections
3. **Many sections (>6)** - Should create sub-hubs
4. **Large sections (>50 lines)** - Should extract sections
5. **Code-heavy content** - Handle code blocks properly
6. **Existing hub** - Add to children correctly
7. **Update causing overflow** - Convert to hub

### Quality Checks

- [ ] All tests passing
- [ ] No TypeScript errors
- [ ] Linting passes
- [ ] Links preserved during splits
- [ ] Performance acceptable for large content

## Acceptance Criteria

- [ ] Content analyzer correctly identifies limits
- [ ] Split decision returns appropriate recommendations
- [ ] Splitter creates valid hub + children structure
- [ ] Hub manager maintains children_count
- [ ] palace_store auto-splits large content
- [ ] palace_improve handles overflow correctly
- [ ] All wiki-links preserved during splits
- [ ] Hub notes navigate to children correctly
- [ ] Atomic notes link back to parent hubs
- [ ] All tests passing

## Risks & Mitigation

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| Link breakage during split | High | Medium | Comprehensive link tracking |
| Complex nested splits | Medium | Medium | Limit split depth |
| Performance with large files | Medium | Low | Streaming analysis |
| User confusion about structure | Medium | Medium | Clear documentation |

## Notes & Decisions

*To be filled during implementation*
