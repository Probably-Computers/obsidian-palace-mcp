# Obsidian Palace MCP Server

## Project Overview

An MCP server that enables AI assistants to use Obsidian as a persistent memory store - a "Memory Palace" where AI can document research findings, commands, functionality, and knowledge in a structured way that both humans and AI can retrieve later.

**Key Features:**
- AI-agnostic (works with any MCP client)
- Auto-linking (creates [[wiki-links]] automatically)
- Dataview integration (DQL query support)
- Provenance tracking (source, confidence, verified status)

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

## Directory Structure

```
src/
├── index.ts                    # Entry point, MCP server setup
├── config/
│   └── index.ts               # Environment config with Zod validation
├── services/
│   ├── vault/                 # File system operations
│   │   ├── reader.ts          # Read files from vault
│   │   ├── writer.ts          # Write files to vault
│   │   ├── watcher.ts         # File system watcher (chokidar)
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
│   └── dataview/              # Dataview query support
│       ├── parser.ts          # Parse DQL queries
│       ├── executor.ts        # Execute queries against index
│       ├── formatter.ts       # Format results
│       └── index.ts
├── tools/                     # MCP tool implementations
│   ├── remember.ts            # palace_remember
│   ├── recall.ts              # palace_recall
│   ├── read.ts                # palace_read
│   ├── update.ts              # palace_update
│   ├── list.ts                # palace_list
│   ├── structure.ts           # palace_structure
│   ├── links.ts               # palace_links
│   ├── orphans.ts             # palace_orphans
│   ├── related.ts             # palace_related
│   ├── autolink.ts            # palace_autolink
│   ├── dataview.ts            # palace_dataview
│   ├── query.ts               # palace_query
│   ├── session.ts             # palace_session_*
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
npm run test     # Run tests with vitest
npm run lint     # ESLint check
npm run inspect  # Test with MCP Inspector
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| PALACE_VAULT_PATH | Yes | - | Path to Obsidian vault |
| PALACE_INDEX_PATH | No | {vault}/.palace/index.sqlite | SQLite database location |
| PALACE_LOG_LEVEL | No | info | debug, info, warn, error |
| PALACE_WATCH_ENABLED | No | true | Watch for external file changes |

### Development Setup with direnv

Create `.envrc` in project root (git-ignored):
```bash
export PALACE_VAULT_PATH="/path/to/your/obsidian/vault"
export PALACE_LOG_LEVEL="debug"
```

Run `direnv allow` to activate.

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
| palace_remember | ✅ | Create new notes with frontmatter |
| palace_read | ✅ | Read note content by path |
| palace_recall | ✅ | Full-text search with FTS5 ranking |
| palace_list | ✅ | List notes in directory |
| palace_structure | ✅ | Get vault directory structure |
| palace_update | ✅ | Update existing notes (replace/append/frontmatter) |
| palace_query | ✅ | Query by properties (type, tags, confidence, dates) |
| palace_links | ✅ | Backlink/outlink traversal with multi-hop support |
| palace_orphans | ✅ | Find disconnected notes (no incoming/outgoing links) |
| palace_related | ✅ | Discover related content by shared links/tags |
| palace_autolink | ✅ | Automatic wiki-link insertion |
| palace_dataview | ✅ | DQL query execution |

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

### palace_update

Update existing notes with three modes:

```typescript
{
  path: string;            // Note path (required)
  mode?: 'replace' | 'append' | 'frontmatter';  // Update mode
  content?: string;        // New content (for replace/append)
  frontmatter?: {          // Frontmatter updates (merged)
    type?: KnowledgeType;
    source?: string;
    confidence?: number;
    verified?: boolean;
    tags?: string[];
    related?: string[];
    aliases?: string[];
  };
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
- Built into `palace_remember` and `palace_update` (controlled via `autolink` parameter)

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

## Testing

- Unit tests in `tests/unit/` mirror src/ structure
- Integration tests in `tests/integration/` use a test vault
- Run `npm test` before committing

## Git Workflow

See [Git Workflow Standards](docs/GIT_WORKFLOW_STANDARDS.md) for complete guidelines.

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
feat(tools): add palace_update tool
fix(recall): resolve search scoring bug
docs(readme): update installation instructions
```

**Important:** Never include "Co-authored-by", "Generated by Claude", or any AI attribution in commits. All commits should appear as if written solely by the git user.

## Documentation

- [CLAUDE.md](CLAUDE.md) - This file, project guidelines
- [docs/obsidian-palace-mcp-spec.md](docs/obsidian-palace-mcp-spec.md) - Full specification
- [docs/GIT_WORKFLOW_STANDARDS.md](docs/GIT_WORKFLOW_STANDARDS.md) - Git practices
- [docs/PHASE_GUIDE.md](docs/PHASE_GUIDE.md) - Phase management
- [docs/phases/](docs/phases/) - Current and completed phases
