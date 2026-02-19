# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.2.4] - 2026-02-19

### Fixed
- **Dependency CVEs**: Updated `@modelcontextprotocol/sdk` to ^1.26.0 (ReDoS + data leak), `qs` to 6.15.0 (DoS)

### Changed
- **Markdownlint config**: Added `.markdownlint.json` with `MD024.siblings_only: true` to suppress false positive duplicate heading warnings
- **Refactored complex functions** (Phase 033 — Codacy issue cleanup):
  - `historyHandlerInternal`: Extracted `buildVersionResults()` for version iteration and diff generation
  - `checkIndexSync`: Extracted `findMissingNotes()` and `checkMetadataMismatches()` for clearer separation
  - `exportNote`: Extracted `consolidateForExport()` and `buildExportResult()` for hub consolidation and output writing
  - `getAccurateChildrenCount`: Extracted `verifyLinkedChildren()` and `findOrphanedChildrenInDir()` for disk verification

## [2.2.3] - 2026-02-18

### Added
- **GitHub Actions CI pipeline**: Lint, typecheck, build, and test across Node 18/20/22 on push and PR
- **Codacy coverage upload**: LCOV coverage reports uploaded to Codacy on main branch pushes
- **`@vitest/coverage-v8` dependency**: Enables `npm run test:coverage` (was previously missing)
- **LCOV coverage reporter**: Added to vitest config for CI integration

## [2.2.2] - 2026-02-18

### Fixed
- **Hub Knowledge Map reconciliation**: `palace_improve` now detects orphaned children (files in hub directory not in Knowledge Map) after modify operations and adds them automatically. Root cause of 258 orphaned fragments found during vault migration.
- **Multi-hub migration safety**: `palace_migrate` inspector no longer produces duplicate or conflicting rename suggestions when a directory contains multiple hubs.
- **Filename sanitization in migrations**: Forward slashes in note titles (e.g. "Setup/Balancer") are replaced with hyphens to prevent accidental subdirectory creation during rename.
- **Stale index guards**: Migration executor skips renames when the source file no longer exists on disk or when source and target paths are identical.

### Added
- **`addToHub` option for `createChildNote()`**: When `true`, automatically updates the hub's Knowledge Map after creating a child file. Default `false` for backward compatibility.
- **`children_reconciled` output field**: `palace_improve` now surfaces the count of orphaned children added to the Knowledge Map in the response.

## [2.2.1] - 2026-02-18

### Fixed
- **`isHubType` null guard**: Fixed crash in `palace_migrate` (and other hub-type checks) when notes have NULL type values in the index. 21 notes in production vaults had NULL types causing `Cannot read properties of null (reading 'endsWith')`.

## [2.2.0] - 2026-02-18

### Added

#### Quality and Integrity Fixes (Phase 029)
- **`palace_migrate` tool**: Vault health inspection and safe migration of legacy data
- **Retroactive linker fixes**: Skip heading lines (H1-H6) to prevent identity text modification
- **Improved match specificity**: Removed single-word alias generation, added tag-aware scoring
- **FTS5 ranking weights**: Title=10x, content=1x, tags=5x, domain=2x for better search results
- **Child note naming**: Standardized to `{Parent Title} - {Section Title}.md` format
- **Tool description improvements**: Better discoverability of key options like `create_stubs`

#### Time Tracking (Phase 030)
- **`palace_session_end` tool**: Close sessions with duration calculation and optional time entry creation
- **`palace_time_log` tool**: Log time entries with flexible duration formats (`"2h 30m"`, `"120"`, `"2.5h"`)
- **`palace_time_summary` tool**: Aggregate and report time by project, client, date, or category
- **`time_entry` note type**: Structured frontmatter with project, client, category, duration, billable status
- **Time entry storage**: Organized at `time/YYYY/MM/{date} - {project} - {category}.md`
- **Backdating support**: Log time entries for past dates via `date` field
- **10 time categories**: development, research, meetings, review, documentation, design, admin, business_dev, professional_dev, other

#### Project Management (Phase 031)
- **`palace_project_summary` tool**: Load project context at brief/standard/deep depth for AI session resume
- **Work item parser**: Extract checklists from markdown with annotation support (`[priority:high]`, `[due:YYYY-MM-DD]`, `[blocked_by:...]`, `[category:...]`)
- **Multi-project dashboard**: Pass `project: "*"` for all active projects sorted by status
- **Project hub discovery**: Fallback chain (project field, type, path, title match)
- **Schema migration**: Added `project` and `client` columns to SQLite index with indexes
- **`palace_query` filters**: New `project` and `client` filter parameters

