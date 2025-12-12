# Obsidian Palace MCP Server

## Project Overview

An MCP server that enables AI assistants to use Obsidian as a persistent memory store - a "Memory Palace" where AI can document research findings, commands, functionality, and knowledge in a structured way that both humans and AI can retrieve later.

**Key Features:**
- AI-agnostic (works with any MCP client)
- Multi-vault support with read/write access control
- Auto-linking (creates [[wiki-links]] automatically)
- Dataview integration (DQL query support)
- Provenance tracking (source, confidence, verified status)
- Per-vault configuration with ignore patterns

## Architecture

- **Transport**: stdio (primary)
- **Index**: SQLite with FTS5 for full-text search
- **File Format**: Markdown with YAML frontmatter
- **Language**: TypeScript with strict mode

## Key Design Principles

1. **Modular files** - Each source file under 200 lines
2. **Single responsibility** - One tool per file, one service per file
3. **Type safety** - Full TypeScript with Zod validation for all inputs
4. **Test coverage** - Unit tests for all services and tools
5. **No duplication** - Shared logic in utils/, reference don't repeat
6. **Vault isolation** - Each vault is an independent "brain"; vaults never reference or share knowledge with each other. Cross-vault linking is NOT supported. When creating new knowledge, always know which vault it belongs to (ask the user if unsure).

## Directory Structure

```
src/
├── index.ts                    # Entry point, MCP server setup
├── config/
│   ├── index.ts               # Environment config with Zod validation
│   ├── global-config.ts       # Global multi-vault config loading
│   └── vault-config.ts        # Per-vault config loading
├── services/
│   ├── vault/                 # File system operations
│   │   ├── reader.ts          # Read files from vault
│   │   ├── writer.ts          # Write files to vault
│   │   ├── watcher.ts         # File system watcher (chokidar)
│   │   ├── registry.ts        # Multi-vault registry service
│   │   ├── ignore.ts          # Ignore pattern matching
│   │   └── index.ts           # Service exports
│   ├── index/                 # SQLite index
│   │   ├── sqlite.ts          # Database setup and migrations
│   │   ├── query.ts           # FTS5 query builder
│   │   ├── sync.ts            # Index synchronization
│   │   └── index.ts
│   ├── graph/                 # Knowledge graph
│   │   ├── links.ts           # Wiki-link parser
│   │   ├── relationships.ts   # Graph traversal
│   │   └── index.ts
│   ├── autolink/              # Auto wiki-linking
│   │   ├── scanner.ts         # Scan content for linkable terms
│   │   ├── linker.ts          # Insert [[links]] into content
│   │   ├── aliases.ts         # Handle note aliases
│   │   └── index.ts
│   ├── dataview/              # Dataview query support
│   │   ├── parser.ts          # Parse DQL queries
│   │   ├── executor.ts        # Execute queries against index
│   │   ├── formatter.ts       # Format results
│   │   └── index.ts
│   ├── standards/             # AI binding standards
│   │   ├── loader.ts          # Find and load standards
│   │   ├── validator.ts       # Compliance checking
│   │   └── index.ts
│   └── ai-support/            # AI support tools
│       ├── context-detector.ts  # Detect tech/project/client/scope
│       ├── missing-identifier.ts # Identify missing context
│       ├── question-generator.ts # Generate clarifying questions
│       └── index.ts
├── tools/                     # MCP tool implementations
│   ├── store.ts               # palace_store (intent-based storage)
│   ├── check.ts               # palace_check
│   ├── improve.ts             # palace_improve
│   ├── recall.ts              # palace_recall
│   ├── read.ts                # palace_read
│   ├── list.ts                # palace_list
│   ├── structure.ts           # palace_structure
│   ├── links.ts               # palace_links
│   ├── orphans.ts             # palace_orphans
│   ├── related.ts             # palace_related
│   ├── autolink.ts            # palace_autolink
│   ├── dataview.ts            # palace_dataview
│   ├── query.ts               # palace_query
│   ├── session.ts             # palace_session_*
│   ├── standards.ts           # palace_standards
│   ├── vaults.ts              # palace_vaults
│   ├── clarify.ts             # palace_clarify
│   ├── stubs.ts               # palace_stubs
│   └── index.ts               # Tool registration
├── utils/
│   ├── markdown.ts            # Markdown parsing utilities
│   ├── slugify.ts             # Title to filename conversion
│   ├── frontmatter.ts         # YAML frontmatter handling
│   ├── wikilinks.ts           # [[link]] parsing/creation
│   └── logger.ts              # Logging utility
└── types/
    └── index.ts               # Shared type definitions
```

