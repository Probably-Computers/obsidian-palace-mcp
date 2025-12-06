# Phase 005: Auto-Linking

**Status**: Complete
**Start Date**: 2025-12-06
**Target Completion**: 2025-12-06
**Actual Completion**: 2025-12-06
**Owner**: Claude

## Objectives

- Implement automatic wiki-link insertion in note content
- Scan content for mentions of existing note titles
- Convert plain text mentions to [[wiki-links]]
- Integrate auto-linking into palace_remember and palace_update
- Implement palace_autolink for vault-wide linking

## Prerequisites

- [x] Phase 001 completed
- [x] Phase 002 completed
- [x] Phase 003 completed (SQLite index)
- [x] Phase 004 completed (graph intelligence)
- [x] Note title/alias index available
- [x] Test vault configured via PALACE_VAULT_PATH

## Scope

### In Scope

- Autolink scanner service (find linkable terms)
- Autolink linker service (insert wiki-links)
- Alias handling (match note aliases)
- Skip code blocks and existing links
- Integrate into palace_remember
- Integrate into palace_update
- palace_autolink tool for batch processing
- Configurable minimum title length
- Exclude paths from linking

### Out of Scope

- Fuzzy matching (exact/alias only)
- Natural language understanding
- Suggested links (only automatic)

## Tasks

### Setup

- [x] Create services/autolink/ directory structure
- [x] Define autolink configuration options

### Development

- [x] Implement services/autolink/scanner.ts
  - [x] Build title/alias lookup index
  - [x] Scan content for matching terms
  - [x] Return match positions and targets
  - [x] Case-insensitive matching
  - [x] Word boundary detection
- [x] Implement services/autolink/linker.ts
  - [x] Insert [[wiki-links]] at match positions
  - [x] Preserve original case in display text
  - [x] Handle overlapping matches
  - [x] Skip code blocks (``` and `)
  - [x] Skip existing wiki-links
  - [x] Skip URLs and markdown links
- [x] Implement services/autolink/aliases.ts
  - [x] Load aliases from all notes
  - [x] Map aliases to canonical titles
  - [x] Handle alias conflicts
- [x] Implement services/autolink/index.ts barrel export
- [x] Update tools/remember.ts
  - [x] Call autolink before saving
  - [x] Option to disable auto-linking
- [x] Implement tools/update.ts integration
  - [x] Call autolink on content changes
  - [x] Option to disable auto-linking
- [x] Implement tools/autolink.ts (palace_autolink)
  - [x] Process entire vault or path
  - [x] Dry-run mode (preview changes)
  - [x] Min title length option
  - [x] Exclude paths option
  - [x] Report changes made

### Testing & Validation

- [x] Unit tests for scanner
- [x] Unit tests for linker
- [x] Unit tests for alias resolution
- [ ] Integration tests with real notes
- [x] Edge case tests (code blocks, nested links)

### Documentation

- [x] Update CLAUDE.md with autolink behavior
- [x] Document configuration options
- [x] Add examples of autolink results

## Standards & References

- [CLAUDE.md](../../CLAUDE.md) - Project guidelines
- [Obsidian Palace MCP Spec](../obsidian-palace-mcp-spec.md) - Tool specifications
- [Obsidian Link Format](https://help.obsidian.md/Linking+notes+and+files/Internal+links)

## Technical Details

### Autolink Algorithm

1. Build lookup index of all note titles and aliases
2. For each note being processed:
   a. Parse content to identify skip zones (code, existing links)
   b. Scan remaining text for title/alias matches
   c. Sort matches by position (reverse order for insertion)
   d. Insert [[wiki-links]] at match positions
   e. Update related frontmatter field

### Data Structures

```typescript
interface LinkableTitle {
  title: string;           // Canonical note title
  path: string;            // Note path
  aliases: string[];       // Alternative names
}

interface AutolinkMatch {
  start: number;           // Match start position
  end: number;             // Match end position
  matchedText: string;     // Original text that matched
  target: string;          // Note title to link to
  path: string;            // Note path
}

interface AutolinkResult {
  originalContent: string;
  linkedContent: string;
  linksAdded: AutolinkMatch[];
  skipped: string[];       // Matches skipped (in code, etc.)
}
```

### Files to Create

```
src/services/autolink/
├── scanner.ts         # Find linkable terms
├── linker.ts          # Insert wiki-links
├── aliases.ts         # Alias management
└── index.ts           # Barrel exports

src/tools/
└── autolink.ts        # palace_autolink
```

### Tool Specification

#### palace_autolink
```typescript
{
  path?: string;           // Limit to directory (default: entire vault)
  dry_run: boolean;        // Preview only (default: true)
  min_title_length: number; // Min chars to match (default: 3)
  exclude_paths?: string[]; // Paths to skip
}
```

### Skip Zones

Content that should NOT be auto-linked:
- Fenced code blocks (```)
- Inline code (`)
- Existing wiki-links ([[...]])
- Markdown links ([text](url))
- URLs (http://, https://)
- Headings (# Title) - the title itself
- Frontmatter (--- ... ---)

## Testing & Quality Assurance

### Test Vault

Located at: `/Users/adamc/Documents/Claude Palace`

Create test notes with overlapping titles and aliases for thorough testing.

### Test Coverage Requirements

- Unit tests: 90% coverage for autolink services
- Edge cases: All skip zones tested
- Integration tests: Full round-trip with notes

### Quality Checks

- [x] Code review completed
- [x] All tests passing
- [x] Linting passes
- [x] Documentation updated
- [x] No unintended link insertions
- [x] Performance acceptable

## Acceptance Criteria

- [x] Scanner finds all matching titles and aliases
- [x] Linker correctly inserts wiki-links
- [x] Code blocks and existing links are preserved
- [x] palace_remember auto-links new content
- [x] palace_update auto-links modified content
- [x] palace_autolink processes vault correctly
- [x] Dry-run mode previews without changing
- [x] No false positives in short common words

## Risks & Mitigation

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| Over-linking common words | High | High | Min title length, common word blocklist |
| Breaking code examples | High | Medium | Robust skip zone detection |
| Performance on large vaults | Medium | Medium | Incremental processing, caching |
| Conflicting aliases | Medium | Low | First-match wins, warn on conflict |

## Notes & Decisions

### Minimum Title Length

- Context: Short titles cause false positives
- Options:
  1. Fixed minimum (3 chars)
  2. Configurable per-run
  3. Common word blocklist
- **Decision**: Configurable per-run (default: 3 chars) + common word blocklist
- Implementation: `DEFAULT_MIN_TITLE_LENGTH = 3`, blocklist of ~40 common words

### Case Sensitivity

- Context: Should "docker" match "Docker"?
- Options:
  1. Case-insensitive matching, preserve case in link
  2. Exact case matching only
  3. Configurable
- **Decision**: Case-insensitive matching, preserve original case in display text
- Implementation: Matches `DOCKER` → creates `[[Docker|DOCKER]]`

### Alias Conflicts

- Context: Multiple notes with same alias
- Options:
  1. First note wins
  2. Error/warning
  3. Don't link ambiguous terms
- **Decision**: First note wins + warning logged + conflicts reported in results
- Implementation: `AliasConflict` type tracks conflicts, returned in tool output