---

## [2.1.0] - 2026-02-15

### Added

#### Smart Split System (Phase 022)
- **Content-aware splitting**: Respects code blocks and template content
- **Hub content preservation**: Prevents content destruction during splits
- **`auto_split: false` option**: Prevent splitting entirely
- **Consolidate mode**: Merge children back into hub via `palace_improve` with `mode: 'consolidate'`
- **Section-level control**: `<!-- palace:keep -->` / `<!-- palace:split -->` annotations
- **Per-operation `split_thresholds`**: Override atomic limits per call
- **Atomic warning**: Warns when content exceeds limits but splitting is disabled

#### Note Lifecycle Management (Phase 023)
- **`palace_delete` tool**: Safe note and directory deletion with backlink handling
- **Operation tracking**: All write operations tracked with operation IDs for auditing
- **Enhanced `palace_orphans`**: Rich context for AI review with content previews, similarity suggestions, and cleanup recommendations
- **New orphan types**: `stub_orphans` and `child_orphans` detection
- **Protected paths**: `.palace/` and `.obsidian/` directories cannot be deleted

#### Autolink Improvements (Phase 024)
- **Link modes**: `all`, `first_per_section` (default), `first_per_note` to control link density
- **Stop words**: Configurable list with regex pattern support to prevent linking common terms
- **Domain-scoped linking**: Limit linking to `same_domain`, `any`, or specific domains
- **Link density controls**: `max_links_per_paragraph` and `min_word_distance` options
- **Heading protection**: Never insert links within markdown headings
- **Bug fixes**: Resolved double-linking, nested bracket corruption, and title corruption

#### Metadata Integrity (Phase 025)
- **`palace_repair` tool**: Fix common metadata issues across vault notes
- **Type validation**: Validates against canonical type list with automatic normalization
- **Repair types**: `types`, `children_count`, `dates`, `domains`, `required_fields`
- **Accurate `children_count`**: Recalculated from actual children on read/query
- **Frontmatter schema validation**: Enforced on write operations

#### Export & Portability (Phase 026)
- **`palace_export` tool**: Export notes in multiple formats (markdown, clean_markdown, resolved_markdown, html)
- **Hub consolidation**: Automatically combines hub + children into single export
- **Link processing styles**: keep, plain_text, relative, remove
- **Portable mode**: `portable: true` option for `palace_store` (single file, no stubs, plain text links)
- **File output**: Write exports to file inside or outside vault

#### Batch Operations (Phase 027)
- **`palace_batch` tool**: Perform operations across multiple notes at once
- **Selection methods**: glob patterns, type, tags, domain, path prefix, with exclusions
- **Operations**: `update_frontmatter`, `add_tags`, `remove_tags`, `move`, `rename`, `delete`
- **Backlink updates**: Move and rename operations can update backlinks automatically
- **Safety**: Dry-run by default, delete requires explicit confirmation

#### Version History (Phase 028)
- **`palace_history` tool**: View per-note version history with LCS-based diffs
- **`palace_revert` tool**: Restore notes to previous versions (all, frontmatter only, or content only)
- **`palace_undo` tool**: Undo recent operations by operation ID
- **Version capture**: Automatic versioning before all write operations
- **Configurable retention**: Max versions per note, max age, auto-cleanup, exclude patterns

### Changed
- Default autolink behavior now uses `first_per_section` mode (less aggressive than previous `all`)
- `force_atomic` option deprecated in favor of `auto_split: false`

---

## [2.0.0] - 2025-12-08

### Major Release: Intent-Based Storage & Multi-Vault Support

This is the initial public release with full feature set.

### Added

#### Multi-Vault Support (Phase 008-010)
- **Global Configuration**: `~/.config/palace/config.yaml` for managing multiple vaults
- **Per-Vault Configuration**: `.palace.yaml` in each vault for structure mapping
- **Access Control**: Read-write (`rw`) or read-only (`ro`) mode per vault
- **Cross-Vault Search**: Search across all configured vaults
- **Environment Variable Quick Setup**: `PALACE_VAULTS` for simple multi-vault config
- **`palace_vaults` Tool**: List and manage configured vaults

#### Intent-Based Storage (Phase 011)
- **`palace_store` Tool**: Store knowledge by expressing intent (WHAT), not path (WHERE)
- **`palace_check` Tool**: Check for existing knowledge before creating (check-before-store pattern)
- **`palace_improve` Tool**: Intelligent note updates with multiple modes
- **Knowledge Layer Model**: Three-layer organization (Technical, Domain, Contextual)
- **Path Resolution Engine**: Automatic path determination from intent
- **Stub System**: Create placeholder notes for unknown technologies
- **Retroactive Linking**: Update existing notes when new related content is created