## Development Commands

```bash
npm run dev      # Run with hot reload (tsx watch)
npm run build    # Compile TypeScript to dist/
npm run start    # Run compiled version
npm run lint     # ESLint check
npm run typecheck # Type check without emitting
npm run inspect  # Test with MCP Inspector
```

### Test Commands

```bash
npm run test             # Run all tests once (default)
npm run test:fast        # Run all tests with minimal output (dot reporter)
npm run test:unit        # Run only unit tests (fastest)
npm run test:integration # Run only integration tests
npm run test:watch       # Run tests in watch mode
npm run test:coverage    # Run tests with coverage report
```

**Important**: When verifying implementation, use `npm run test:fast` or `npm run test:unit` for quick feedback. The full test suite can take several minutes. For phase completion verification, run the specific test file:

```bash
npx vitest run tests/unit/services/specific-test.test.ts  # Single file
npx vitest run tests/unit/services --reporter=dot         # Directory
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| PALACE_VAULTS | Yes* | - | Vault config: path:alias:mode,... |
| PALACE_CONFIG_PATH | No | ~/.config/palace/config.yaml | Global config location |
| PALACE_DEFAULT_VAULT | No | First vault | Default vault alias |
| PALACE_INDEX_PATH | No | {vault}/.palace/index.sqlite | SQLite database location |
| PALACE_LOG_LEVEL | No | info | debug, info, warn, error |
| PALACE_WATCH_ENABLED | No | true | Watch for external file changes |
| HTTP_ENABLED | No | false | Enable HTTP/SSE transport instead of stdio |
| HTTP_PORT | No | 3000 | Port for HTTP transport |
| HTTP_CORS_ORIGIN | No | * | CORS origin for HTTP transport |

*Required unless PALACE_CONFIG_PATH is set pointing to a config file

### Development Setup with direnv

Create `.envrc` in project root (git-ignored):
```bash
export PALACE_VAULTS="/path/to/your/obsidian/vault:dev:rw"
export PALACE_LOG_LEVEL="debug"
```

Or for multi-vault:
```bash
export PALACE_VAULTS="/path/to/work:work:rw,/path/to/personal:personal:rw"
export PALACE_DEFAULT_VAULT="work"
```

Run `direnv allow` to activate.

## Multi-Vault Configuration

### Global Config File (~/.config/palace/config.yaml)

```yaml
version: 1

vaults:
  - path: "/Users/adam/Documents/Work Palace"
    alias: work
    mode: rw
    default: true
    description: "Work-related knowledge"

  - path: "/Users/adam/Documents/Personal Palace"
    alias: personal
    mode: rw

  - path: "/Users/adam/Documents/Vendor Docs"
    alias: vendor
    mode: ro   # Read-only

cross_vault:
  search: true                  # Allow searching multiple vaults at once
  # Note: Cross-vault linking is NOT supported by design - vaults are isolated

settings:
  log_level: info
  watch_enabled: true
  auto_index: true
```

### Per-Vault Config ({vault}/.palace.yaml)

```yaml
vault:
  name: work-knowledge
  description: "Work-related knowledge"

structure:
  sources: "sources/"
  projects: "projects/"
  clients: "clients/"
  daily: "daily/"
  standards: "standards/"

ignore:
  patterns:
    - ".obsidian/"
    - "templates/"
    - "private/**"
  marker_file: ".palace-ignore"
  frontmatter_key: "palace_ignore"

atomic:
  max_lines: 200
  max_sections: 6
  auto_split: true

stubs:
  auto_create: true
  min_confidence: 0.2

graph:
  require_technology_links: true
  warn_orphan_depth: 1
  retroactive_linking: true
```

### Ignore Mechanism

Notes and directories can be ignored via three layers:

1. **Config patterns** - Glob patterns in .palace.yaml ignore section
2. **Marker files** - Create `.palace-ignore` in a directory to ignore it
3. **Frontmatter** - Add `palace_ignore: true` to a note's frontmatter

## Note Format

All notes use YAML frontmatter:

```yaml
---
type: research | command | infrastructure | client | project | pattern | troubleshooting
created: 2025-12-05T14:30:00Z
modified: 2025-12-05T14:30:00Z
source: claude | user | web:{url}
confidence: 0.85
verified: false
tags: [tag1, tag2]
related: ["[[Other Note]]"]
aliases: [alternate-name]
---

