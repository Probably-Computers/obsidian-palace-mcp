# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Session tracking tools (`palace_session_start`, `palace_session_log`)
- Daily session log files with YAML frontmatter
- Support for tracking notes created during sessions

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
