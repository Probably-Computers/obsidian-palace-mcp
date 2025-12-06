# Phase 011: Intent-Based Storage

**Status**: Planning
**Start Date**: TBD
**Target Completion**: TBD
**Owner**: TBD

## Objectives

- Replace path-based storage with intent-based resolution
- AI expresses WHAT to store, MCP determines WHERE
- Implement knowledge layer determination (Technical/Domain/Contextual)
- Enable stub creation for mentioned technologies
- Support retroactive linking when knowledge expands

## Prerequisites

- [x] Phase 008 completed (Multi-Vault & Configuration)
- [ ] Phase 009 completed (Multi-Vault Tool Integration)
- [ ] Phase 010 completed (Multi-Vault Index & Search)
- [ ] Vault config structure mapping available
- [ ] Per-vault path templates defined

## Scope

### In Scope

- Storage intent schema with Zod validation
- Path resolution engine (intent -> location)
- Knowledge layer determination algorithm
- `palace_store` tool (replaces palace_remember)
- `palace_check` tool (check before store)
- `palace_improve` tool (replaces palace_update)
- Stub creation on technology mention
- Retroactive linking service
- Technology reference tracking

### Out of Scope

- Content analysis for auto-categorization
- ML-based intent detection
- Natural language path resolution
- Automatic content splitting (Phase 012)

## Tasks

### Storage Intent Schema

- [ ] Create src/types/intent.ts
  - [ ] Define StorageIntent interface
  - [ ] knowledge_type enum (technology, command, reference, standard, pattern, research, decision, configuration, troubleshooting, note)
  - [ ] domain array for classification
  - [ ] scope: general vs project-specific
  - [ ] Context fields (project, client, product)
  - [ ] technologies array for linking
  - [ ] references array for explicit links
- [ ] Create Zod schema for validation
- [ ] Document all intent fields

### Path Resolution Engine

- [ ] Create src/services/vault/resolver.ts
  - [ ] resolveStorage(intent) -> VaultResolution
  - [ ] Load vault structure config
  - [ ] Apply path templates with variable substitution
  - [ ] Handle {domain}, {project}, {client}, {product} variables
  - [ ] Determine hub file location
  - [ ] Generate filename from title (slugify)
- [ ] Handle subpaths for subtypes (decisions/, configurations/)
- [ ] Validate resolved path doesn't conflict

### Knowledge Layer Determination

- [ ] Create src/services/vault/layer-detector.ts
  - [ ] Layer 1: Technical (technologies/, commands/, reference/)
  - [ ] Layer 2: Domain (standards/, patterns/, research/)
  - [ ] Layer 3: Contextual (projects/, clients/, products/)
- [ ] Implement rule-based detection:
  - [ ] knowledge_type -> layer mapping
  - [ ] scope field consideration
  - [ ] Project/client context detection
  - [ ] Reusable knowledge detection
- [ ] Create reference pattern for project-discovered tech

### palace_store Tool

- [ ] Create src/tools/store.ts
  - [ ] Input: title, content, intent, options, source
  - [ ] Validate intent with Zod
  - [ ] Resolve storage location
  - [ ] Check for existing note (reuse check logic)
  - [ ] Handle expand_if_stub option
  - [ ] Create note with full frontmatter
  - [ ] Create stubs for mentioned technologies
  - [ ] Apply retroactive linking
  - [ ] Return created path, stubs, links added
- [ ] Support dry_run option
- [ ] Handle vault selection

### palace_check Tool

- [ ] Create src/tools/check.ts
  - [ ] Input: query, knowledge_type, domain, include_stubs, vault
  - [ ] Search for existing knowledge
  - [ ] Include stub notes in results
  - [ ] Calculate relevance scores
  - [ ] Detect similar titles (possible duplicates)
  - [ ] Identify missing technologies
  - [ ] Return recommendation:
    - create_new: No matches
    - expand_stub: Found stub
    - improve_existing: Good match exists
    - reference_existing: Exact match
- [ ] Provide suggestions for AI behavior

### palace_improve Tool

- [ ] Update src/tools/update.ts -> improve.ts
  - [ ] Rename tool to palace_improve
  - [ ] Add improvement modes:
    - append: Add to end
    - append_section: Add as new section
    - update_section: Update specific section
    - merge: Intelligently merge
    - replace: Full replacement
  - [ ] Support section parameter for targeted updates
  - [ ] Update authors array in frontmatter
  - [ ] Increment palace.version
  - [ ] Apply auto-linking to new content
  - [ ] Return change summary
- [ ] Maintain backward compatibility with update

### Stub Manager

- [ ] Create src/services/vault/stub-manager.ts
  - [ ] Create stub notes for mentioned technologies
  - [ ] Stub frontmatter with status: stub
  - [ ] stub_context field for creation reason
  - [ ] Minimal content with placeholder
  - [ ] Track stubs in database
- [ ] Detect when stub should be created:
  - [ ] Technology mentioned but no note exists
  - [ ] [[Link]] target doesn't exist
- [ ] Update stub when expanded
- [ ] Change status from stub to active

### Retroactive Linking Service