# Title

Content here...
```

## Tool Schemas

All tool inputs are validated with Zod. Each tool file exports:
- `schema` - Zod schema for input validation
- `handler` - Async function that implements the tool
- Tool is registered in `tools/index.ts`

### Implemented Tools

| Tool | Status | Description |
|------|--------|-------------|
| palace_store | ✅ | Intent-based knowledge storage (AI expresses WHAT, Palace decides WHERE) |
| palace_check | ✅ | Check for existing knowledge before creating (prevents duplicates) |
| palace_improve | ✅ | Intelligently update existing notes with multiple modes |
| palace_read | ✅ | Read note content by path |
| palace_recall | ✅ | Full-text search with FTS5 ranking |
| palace_list | ✅ | List notes in directory |
| palace_structure | ✅ | Get vault directory structure |
| palace_query | ✅ | Query by properties (type, tags, confidence, dates) |
| palace_links | ✅ | Backlink/outlink traversal with multi-hop support |
| palace_orphans | ✅ | Find disconnected notes (no incoming/outgoing links) |
| palace_related | ✅ | Discover related content by shared links/tags |
| palace_autolink | ✅ | Automatic wiki-link insertion |
| palace_dataview | ✅ | DQL query execution |
| palace_session_start | ✅ | Start a work session in daily log |
| palace_session_log | ✅ | Log entries to current session |
| palace_vaults | ✅ | List and manage configured vaults |
| palace_standards | ✅ | Load and query binding standards for AI |
| palace_standards_validate | ✅ | Validate notes against applicable standards |
| palace_clarify | ✅ | Detect context and generate clarifying questions for incomplete storage intents |
| palace_stubs | ✅ | List and manage stub notes that need expansion |

### palace_recall

Search notes using FTS5 full-text search with BM25 ranking.

```typescript
{
  query: string;           // Search query (required)
  type?: KnowledgeType | 'all';  // Filter by type
  tags?: string[];         // Filter by tags (AND logic)
  path?: string;           // Filter by path prefix
  min_confidence?: number; // Minimum confidence (0-1)
  limit?: number;          // Max results (default: 10)
  include_content?: boolean; // Include content (default: true)
}
```

### palace_query

Query notes by properties without full-text search:

```typescript
{
  type?: KnowledgeType | 'all';
  tags?: string[];         // Must have ALL tags
  path?: string;           // Path prefix filter
  source?: string;         // Source filter
  min_confidence?: number;
  max_confidence?: number;
  verified?: boolean;
  created_after?: string;  // ISO date
  created_before?: string;
  modified_after?: string;
  modified_before?: string;
  sort_by?: 'created' | 'modified' | 'title' | 'confidence';
  sort_order?: 'asc' | 'desc';
  limit?: number;          // Default: 20
  offset?: number;         // For pagination
}
```

### palace_links

Get incoming links (backlinks) and outgoing links for a note with multi-hop traversal:

```typescript
{
  path: string;                              // Note to analyze (required)
  direction?: 'incoming' | 'outgoing' | 'both';  // Link direction (default: both)
  depth?: number;                            // Traversal depth 1-5 (default: 1)
}
```

### palace_orphans

Find orphan notes - notes with missing link connections:

```typescript
{
  type?: 'no_incoming' | 'no_outgoing' | 'isolated';  // Orphan type (default: isolated)
  path?: string;                             // Limit to directory
  limit?: number;                            // Max results (default: 50)
}
```

### palace_related

Find notes related to a given note by shared links or tags:

```typescript
{
  path: string;                              // Source note (required)
  method?: 'links' | 'tags' | 'both';        // Relatedness method (default: both)
  limit?: number;                            // Max results (default: 10)
}
```

### palace_autolink

Automatically insert wiki-links in notes by finding mentions of existing note titles:

```typescript
{
  path?: string;              // Note path or directory (default: entire vault)
  dry_run?: boolean;          // Preview only, no changes (default: true)
  min_title_length?: number;  // Minimum title length to match (default: 3)
  exclude_paths?: string[];   // Paths to skip
  include_aliases?: boolean;  // Include note aliases in matching (default: true)
}
```

**Auto-linking behavior:**
- Scans content for mentions of existing note titles and aliases
- Case-insensitive matching with word boundary detection
- Preserves original case using display text: `[[Docker|DOCKER]]`
- Skips code blocks, inline code, existing links, URLs, headings, and frontmatter
- Built into `palace_store` and `palace_improve` (controlled via `autolink` parameter)

### palace_dataview

Execute Dataview Query Language (DQL) queries against notes:

```typescript
{
  query: string;                              // DQL query string (required)
  format?: 'table' | 'list' | 'task' | 'json';  // Output format (default: json)
}
```

**Supported DQL syntax:**
- Query types: `TABLE`, `LIST`, `TASK`
- Clauses: `FROM`, `WHERE`, `SORT`, `LIMIT`
- Operators: `=`, `!=`, `>`, `<`, `>=`, `<=`, `AND`, `OR`
- Functions: `contains(field, value)`

**Example queries:**
```dataview
TABLE title, confidence FROM "research" WHERE verified = false SORT confidence DESC
LIST FROM "commands" WHERE contains(tags, "kubernetes")
TABLE title, type WHERE confidence > 0.8 SORT modified DESC LIMIT 10
```

**Supported fields:**
- `path`, `title`, `type`, `created`, `modified`, `source`, `confidence`, `verified`, `content`
- Dataview aliases: `file.path`, `file.name`, `file.ctime`, `file.mtime`

### palace_session_start

Start a new work session in today's daily log:

```typescript
{
  topic: string;           // What this session is about (required)
  context?: string;        // Additional context (client, project)
}
```

Creates a session entry in `daily/YYYY-MM-DD.md` with proper YAML frontmatter and session structure.

### palace_session_log

Add an entry to the current session:

```typescript
{
  entry: string;           // What happened / learned (required)
  notes_created?: string[]; // Paths of notes created during this entry
}
```

Requires an active session (use `palace_session_start` first).

### palace_vaults

List all configured vaults with their aliases, paths, and access modes:

```typescript
{
  include_counts?: boolean;   // Include note counts (default: false)
  include_config?: boolean;   // Include vault config details (default: false)
}
```

**Output includes:**
- Vault alias, path, mode (rw/ro)
- Default vault indicator
- Cross-vault search status
- Optional: note counts, config details

### palace_store

Intent-based knowledge storage. AI expresses WHAT to store, Palace determines WHERE based on vault configuration:

```typescript
{
  title: string;           // Note title (required)
  content: string;         // Note content in markdown (required)
  intent: {                // Storage intent (required)
    knowledge_type: 'technology' | 'command' | 'reference' | 'standard' |
                    'pattern' | 'research' | 'decision' | 'configuration' |
                    'troubleshooting' | 'note';
    domain: string[];      // Domain classification (e.g., ['kubernetes', 'networking'])
    scope: 'general' | 'project-specific';
    project?: string;      // Project name for project-specific
    client?: string;       // Client name for client-specific
    technologies?: string[]; // Technologies mentioned (stubs created if missing)
    references?: string[]; // Explicit links to create
  };
  options?: {
    vault?: string;        // Vault alias (default: default vault)
    create_stubs?: boolean; // Create stubs for mentioned tech (default: true)
    retroactive_link?: boolean; // Update existing notes with links (default: true)
    autolink?: boolean;    // Auto-link to existing notes (default: true)
    dry_run?: boolean;     // Preview without saving (default: false)
  };
  source?: {
    origin: string;        // e.g., 'ai:research', 'human', 'web:url'
    confidence?: number;   // 0.0 - 1.0
  };
}
```

**Knowledge Layers:**
- **Layer 1 (Technical)**: technology, command, reference → Never trapped in projects
- **Layer 2 (Domain)**: standard, pattern, research → Best practices
- **Layer 3 (Contextual)**: decision, configuration → Project/client-specific

### palace_check

Check for existing knowledge before creating new notes (prevents duplicates):

```typescript
{
  query: string;           // Topic or title to check for (required)
  knowledge_type?: string; // Optional filter by knowledge type
  domain?: string[];       // Optional filter by domain tags
  path_filter?: string;    // Filter results by path prefix (e.g., "infrastructure")
  include_stubs?: boolean; // Include stub notes (default: true)
  vault?: string;          // Vault alias
}
```

**Returns:**
- `found`: Whether matches exist
- `matches`: Ranked list of similar notes with relevance scores
- `recommendation`: 'create_new' | 'expand_stub' | 'improve_existing' | 'reference_existing'
- `suggestions`: Stub candidates, similar titles, and domain suggestions

**Use `path_filter`** to avoid false positives from unrelated domains (e.g., filter by "infrastructure" to exclude gardening results when searching for "containers").

### palace_improve

Intelligently update existing notes with multiple modes:

```typescript
{
  path: string;            // Path to note (required)
  mode: 'append' | 'append_section' | 'update_section' |
        'merge' | 'replace' | 'frontmatter';
  content?: string;        // New content (not needed for frontmatter mode)
  section?: string;        // Section name for update_section mode
  frontmatter?: object;    // Frontmatter fields to update
  autolink?: boolean;      // Auto-link new content (default: true)
  auto_split?: boolean;    // Auto-split if exceeds atomic limits (default: true)
  vault?: string;          // Vault alias
}
```

**Auto-split behavior:** When `auto_split` is enabled (default) and updated content exceeds atomic limits, the note is automatically converted to a hub + children structure. The original file is replaced with the hub, and child notes are created for each section.

**Update Modes:**
- `append`: Add content to end of note
- `append_section`: Add as new H2 section
- `update_section`: Replace specific H2 section content
- `merge`: Intelligently merge (avoid duplicate sections)
- `replace`: Full content replacement
- `frontmatter`: Update only metadata

## Atomic Note System

The Palace enforces atomic notes with automatic splitting when content exceeds configured limits.

### Atomic Limits

| Metric | Default | Configurable |
|--------|---------|--------------|
| Total lines | 200 | `atomic.max_lines` |
| H2 sections | 6 | `atomic.max_sections` |
| Section lines | 50 | `atomic.section_max_lines` |
| Hub lines | 150 | N/A |

### Obsidian-Native Filenames (Phase 018)

All notes use **title-style filenames** that align with Obsidian best practices:

| Note Type | Convention | Example |
|-----------|------------|---------|
| Hub note | `{Title}.md` | `Kubernetes.md`, `Green Peppers.md` |
| Child note | `{Section Title}.md` | `Climate Requirements.md`, `Architecture.md` |
| Stub note | `{Title}.md` | `containerd.md` |

**Benefits:**
- Natural wiki-links: `[[Kubernetes]]` instead of `[[kubernetes/_index]]`
- Readable in Obsidian sidebar
- No plugin dependencies for folder-note behavior
- Aligns with MOC (Map of Content) best practices

### Automatic Splitting

When content submitted to `palace_store` exceeds atomic limits:

1. Content is analyzed for line count, sections, and sub-concepts
2. A split strategy is determined (by_sections, by_large_sections, by_sub_concepts)
3. A hub note is created with navigation links
4. Child notes are created for each section
5. All notes are indexed and cross-linked

### Hub Note Structure

```markdown
---
type: research_hub
title: Kubernetes
children_count: 5
domain:
  - infrastructure
  - kubernetes