#### Atomic Note System (Phase 012)
- **Auto-Splitting**: Automatically split large content into hub + child notes
- **Hub Pattern**: Navigation hubs with `_index.md` files
- **Configurable Limits**: Max 200 lines, 6 sections per atomic note
- **Section Extraction**: Large sections become separate notes

#### Standards System (Phase 013)
- **`palace_standards` Tool**: Load binding standards for AI behavior
- **`palace_standards_validate` Tool**: Validate notes against standards
- **Binding Levels**: `required`, `recommended`, `optional`
- **Cross-Vault Standards**: Load standards from dedicated vault
- **AI Acknowledgment**: Required standards must be acknowledged

#### AI Support Tools (Phase 014)
- **`palace_clarify` Tool**: Generate clarifying questions for incomplete context
- **Context Detection**: Detect technologies, projects, clients, scope, domains
- **Confidence Scores**: All detections include confidence (0-1)
- **Missing Context Identification**: Know what information is needed
- **Question Generation**: Contextual questions with options and hints

#### Documentation (Phase 015)
- **API Reference**: Complete tool documentation (`docs/API.md`)
- **Configuration Guide**: All configuration options (`docs/CONFIGURATION.md`)
- **AI Behavior Guide**: Protocols for AI assistants (`docs/AI-BEHAVIOR.md`)
- **Examples**: Configuration and standard note examples (`examples/`)

### Changed

- **Frontmatter Schema**: Added `status`, `domain`, `palace` block
- **Index Schema**: New tables for stubs, technology mentions, authors
- **Note Format**: Support for hub notes and atomic note hierarchy

### Removed

- **`palace_remember`**: Removed before initial release (use `palace_store`)
- **`palace_update`**: Removed before initial release (use `palace_improve`)
- **`PALACE_VAULT_PATH`**: Legacy env var removed (use `PALACE_VAULTS` instead)
- **Schema Migrations**: Removed unused migration code for clean initial release

---

## [0.7.0] - 2025-12-06

### Added
- **Phase 007**: Session tracking tools
  - `palace_session_start` - Start a work session in daily log
  - `palace_session_log` - Log entries to current session
  - Daily log files in `daily/YYYY-MM-DD.md` format
  - Session context and topic tracking
  - Notes created tracking per entry

## [0.6.0] - 2025-12-05

### Added
- **Phase 006**: Dataview Integration
  - `palace_dataview` - Execute DQL queries against notes
  - DQL parser supporting TABLE, LIST, TASK query types
  - WHERE clause with comparison operators and logical operators
  - FROM, SORT, LIMIT clauses
  - `contains()` function for tag filtering
  - Multiple output formats: table, list, task, json

## [0.5.0] - 2025-12-05

### Added
- **Phase 005**: Auto-Linking
  - `palace_autolink` - Automatic wiki-link insertion
  - Title and alias matching with word boundaries
  - Case-insensitive matching with preserved display text
  - Dry-run mode for previewing changes
  - Auto-link integration with `palace_remember` and `palace_update`

## [0.4.0] - 2025-12-05

### Added
- **Phase 004**: Graph Intelligence
  - `palace_links` - Get incoming/outgoing links with multi-hop traversal
  - `palace_orphans` - Find disconnected notes
  - `palace_related` - Discover related content by shared links/tags
  - Link table in SQLite index for graph queries
  - Path tracking for traversal results

## [0.3.0] - 2025-12-05

### Added
- **Phase 003**: SQLite Index and Search
  - SQLite database with FTS5 full-text search
  - `palace_recall` - Search notes with BM25 ranking
  - `palace_query` - Query by properties (type, tags, dates)
  - `palace_update` - Update notes (replace/append/frontmatter modes)
  - Tag extraction and storage
  - Index synchronization

## [0.2.0] - 2025-12-04

### Added
- **Phase 002**: Core Tools
  - `palace_remember` - Create new notes with frontmatter
  - `palace_read` - Read note content by path
  - `palace_list` - List notes in directory
  - `palace_structure` - Get vault directory structure
  - YAML frontmatter parsing and generation
  - Knowledge type categorization

## [0.1.0] - 2025-12-04

### Added
- **Phase 001**: Project Foundation
  - Initial project scaffold
  - MCP server with stdio transport
  - TypeScript configuration with strict mode
  - ESLint and Vitest setup
  - Basic configuration management
  - Logging utility