- [ ] Create src/services/graph/retroactive.ts
  - [ ] When new note created, find existing notes that should link to it
  - [ ] When stub expanded, update notes that created the stub
  - [ ] Add [[links]] to existing content
  - [ ] Update related field in frontmatter
- [ ] Track which notes mention which technologies
- [ ] Batch update with confirmation

### Database Schema Updates

- [ ] Add stubs table to SQLite schema
  - [ ] path, title, stub_context, created, mentioned_in
- [ ] Add technology tracking to notes
- [ ] Index for quick stub lookup
- [ ] Index for technology mentions

### Testing

- [ ] Unit tests for storage intent validation
- [ ] Unit tests for path resolution
- [ ] Unit tests for layer determination
- [ ] Unit tests for palace_store
- [ ] Unit tests for palace_check
- [ ] Unit tests for palace_improve
- [ ] Unit tests for stub manager
- [ ] Unit tests for retroactive linking
- [ ] Integration tests for full storage workflow

### Documentation

- [ ] Update CLAUDE.md with new tools
- [ ] Document intent schema
- [ ] Document path resolution rules
- [ ] Document layer determination
- [ ] Provide storage examples

## Standards & References

- [CLAUDE.md](../../CLAUDE.md) - Project guidelines
- [v2.0 Specification](../obsidian-palace-mcp-spec-v2.md) - Sections 5, 8.2
- [Git Workflow Standards](../GIT_WORKFLOW_STANDARDS.md)

## Technical Details

### Storage Intent Schema

```typescript
interface StorageIntent {
  knowledge_type:
    | 'technology'
    | 'command'
    | 'reference'
    | 'standard'
    | 'pattern'
    | 'research'
    | 'decision'
    | 'configuration'
    | 'troubleshooting'
    | 'note';

  domain: string[];              // ["kubernetes", "networking"]
  tags?: string[];

  scope: 'general' | 'project-specific';

  project?: string;
  client?: string;
  product?: string;

  technologies?: string[];       // Technologies to link/stub
  references?: string[];         // Explicit links to create
  parent?: string;               // Parent hub if known
}
```

### Path Resolution Example

```typescript
// Input Intent
{
  title: "Docker Bridge Networking",
  intent: {
    knowledge_type: "command",
    domain: ["docker", "networking"],
    scope: "general"
  }
}

// Vault Config
structure:
  command:
    path: "commands/{domain}/"

// Resolved Path
"commands/docker/networking/docker-bridge-networking.md"
```

### palace_store Input

```typescript
interface PalaceStoreInput {
  title: string;
  content: string;

  intent: StorageIntent;

  options?: {
    vault?: string;
    create_stubs?: boolean;      // default: true
    retroactive_link?: boolean;  // default: true
    expand_if_stub?: boolean;    // default: true
    dry_run?: boolean;
  };

  source?: {
    origin: 'ai:research' | 'ai:artifact' | 'human' | `web:${string}`;
    confidence?: number;
  };
}
```

### palace_check Output

```typescript
interface PalaceCheckOutput {
  found: boolean;

  matches: Array<{
    path: string;
    vault: string;
    title: string;
    status: 'active' | 'stub';
    confidence: number;
    relevance: number;
    summary: string;
    last_modified: string;
  }>;

  suggestions: {
    should_expand_stub: boolean;
    stub_path?: string;
    missing_technologies: string[];
    similar_titles: string[];
  };

  recommendation:
    | 'create_new'
    | 'expand_stub'
    | 'improve_existing'
    | 'reference_existing';
}
```

### Files to Create

```
src/
├── types/
│   └── intent.ts             # Storage intent types
├── services/
│   ├── vault/
│   │   ├── resolver.ts       # Path resolution
│   │   ├── layer-detector.ts # Layer determination
│   │   └── stub-manager.ts   # Stub creation/management
│   └── graph/
│       └── retroactive.ts    # Retroactive linking
└── tools/
    ├── store.ts              # palace_store (new)
    ├── check.ts              # palace_check (new)
    └── improve.ts            # palace_improve (renamed)
```

## Testing & Quality Assurance

### Test Coverage Requirements

| Area | Target |
|------|--------|
| Intent validation | 95% |
| Path resolution | 90% |
| Layer detection | 90% |
| Stub management | 85% |
| Tools | 85% |

### Quality Checks

- [ ] All tests passing
- [ ] No TypeScript errors
- [ ] Linting passes
- [ ] Backward compatible with palace_remember
- [ ] Backward compatible with palace_update

## Acceptance Criteria

- [ ] palace_store creates notes at correct locations
- [ ] Intent-based path resolution works correctly
- [ ] Knowledge layers determined correctly
- [ ] Stubs created for mentioned technologies
- [ ] palace_check finds existing knowledge
- [ ] palace_check recommends correct action
- [ ] palace_improve updates notes correctly
- [ ] Retroactive linking updates existing notes
- [ ] All existing functionality preserved
- [ ] All tests passing

## Risks & Mitigation

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| Breaking palace_remember users | High | Medium | Maintain deprecated alias |
| Complex intent validation | Medium | Medium | Clear error messages |
| Path resolution edge cases | Medium | Medium | Comprehensive test suite |
| Retroactive linking performance | Medium | Low | Batch updates, limits |

## Notes & Decisions

*To be filled during implementation*