---

# Kubernetes

Brief overview...

## Knowledge Map

- [[Architecture]] - Control plane and node components
- [[Core Concepts]] - Pods, Services, Deployments
- [[Container Runtimes]] - containerd, CRI-O, gVisor
```

### Child Note Structure

```markdown
---
type: research
title: Architecture
domain:
  - infrastructure
  - kubernetes
---

# Architecture

Content here (max 200 lines)...

See also: [[Kubernetes]] for the main overview.
```

**Note**: Child notes link to parent hubs **inline in content** (Zettelkasten style) rather than via frontmatter fields.

### Skipping Atomic Splitting

To store large content without splitting:

```typescript
{
  // ... other options
  options: {
    force_atomic: true  // Skips atomic splitting
  }
}
```

### Atomic Warning on Improve

When `palace_improve` adds content that causes a note to exceed atomic limits, a warning is returned but the note is still updated. Consider using `palace_store` with hub structure for very large content.

## Standards System

The Palace supports binding standards - notes that AI should follow during sessions.

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

- Must use conventional commits format
- Must include scope when applicable
- Should not force push to main branch

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

### palace_standards

Load binding standards that AI should follow:

```typescript
{
  domain?: string[];           // Filter by domain (e.g., ["git", "code-style"])
  applies_to?: string;         // Filter by what it applies to (e.g., "typescript")
  binding?: 'required' | 'recommended' | 'optional' | 'all';
  vault?: string;              // Vault alias (default: standards_source or default)
  include_content?: boolean;   // Include full content (default: true)
}
```

**Output includes:**
- Array of matching standards with path, title, binding, content, summary
- `acknowledgment_required`: true if any required standards found
- `acknowledgment_message`: Message AI should acknowledge

### palace_standards_validate

Validate a note against applicable standards:

```typescript
{
  path: string;                // Note path to validate (required)
  vault?: string;              // Vault alias
  standards?: string[];        // Specific standard paths to validate against
}
```

**Output includes:**
- `compliant`: Whether note passes all applicable standards
- `violations`: Array of violations with standard, requirement, actual value
- `warnings`: Array of warnings
- `checked_against`: List of standard paths checked

### Cross-Vault Standards

Configure a dedicated standards vault in global config:

```yaml
cross_vault:
  search: true
  standards_source: "standards"  # Vault alias containing standards
