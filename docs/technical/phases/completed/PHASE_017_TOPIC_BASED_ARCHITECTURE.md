# Phase 017: Topic-Based Knowledge Architecture

**Status**: Complete
**Start Date**: 2025-12-08
**Completion Date**: 2025-12-08
**Owner**: Adam Claassens

## Executive Summary

This phase fundamentally simplified our knowledge organization model. We moved from a **type-driven** system (where AI must classify knowledge into predefined categories like "technology", "research", "command") to a **topic-driven** system (where the topic itself determines the folder structure).

**The core principle: The AI must think for itself to create organic connections. Our tools guide and suggest, but never dictate.**

## Objectives

- [x] Replace 10 hardcoded knowledge types with 3 simple capture types
- [x] Make domain/topic the folder path (no type-to-folder mapping)
- [x] Enable AI to observe vault structure and adapt to user's organization
- [x] Implement source vs knowledge distinction
- [x] Add domain suggestion system
- [x] Require confirmation for new top-level domains

## Prerequisites

- [x] Phase 008-016 completed
- [x] All current tests passing (347)
- [x] Current architecture understood
- [x] Design reviewed and approved

## Scope

### In Scope

- [x] New StorageIntent schema (3 capture types)
- [x] Simplified path resolution (domain = path)
- [x] Enhanced palace_check with domain discovery
- [x] Enhanced palace_clarify with domain selection questions
- [x] Enhanced palace_structure with domain patterns
- [x] Domain tracking in database
- [x] Updated AI behavior protocols
- [x] Documentation updates

### Out of Scope

- Migration of existing notes (clean break, pre-release)
- HTTP transport changes
- New tools (only modifying existing)
- UI/client changes

## Implementation Summary

### Files Deleted
- `src/services/vault/layer-detector.ts` - No longer needed with topic-based architecture

### Files Created
- `src/types/intent.ts` - New StorageIntent schema with CaptureType, SourceInfo, and domain suggestions

### Files Heavily Modified

#### `src/types/index.ts`
- Removed `KnowledgeType` enum (10 types)
- Removed `KnowledgeLayer` enum
- Updated `NoteFrontmatter` to use `capture_type` instead of `type`
- Updated `VaultStructure` to only contain special folder paths
- Removed `StructureMapping` type

#### `src/types/clarify.ts`
- Removed `DetectedTechnology` and `DetectedScope` interfaces
- Added `DetectedCaptureType`, `DetectedDomain`, `DetectedProject`, `DetectedClient`
- Updated `MissingContextType` to: `'capture_type' | 'domain' | 'project' | 'client' | 'source_info'`
- Updated `DetectedContext` for Phase 017 schema

#### `src/services/vault/resolver.ts`
- Complete rewrite for topic-based path resolution
- `resolveStorage()` - domain IS the folder path
- `resolveSourcePath()` - sources/{type}/{title}/
- `resolveProjectPath()` - projects/{project}/ or clients/{client}/
- `resolveKnowledgePath()` - {domain.join('/')}/
- Added `extractDomainFromPath()`, `isSpecialFolder()`, `getCaptureTypeFromPath()`

#### `src/services/vault/stub-manager.ts`
- Updated for Phase 017 schema
- Stubs now use `capture_type: knowledge` and `status: stub`

#### `src/services/ai-support/context-detector.ts`
- Complete rewrite for Phase 017
- Removed: `detectTechnologies()`, `detectScope()`, `buildTechVocabulary()`
- Added: `detectCaptureType()`, `detectDomains()`, `buildDomainVocabulary()`
- Added: `detectProjects()`, `detectClients()`, `buildProjectVocabulary()`, `buildClientVocabulary()`

#### `src/services/ai-support/missing-identifier.ts`
- Rewritten for CaptureType instead of IntentKnowledgeType
- Requirements now based on capture_type: source requires domain+source_info, knowledge requires domain, project requires domain+project

#### `src/services/ai-support/question-generator.ts`
- Updated for Phase 017 schema
- Removed scope/technologies questions
- Added capture_type and source_info questions
- Added domain selection questions

#### `src/tools/store.ts`
- Updated input schema for new StorageIntent
- Updated handleAtomicSplit for new intent structure
- Updated frontmatter generation for capture_type

#### `src/tools/check.ts`
- Added domain suggestions to output
- Returns `suggested_domains` array with confidence, reason, and existence status

#### `src/tools/clarify.ts`
- Updated for Phase 017 detection functions
- Now detects capture_type, domains, projects, clients

#### `src/tools/structure.ts`
- Added domain pattern analysis to output
- Returns `domain_patterns` with top_level_domains, all_domains, special_folders, and suggestions
- Helps AI understand vault organization before storing

#### `src/config/vault-config.ts`
- Simplified structure to only special folder paths: sources, projects, clients, daily, standards
- Removed `getStructurePath()` and `getSubpath()` functions
- Updated `getAiBinding()` to use path-based detection

#### `src/services/index/sqlite.ts`
- Added `domains` table for tracking domain hierarchy
- Added indexes for domain queries

### Database Schema Changes

