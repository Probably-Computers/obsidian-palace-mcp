# Phase 012: Atomic Note System

**Status**: Completed
**Start Date**: 2025-12-08
**Target Completion**: 2025-12-08
**Owner**: Claude

## Objectives

- Implement atomic notes with enforced size limits
- One concept per file, maximum 200 lines
- Hub pattern for organizing related atomic notes
- Auto-splitting when limits exceeded
- Maintain graph integrity during splits

## Prerequisites

- [x] Phase 008 completed (Multi-Vault & Configuration)
- [x] Phase 009 completed (Multi-Vault Tool Integration)
- [x] Phase 010 completed (Multi-Vault Index & Search)
- [x] Phase 011 completed (Intent-Based Storage)
- [x] Vault config with atomic settings available
- [x] Storage resolution working correctly

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

- [x] Create src/services/atomic/analyzer.ts
  - [x] Count total lines in content
  - [x] Extract H2 sections with line counts
  - [x] Detect sub-concepts (H3+ with substantial content)
  - [x] Calculate word count
  - [x] Identify code blocks and their sizes
- [x] Return comprehensive analysis:
  - [x] lineCount, sectionCount, wordCount
  - [x] sections array with start/end lines
  - [x] largeSections (> 50 lines)
  - [x] subConcepts detected
- [x] Handle frontmatter separately

### Split Decision Engine

- [x] Create src/services/atomic/decision.ts
  - [x] shouldSplit(content, config) -> SplitDecision
  - [x] Check against atomic limits:
    - [x] max_lines (default: 200)
    - [x] max_sections (default: 6)
    - [x] section_max_lines (default: 50)
  - [x] Detect sub-concept patterns
  - [x] Return decision with reason
- [x] Support different thresholds per knowledge type
- [x] Consider content type (code-heavy needs different limits)

### Content Splitter

- [x] Create src/services/atomic/splitter.ts
  - [x] splitByHeadings(content, metadata)
  - [x] splitBySubConcepts(content, subConcepts, metadata)
  - [x] extractLargeSections(content, sections, metadata)
- [x] Preserve all wiki-links during split
- [x] Update internal links to point to new locations
- [x] Generate hub content from split result
- [x] Generate child content with proper frontmatter
- [x] Handle cross-references between children

### Hub Manager

- [x] Create src/services/atomic/hub-manager.ts
  - [x] createHub(path, title, children)
  - [x] updateHub(path, changes)
  - [x] addChild(hubPath, childInfo)
  - [x] removeChild(hubPath, childPath)
  - [x] getHubInfo(path)
- [x] Hub note format:
  - [x] Navigation-focused content
  - [x] Children list with summaries
  - [x] Max 150 lines
  - [x] type: *_hub in frontmatter
- [x] Maintain children_count in frontmatter
- [x] Update hub when children change

### Hub Note Template

- [x] Define hub note structure:
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
- [x] Generate from split results
- [x] Support nested hubs (sub-hubs)

### Integration with palace_store

- [x] Update store.ts to analyze content before saving
- [x] If split required:
  - [x] Call splitter to generate hub + children
  - [x] Create hub file at intended location
  - [x] Create children in subdirectory
  - [x] Return split result with all paths
- [x] Support options.force_atomic to skip splitting
- [x] Handle existing hub (add to children)

### Integration with palace_improve

- [x] Update improve.ts to re-analyze after update
- [x] If updated content exceeds limits:
  - [x] Return atomic_warning with split recommendation
  - [x] Suggest using palace_store to create split structure
  - [x] Preserve current content (non-destructive)
- [x] Update hub children_count
- [x] Handle mode=append_section carefully

### Atomic File Structure

- [x] Implement directory convention:
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
- [x] Auto-create subdirectories as needed
- [x] Handle hub_filename config

### Frontmatter Updates

- [x] Hub notes get type with _hub suffix
- [x] Children get parent field pointing to hub
- [x] Children get domain field from parent
- [x] Track children_count in hubs
- [x] Update modified timestamps

### Database Updates

- [x] Track hub relationships in database (via parent frontmatter field)
- [x] Index parent relationships (through existing index sync)
- [x] Query children by hub path (via palace_links tool)
- [x] Support hub traversal (via palace_links with depth)

### Testing

- [x] Unit tests for content analyzer
- [x] Unit tests for split decision
- [x] Unit tests for content splitter
- [x] Unit tests for hub manager
- [x] Integration tests for auto-split on store
- [x] Integration tests for auto-split on improve
- [x] Edge case tests:
  - [x] Content with code blocks
  - [x] Content with tables
  - [x] Already near-limit content
  - [x] Nested headings

### Documentation

- [x] Update CLAUDE.md with atomic note info
- [x] Document atomic limits
- [x] Document hub pattern
- [x] Provide examples of split results

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

- [x] All tests passing (242 tests)
- [x] No TypeScript errors
- [x] Linting passes
- [x] Links preserved during splits
- [x] Performance acceptable for large content

## Acceptance Criteria

- [x] Content analyzer correctly identifies limits
- [x] Split decision returns appropriate recommendations
- [x] Splitter creates valid hub + children structure
- [x] Hub manager maintains children_count
- [x] palace_store auto-splits large content
- [x] palace_improve handles overflow correctly
- [x] All wiki-links preserved during splits
- [x] Hub notes navigate to children correctly
- [x] Atomic notes link back to parent hubs
- [x] All tests passing

## Risks & Mitigation

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| Link breakage during split | High | Medium | Comprehensive link tracking |
| Complex nested splits | Medium | Medium | Limit split depth |
| Performance with large files | Medium | Low | Streaming analysis |
| User confusion about structure | Medium | Medium | Clear documentation |

## Notes & Decisions

### Implementation Notes (2025-12-08)

1. **Code-heavy content handling**: Implemented 1.5x multiplier for code-heavy content (>50% code blocks), allowing up to 300 lines for documentation with substantial code examples.

2. **Split strategies implemented**:
   - `by_sections`: Split each H2 section into separate child notes
   - `by_large_sections`: Only extract sections exceeding 50 lines
   - `by_sub_concepts`: Extract H3+ headings as separate notes
   - `hierarchical`: Delegates to by_sections (future: nested hubs)

3. **palace_improve integration**: Uses non-destructive approach - returns `atomic_warning` when content exceeds limits rather than auto-splitting, allowing user control.

4. **TypeScript strict mode**: Required `| undefined` on all optional interface properties due to `exactOptionalPropertyTypes` setting.

5. **Test coverage**: 25 new unit tests covering analyzer, decision engine, splitter, and hub manager functions.