```

Standards from `standards_source` vault are loaded automatically when no vault is specified in queries.

### palace_clarify

Detect context and generate clarifying questions when storage intent is incomplete:

```typescript
{
  context: {
    title: string;                    // Note title (required)
    content_preview: string;          // First 500 chars for analysis (required)
    detected_technologies?: string[]; // Technologies AI already detected
    detected_context?: {              // Context hints AI detected
      possible_projects: string[];
      possible_clients: string[];
    };
  };
  missing?: ('scope' | 'project' | 'client' | 'technologies' | 'domain')[];
  vault?: string;                     // Vault alias
}
```

**Output includes:**
- `detected`: Full context detection results (technologies, projects, clients, scope, domains)
- `questions`: Array of clarifying questions with options and hints
- `suggestions`: Suggested values based on detection confidence
- `confidence`: Overall and per-field confidence scores

**Workflow with palace_store:**
1. AI prepares storage intent
2. If intent incomplete → call `palace_clarify`
3. AI presents questions to user
4. User provides answers
5. AI updates intent and calls `palace_store`

**Question Types:**
- `choice`: Select from options (e.g., "General knowledge" vs "Project-specific")
- `confirm`: Yes/no confirmation (e.g., "Link to these technologies?")
- `text`: Free text input

**Detection Capabilities:**
- Technologies: Pattern matching + code block languages + vault vocabulary
- Projects/Clients: Contextual patterns + vault directory scanning
- Scope: "our/we/us" indicators vs "general/standard/best practice"
- Domains: networking, security, database, devops, frontend, backend, testing

### palace_stubs

List all stub notes (placeholders) that need expansion:

```typescript
{
  path_filter?: string;           // Filter by path prefix (e.g., "infrastructure")
  sort_by?: 'created' | 'mentions' | 'title';  // Sort order (default: created)
  limit?: number;                 // Max results (default: 50)
  vault?: string;                 // Vault alias
}
```

**Output includes:**
- `stub_count`: Number of stubs returned
- `stubs`: Array of stub info (path, title, domain, created, mentioned_in, mention_count)
- `summary`: Total stubs, oldest stub, most mentioned, domains with stubs

**Use cases:**
- Find stubs that need content
- Prioritize stubs by mention count (most referenced = most needed)
- Focus on specific domain areas

## Testing

- Unit tests in `tests/unit/` mirror src/ structure
- Integration tests in `tests/integration/` use a test vault
- Run `npm test` before committing

## Git Workflow

See [Git Workflow Standards](docs/technical/GIT_WORKFLOW_STANDARDS.md) for complete guidelines.

**Quick Reference:**
- Main branch: `main`
- Feature branches: `feature/{name}`, `bugfix/{name}`, `hotfix/{name}`
- Commits: Conventional Commits format
- **No co-authors or AI attribution** - Commit as the current git user only

**Commit Format:**
```
<type>(<scope>): <subject>

<body>
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`

**Examples:**
```
feat(tools): add palace_improve tool
fix(recall): resolve search scoring bug
docs(readme): update installation instructions
```

**Important:** Never include "Co-authored-by", "Generated by Claude", or any AI attribution in commits. All commits should appear as if written solely by the git user.

## Documentation

- [CLAUDE.md](CLAUDE.md) - This file, project guidelines
- [docs/technical/obsidian-palace-mcp-spec.md](docs/technical/obsidian-palace-mcp-spec.md) - Full specification
- [docs/technical/GIT_WORKFLOW_STANDARDS.md](docs/technical/GIT_WORKFLOW_STANDARDS.md) - Git practices
- [docs/technical/PHASE_GUIDE.md](docs/technical/PHASE_GUIDE.md) - Phase management
- [docs/technical/phases/](docs/technical/phases/) - Current and completed phases
