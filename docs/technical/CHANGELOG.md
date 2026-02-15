# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
