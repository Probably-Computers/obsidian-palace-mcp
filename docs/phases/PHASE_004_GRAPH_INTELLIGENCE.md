# Phase 004: Graph Intelligence

**Status**: Planning
**Start Date**: TBD
**Target Completion**: TBD
**Actual Completion**: -
**Owner**: TBD

## Objectives

- Build knowledge graph capabilities from wiki-link relationships
- Implement palace_links tool for backlink/outlink traversal
- Implement palace_orphans tool to find disconnected notes
- Implement palace_related tool to discover related content
- Enable graph-based knowledge discovery

## Prerequisites

- [x] Phase 001 completed
- [x] Phase 002 completed
- [ ] Phase 003 completed (SQLite index with links table)
- [ ] Wiki-link extraction working in index
- [ ] Test vault configured via PALACE_VAULT_PATH

## Scope

### In Scope

- Graph service for link relationship management
- Backlink tracking and querying
- Outgoing link tracking
- Orphan note detection (no incoming/outgoing links)
- Related note discovery based on shared links
- Link depth traversal (multi-hop relationships)
- palace_links tool
- palace_orphans tool
- palace_related tool

### Out of Scope

- Auto-linking (Phase 5)
- Content similarity matching (future enhancement)
- Visual graph rendering (client responsibility)

## Tasks

### Setup

- [ ] Create services/graph/ directory structure
- [ ] Define graph data structures

### Development

- [ ] Implement services/graph/links.ts
  - [ ] Extract outgoing links from note content
  - [ ] Resolve link targets to note paths
  - [ ] Handle broken/unresolved links
  - [ ] Cache link relationships
- [ ] Implement services/graph/relationships.ts
  - [ ] Get backlinks (notes linking to target)
  - [ ] Get outlinks (notes target links to)
  - [ ] Multi-hop traversal (depth parameter)
  - [ ] Find common links between notes
- [ ] Implement services/graph/index.ts barrel export
- [ ] Implement tools/links.ts (palace_links)
  - [ ] Direction parameter (incoming, outgoing, both)
  - [ ] Depth parameter for multi-hop
  - [ ] Include resolved/unresolved status
- [ ] Implement tools/orphans.ts (palace_orphans)
  - [ ] Find notes with no incoming links
  - [ ] Find notes with no outgoing links
  - [ ] Find completely isolated notes
  - [ ] Filter by path/type
- [ ] Implement tools/related.ts (palace_related)
  - [ ] Find related by shared links
  - [ ] Find related by shared tags
  - [ ] Configurable relatedness method
  - [ ] Limit results

### Testing & Validation

- [ ] Unit tests for link extraction
- [ ] Unit tests for graph traversal
- [ ] Integration tests with linked notes
- [ ] Test orphan detection accuracy
- [ ] Test multi-hop traversal

### Documentation

- [ ] Update CLAUDE.md with new tools
- [ ] Document graph query patterns
- [ ] Add examples for common use cases

## Standards & References

- [CLAUDE.md](../../CLAUDE.md) - Project guidelines
- [Obsidian Palace MCP Spec](../obsidian-palace-mcp-spec.md) - Tool specifications
- [Obsidian Link Format](https://help.obsidian.md/Linking+notes+and+files/Internal+links)

## Technical Details

### Graph Data Structures

```typescript
interface GraphLink {
  source: string;      // Source note path
  target: string;      // Target note path (or title)
  resolved: boolean;   // Does target exist?
}

interface GraphNode {
  path: string;
  title: string;
  incomingCount: number;
  outgoingCount: number;
}

interface TraversalResult {
  depth: number;
  path: string[];      // Path from origin to this node
  note: NoteMetadata;
}
```

### Files to Create

```
src/services/graph/
├── links.ts           # Link extraction and resolution
├── relationships.ts   # Graph traversal algorithms
└── index.ts           # Barrel exports

src/tools/
├── links.ts           # palace_links
├── orphans.ts         # palace_orphans
└── related.ts         # palace_related
```

### Tool Specifications

#### palace_links
```typescript
{
  path: string;                              // Note to analyze
  direction: 'incoming' | 'outgoing' | 'both';  // Link direction
  depth: number;                             // Traversal depth (default: 1)
}
```

#### palace_orphans
```typescript
{
  type: 'no_incoming' | 'no_outgoing' | 'isolated';  // Orphan type
  path?: string;                             // Limit to directory
}
```

#### palace_related
```typescript
{
  path: string;                              // Source note
  method: 'links' | 'tags' | 'content';      // Relatedness method
  limit: number;                             // Max results (default: 10)
}
```

## Testing & Quality Assurance

### Test Vault

Located at: `/Users/adamc/Documents/Claude Palace`

Create test notes with known link structures for validation.

### Test Coverage Requirements

- Unit tests: 80% coverage for graph services
- Integration tests: Complex link graphs
- Edge cases: Circular links, broken links, self-links

### Quality Checks

- [ ] Code review completed
- [ ] All tests passing
- [ ] Linting passes
- [ ] Documentation updated
- [ ] No regressions in existing tools

## Acceptance Criteria

- [ ] palace_links returns accurate backlinks and outlinks
- [ ] Multi-hop traversal works correctly
- [ ] palace_orphans identifies all orphan types
- [ ] palace_related finds meaningfully related notes
- [ ] Broken links are identified but don't cause errors
- [ ] Performance acceptable for large graphs
- [ ] Graph data stays in sync with index

## Risks & Mitigation

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| Circular link infinite loops | High | Medium | Visited set tracking, max depth |
| Large graph memory usage | Medium | Low | Lazy loading, pagination |
| Stale graph data | Medium | Medium | Sync with file watcher events |
| Complex traversal performance | Medium | Medium | Index optimization, caching |

## Notes & Decisions

### TBD - Link Resolution Strategy

- Context: How to match [[link]] to actual notes
- Options:
  1. Exact title match only
  2. Case-insensitive match
  3. Alias support
  4. Fuzzy matching
- Decision: Pending (likely case-insensitive + aliases)

### TBD - Relatedness Scoring

- Context: How to rank related notes
- Options:
  1. Shared link count
  2. Jaccard similarity of links
  3. Combined link + tag score
- Decision: Pending