```sql
-- New domains table (Phase 017)
CREATE TABLE IF NOT EXISTS domains (
    id INTEGER PRIMARY KEY,
    path TEXT UNIQUE NOT NULL,
    level INTEGER NOT NULL,
    parent_path TEXT,
    note_count INTEGER DEFAULT 0,
    created TEXT NOT NULL,
    last_used TEXT NOT NULL,
    FOREIGN KEY (parent_path) REFERENCES domains(path) ON DELETE SET NULL
);

-- New indexes
CREATE INDEX IF NOT EXISTS idx_domains_path ON domains(path);
CREATE INDEX IF NOT EXISTS idx_domains_level ON domains(level);
CREATE INDEX IF NOT EXISTS idx_domains_parent ON domains(parent_path);
CREATE INDEX IF NOT EXISTS idx_note_domains_domain ON note_domains(domain);
```

### Test Updates

#### `tests/unit/services/intent.test.ts`
- Complete rewrite for Phase 017 resolver API
- Tests for `resolveStorage()`, `extractDomainFromPath()`, `isSpecialFolder()`, `getCaptureTypeFromPath()`
- Tests for stub manager with new schema

#### `tests/unit/services/ai-support/ai-support.test.ts`
- Complete rewrite for Phase 017 detection functions
- Tests for capture type detection, domain detection, project/client detection

#### `tests/unit/config/vault-config.test.ts`
- Removed tests for deleted functions
- Updated tests for new simplified structure

### Documentation Updates

#### `docs/API.md`
- Added Core Types section explaining CaptureType, StorageIntent, SourceInfo
- Added Path Resolution Rules table
- Updated palace_store with new intent schema and examples
- Updated palace_check with domain suggestions
- Updated palace_clarify with new detection schema
- Updated palace_structure with domain_patterns output
- Updated all workflow examples for Phase 017

#### `docs/AI-BEHAVIOR.md`
- Replaced Knowledge Layer Model with Capture Type Model
- Added Protocol 1: Observe Before Acting
- Added Protocol 2: Ask Before Creating New Top-Level Domains
- Added Protocol 3: Source vs Knowledge Distinction
- Updated all examples for Phase 017 schema
- Updated Best Practices summary

## Tasks Completed

### Schema & Types

- [x] Create new StorageIntent interface in `src/types/intent.ts`
- [x] Remove KnowledgeType and KnowledgeLayer types
- [x] Update frontmatter types for new schema
- [x] Add capture_type to note schema

### Path Resolution

- [x] Rewrite `src/services/vault/resolver.ts` for topic-based paths
- [x] Delete `src/services/vault/layer-detector.ts`
- [x] Update path resolution tests

### Tool Updates

- [x] **palace_store** - New input/output schema, topic-based storage
- [x] **palace_check** - Add domain discovery and suggestions
- [x] **palace_clarify** - Add domain_selection question type
- [x] **palace_structure** - Add domain patterns output

### Database

- [x] Add domains table to schema
- [x] Update notes table (capture_type in frontmatter, not column)
- [x] Add indexes for domain queries

### Configuration

- [x] Simplify .palace.yaml schema
- [x] Remove path templates from config
- [x] Update config validation

### Documentation

- [x] Update docs/API.md with new schemas
- [x] Update docs/AI-BEHAVIOR.md with new protocols
- [x] CLAUDE.md remains accurate for core concepts

### Testing

- [x] Unit tests for new path resolution
- [x] Unit tests for domain detection
- [x] Unit tests for domain suggestions
- [x] Integration tests for topic-based storage
- [x] Update existing tests for new schema
- [x] All 334 tests passing

## Quality Checks

- [x] No hardcoded knowledge types in code
- [x] No hardcoded path templates
- [x] All tests passing (334/334)
- [x] Documentation updated

## Acceptance Criteria

- [x] Only 3 capture_types exist: 'source', 'knowledge', 'project'
- [x] Domain array directly becomes folder path
- [x] palace_check returns domain suggestions
- [x] palace_clarify can ask domain_selection questions
- [x] palace_structure returns domain patterns
- [x] AI behavior protocols documented
- [x] All tests passing
- [x] Documentation complete

## Technical Notes

### CaptureType Resolution

```typescript
// Source: sources/{type}/{title}/
// Project: projects/{project}/ or clients/{client}/
// Knowledge: {domain.join('/')}/  (topic IS the path)
```

### exactOptionalPropertyTypes

All optional properties in StorageIntent and SourceInfo interfaces use `| undefined` suffix to comply with TypeScript's strictest optional property checking:

```typescript
interface SourceInfo {
  type: SourceType;
  title: string;
  author?: string | undefined;
  url?: string | undefined;
  date?: string | undefined;
}
```

### Domain Extraction

The `extractDomainFromPath()` function handles special folders:
- `sources/book/notes.md` → `['book']` (strips sources/)
- `projects/myapp/config.md` → `['myapp']` (strips projects/)
- `kubernetes/pods.md` → `['kubernetes']` (knowledge path)

### Domain Pattern Analysis in palace_structure

The `palace_structure` tool now returns comprehensive domain analysis:

```typescript
domain_patterns: {
  top_level_domains: Array<{ name: string; totalNotes: number; depth: number }>;
  all_domains: Array<{ path: string; level: number; note_count: number; has_hub: boolean; subdomains: string[] }>;
  special_folders: { sources: boolean; projects: boolean; clients: boolean; daily: boolean; standards: boolean };
  suggestions: { existing_domains: string[]; hint: string };
}
```

## Risks Mitigated

| Risk | Mitigation Applied |
|------|---------------------|
| Breaking existing tests | Updated tests incrementally, all 334 passing |
| Complex migration | Clean break approach, no migration needed |
| AI confusion with new schema | Clear CaptureType semantics, detection helpers |

---

**Version**: 2.0
**Last Updated**: 2025-12-08
