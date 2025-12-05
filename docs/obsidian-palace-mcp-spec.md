# Obsidian Palace MCP Server Specification

## Vision

An open-source MCP server that enables any AI assistant to use Obsidian as a persistent memory store - a "Memory Palace" where AI can document research findings, commands, functionality, and knowledge in a structured way that both humans and AI can retrieve later.

**Key Differentiators:**
- **AI-agnostic** — Works with Claude, ChatGPT, or any MCP-compatible client
- **Knowledge-first design** — Purpose-built for AI memory, not just file access
- **Auto-linking** — Automatically creates wiki-links between related notes
- **Dataview integration** — Query your vault using Dataview syntax
- **Provenance tracking** — Know where every piece of knowledge came from

**Repository:** `https://gitlab.com/AdamClaassens/obsidian-palace-mcp`
**Package:** `obsidian-palace-mcp` (npm)

---

## Core Philosophy

### From Luci's Design
- **Human readable** — You can browse Claude's knowledge in Obsidian
- **Machine readable** — Markdown + YAML frontmatter is trivially parseable
- **Graph structure** — `[[wiki-links]]` create relationships naturally
- **Version controlled** — Git the whole vault, full history
- **Shared knowledge** — You and Claude use the same knowledge base
- **Hierarchical organization** — Not spatial (AI doesn't need "rooms")
- **Semantic links** — Connections by meaning, not location

### From Your Documentation Philosophy
- **Ultra-modular** — Each file serves ONE specific purpose
- **Under 200 lines per file** — Aim for 100-150
- **Single responsibility** — One concept/command/topic per file
- **No duplication** — Reference other files instead of repeating
- **Progressive disclosure** — Overview → Details → Implementation
- **Technology separation** — Don't mix Django commands with Next.js

---

## Vault Structure

```
palace/
├── _index/                          # Navigation and meta
│   ├── README.md                    # Vault overview
│   └── recent.md                    # Auto-updated recent additions
│
├── research/                        # Research findings
│   ├── {topic}/
│   │   ├── _overview.md            # Topic overview with links
│   │   ├── {subtopic}.md           # Specific findings
│   │   └── sources.md              # Source links and citations
│
├── commands/                        # CLI commands and snippets
│   ├── {technology}/               # docker/, kubectl/, git/, etc.
│   │   ├── _overview.md            # Command category overview
│   │   └── {command-name}.md       # Individual command docs
│
├── infrastructure/                  # Systems and services
│   ├── {service}/                  # kubernetes/, proxmox/, etc.
│   │   ├── _overview.md
│   │   └── {topic}.md
│
├── clients/                         # Client-specific knowledge
│   ├── {client-name}/
│   │   ├── _overview.md            # Client context
│   │   ├── systems.md              # Their systems
│   │   ├── contacts.md             # Key contacts
│   │   └── decisions.md            # Important decisions made
│
├── projects/                        # Project documentation
│   ├── {project-name}/
│   │   ├── _overview.md
│   │   ├── architecture.md
│   │   ├── decisions.md            # ADRs
│   │   └── learnings.md            # What worked/didn't
│
├── patterns/                        # Reusable patterns
│   ├── {category}/
│   │   └── {pattern-name}.md
│
├── troubleshooting/                 # Problems and solutions
│   ├── {technology}/
│   │   └── {issue-name}.md
│
└── daily/                           # Session logs (optional)
    └── {YYYY-MM-DD}.md             # What was worked on
```

---

## Note Format Standard

### YAML Frontmatter (Required)

```yaml
---
type: research | command | infrastructure | client | project | pattern | troubleshooting
created: 2025-12-05T14:30:00Z
modified: 2025-12-05T14:30:00Z
source: claude | adam | web:{url}
confidence: 0.0-1.0  # How certain is this information
verified: true | false  # Has a human confirmed this
tags: [tag1, tag2]
related: ["[[Other Note]]", "[[Another Note]]"]
aliases: [alternate-name, another-name]
---
```

### Content Structure

```markdown
# {Title}

## Overview
{1-2 sentence summary of what this covers}

## {Main Content}
{The actual information, commands, etc.}

## Usage / Example
{Practical example if applicable}

## See Also
- [[Related Topic 1]]
- [[Related Topic 2]]

## Sources
- {URL or reference if from external source}
```

---

## MCP Tools Specification

### Core Knowledge Tools

#### `palace_remember`
Store new knowledge in the palace.

```typescript
{
  name: "palace_remember",
  description: "Store new knowledge in the Obsidian palace",
  inputSchema: {
    type: "object",
    properties: {
      content: {
        type: "string",
        description: "The knowledge to store (markdown)"
      },
      title: {
        type: "string", 
        description: "Note title (will be slugified for filename)"
      },
      type: {
        type: "string",
        enum: ["research", "command", "infrastructure", "client", "project", "pattern", "troubleshooting"],
        description: "Type of knowledge"
      },
      path: {
        type: "string",
        description: "Subdirectory path within type folder (e.g., 'docker' for commands/docker/)"
      },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "Tags for categorization"
      },
      related: {
        type: "array", 
        items: { type: "string" },
        description: "Wiki-link targets to related notes"
      },
      confidence: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description: "Confidence level (0.5 = learned from web, 0.9 = taught by human)"
      },
      source: {
        type: "string",
        description: "Where this came from (claude, adam, web:url)"
      }
    },
    required: ["content", "title", "type"]
  }
}
```

#### `palace_recall`
Search and retrieve knowledge from the palace.

```typescript
{
  name: "palace_recall",
  description: "Search the Obsidian palace for knowledge",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query (text or regex)"
      },
      type: {
        type: "string",
        enum: ["research", "command", "infrastructure", "client", "project", "pattern", "troubleshooting", "all"],
        description: "Filter by knowledge type"
      },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "Filter by tags (AND logic)"
      },
      path: {
        type: "string",
        description: "Filter by path prefix"
      },
      min_confidence: {
        type: "number",
        description: "Minimum confidence threshold"
      },
      limit: {
        type: "number",
        default: 10,
        description: "Maximum results to return"
      },
      include_content: {
        type: "boolean",
        default: true,
        description: "Include full content or just metadata"
      }
    },
    required: ["query"]
  }
}
```

#### `palace_read`
Read a specific note by path or title.

```typescript
{
  name: "palace_read",
  description: "Read a specific note from the palace",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Full path to note (relative to vault root)"
      },
      title: {
        type: "string",
        description: "Note title (will search for matching file)"
      }
    }
  }
}
```

#### `palace_update`
Update an existing note.

```typescript
{
  name: "palace_update",
  description: "Update an existing note in the palace",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to the note to update"
      },
      content: {
        type: "string",
        description: "New content (replaces existing)"
      },
      append: {
        type: "string",
        description: "Content to append (alternative to replace)"
      },
      frontmatter_updates: {
        type: "object",
        description: "Frontmatter fields to update"
      }
    },
    required: ["path"]
  }
}
```

### Structure Tools

#### `palace_list`
List notes in a directory.

```typescript
{
  name: "palace_list",
  description: "List notes in a palace directory",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Directory path to list (relative to vault root)"
      },
      recursive: {
        type: "boolean",
        default: false,
        description: "Include subdirectories"
      },
      include_metadata: {
        type: "boolean",
        default: false,
        description: "Include frontmatter in results"
      }
    }
  }
}
```

#### `palace_structure`
Get the palace directory structure.

```typescript
{
  name: "palace_structure",
  description: "Get the palace directory tree structure",
  inputSchema: {
    type: "object",
    properties: {
      depth: {
        type: "number",
        default: 3,
        description: "Maximum depth to traverse"
      },
      path: {
        type: "string",
        default: "",
        description: "Start from this subdirectory"
      }
    }
  }
}
```

### Graph Intelligence Tools

#### `palace_links`
Get link relationships for a note.

```typescript
{
  name: "palace_links",
  description: "Get backlinks and outgoing links for a note",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to the note"
      },
      direction: {
        type: "string",
        enum: ["incoming", "outgoing", "both"],
        default: "both"
      },
      depth: {
        type: "number",
        default: 1,
        description: "How many hops to follow (1 = direct links only)"
      }
    },
    required: ["path"]
  }
}
```

#### `palace_orphans`
Find orphan notes (no incoming or outgoing links).

```typescript
{
  name: "palace_orphans",
  description: "Find notes with no connections",
  inputSchema: {
    type: "object",
    properties: {
      type: {
        type: "string",
        enum: ["no_incoming", "no_outgoing", "isolated"],
        default: "isolated",
        description: "Type of orphan to find"
      },
      path: {
        type: "string",
        description: "Limit to this directory"
      }
    }
  }
}
```

#### `palace_related`
Find related notes based on tags, links, or content similarity.

```typescript
{
  name: "palace_related",
  description: "Find notes related to a given note",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to the source note"
      },
      method: {
        type: "string",
        enum: ["links", "tags", "content"],
        default: "links",
        description: "How to determine relatedness"
      },
      limit: {
        type: "number",
        default: 10
      }
    },
    required: ["path"]
  }
}
```

### Session Tools

#### `palace_session_start`
Start a research/work session (creates daily log entry).

```typescript
{
  name: "palace_session_start",
  description: "Start a work session - creates daily log entry",
  inputSchema: {
    type: "object",
    properties: {
      topic: {
        type: "string",
        description: "What this session is about"
      },
      context: {
        type: "string", 
        description: "Additional context (client, project, etc.)"
      }
    },
    required: ["topic"]
  }
}
```

#### `palace_session_log`
Log activity to the current session.

```typescript
{
  name: "palace_session_log",
  description: "Add an entry to today's session log",
  inputSchema: {
    type: "object",
    properties: {
      entry: {
        type: "string",
        description: "What happened / what was learned"
      },
      notes_created: {
        type: "array",
        items: { type: "string" },
        description: "Paths of notes created this session"
      }
    },
    required: ["entry"]
  }
}
```

### Auto-Linking Tools

#### `palace_autolink`
Scan vault and create wiki-links between notes.

```typescript
{
  name: "palace_autolink",
  description: "Scan vault and auto-create wiki-links between related notes",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Limit to this directory (optional, defaults to entire vault)"
      },
      dry_run: {
        type: "boolean",
        default: true,
        description: "Preview changes without applying them"
      },
      min_title_length: {
        type: "number",
        default: 3,
        description: "Minimum title length to match (avoids false positives)"
      },
      exclude_paths: {
        type: "array",
        items: { type: "string" },
        description: "Paths to exclude from linking"
      }
    }
  }
}
```

**Auto-linking behavior in `palace_remember` and `palace_update`:**
- When creating/updating a note, automatically scan content for existing note titles
- Convert plain text mentions to `[[wiki-links]]`
- Respect aliases defined in frontmatter
- Skip code blocks and existing links
- Update the `related` frontmatter field

### Dataview Integration Tools

#### `palace_dataview`
Execute Dataview queries against the vault.

```typescript
{
  name: "palace_dataview",
  description: "Execute a Dataview query against the vault",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Dataview query (DQL syntax)"
      },
      format: {
        type: "string",
        enum: ["table", "list", "task", "json"],
        default: "json",
        description: "Output format"
      }
    },
    required: ["query"]
  }
}
```

**Example Queries:**
```dataview
// Find all commands with low confidence
TABLE confidence, source FROM "commands" WHERE confidence < 0.7

// List recent research by tag
LIST FROM "research" WHERE contains(tags, "kubernetes") SORT modified DESC

// Find unverified knowledge
TABLE title, source, created FROM "" WHERE verified = false
```

#### `palace_query`
Simplified query interface using frontmatter properties.

```typescript
{
  name: "palace_query",
  description: "Query notes by frontmatter properties (simpler than Dataview)",
  inputSchema: {
    type: "object",
    properties: {
      type: {
        type: "string",
        description: "Filter by type (research, command, etc.)"
      },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "Filter by tags (AND logic)"
      },
      source: {
        type: "string",
        description: "Filter by source"
      },
      min_confidence: {
        type: "number",
        description: "Minimum confidence score"
      },
      verified: {
        type: "boolean",
        description: "Filter by verified status"
      },
      created_after: {
        type: "string",
        description: "ISO date string"
      },
      created_before: {
        type: "string",
        description: "ISO date string"
      },
      sort_by: {
        type: "string",
        enum: ["created", "modified", "confidence", "title"],
        default: "modified"
      },
      sort_order: {
        type: "string",
        enum: ["asc", "desc"],
        default: "desc"
      },
      limit: {
        type: "number",
        default: 20
      }
    }
  }
}
```

---

## Implementation Architecture

### Technology Stack
- **Language**: TypeScript (aligns with your MCP template preference)
- **Runtime**: Node.js
- **Transport**: stdio (for Claude Code) + HTTP/SSE (for web clients)
- **Index**: SQLite (for fast queries, like palace-service)
- **File Watching**: chokidar (for live vault changes)
- **Markdown Parsing**: gray-matter (frontmatter) + unified/remark (content)

### Core Components

```
src/
├── index.ts                    # Entry point
├── config/
│   └── index.ts               # Environment config
├── services/
│   ├── vault/
│   │   ├── reader.ts          # Read files from vault
│   │   ├── writer.ts          # Write files to vault
│   │   ├── watcher.ts         # File system watcher
│   │   └── index.ts
│   ├── index/
│   │   ├── sqlite.ts          # SQLite index management
│   │   ├── query.ts           # Query builder
│   │   └── index.ts
│   ├── graph/
│   │   ├── links.ts           # Wiki-link parser
│   │   ├── relationships.ts   # Graph traversal
│   │   └── index.ts
│   ├── autolink/
│   │   ├── scanner.ts         # Scan content for linkable terms
│   │   ├── linker.ts          # Insert wiki-links into content
│   │   ├── aliases.ts         # Handle note aliases
│   │   └── index.ts
│   └── dataview/
│       ├── parser.ts          # Parse DQL queries
│       ├── executor.ts        # Execute queries against index
│       ├── formatter.ts       # Format results (table/list/json)
│       └── index.ts
├── tools/
│   ├── remember.ts            # palace_remember (with auto-linking)
│   ├── recall.ts              # palace_recall
│   ├── read.ts                # palace_read
│   ├── update.ts              # palace_update (with auto-linking)
│   ├── list.ts                # palace_list
│   ├── structure.ts           # palace_structure
│   ├── links.ts               # palace_links
│   ├── orphans.ts             # palace_orphans
│   ├── related.ts             # palace_related
│   ├── autolink.ts            # palace_autolink
│   ├── dataview.ts            # palace_dataview
│   ├── query.ts               # palace_query
│   ├── session.ts             # palace_session_*
│   └── index.ts
├── utils/
│   ├── markdown.ts            # Markdown utilities
│   ├── slugify.ts             # Title to filename
│   ├── frontmatter.ts         # YAML handling
│   └── wikilinks.ts           # [[link]] parsing
└── types/
    └── index.ts               # Type definitions
```

### SQLite Index Schema

```sql
-- Notes table
CREATE TABLE notes (
    id INTEGER PRIMARY KEY,
    path TEXT UNIQUE NOT NULL,
    title TEXT,
    type TEXT,
    created TEXT,
    modified TEXT,
    source TEXT,
    confidence REAL,
    verified INTEGER,
    content TEXT,
    content_hash TEXT
);

-- Tags junction
CREATE TABLE note_tags (
    note_id INTEGER,
    tag TEXT,
    FOREIGN KEY (note_id) REFERENCES notes(id)
);

-- Links (wiki-links)
CREATE TABLE links (
    source_id INTEGER,
    target_path TEXT,
    FOREIGN KEY (source_id) REFERENCES notes(id)
);

-- Full-text search
CREATE VIRTUAL TABLE notes_fts USING fts5(
    title,
    content,
    content='notes',
    content_rowid='id'
);

-- Indexes
CREATE INDEX idx_notes_type ON notes(type);
CREATE INDEX idx_notes_path ON notes(path);
CREATE INDEX idx_note_tags_tag ON note_tags(tag);
CREATE INDEX idx_links_target ON links(target_path);
```

---

## Configuration

### Environment Variables

```bash
PALACE_VAULT_PATH="/path/to/obsidian/vault"
PALACE_INDEX_PATH="/path/to/index.sqlite"  # Optional, defaults to vault/.palace/index.sqlite
PALACE_WATCH_ENABLED="true"                 # Watch for external changes
PALACE_LOG_LEVEL="info"                     # debug, info, warn, error
```

### MCP Client Configuration

```json
{
  "mcpServers": {
    "obsidian-palace": {
      "command": "npx",
      "args": ["obsidian-palace-mcp"],
      "env": {
        "PALACE_VAULT_PATH": "/path/to/your/vault"
      }
    }
  }
}
```

---

## Usage Scenarios

### Scenario 1: Research Session

```
Human: "Let's research how to set up Frigate NVR with hardware acceleration"

Claude: [Uses palace_recall to check existing knowledge]
Claude: [Uses web_search to find current best practices]
Claude: [Uses palace_remember to store key findings in research/frigate/hardware-acceleration.md]
Claude: [Uses palace_session_log to record what was learned]
```

### Scenario 2: Command Documentation

```
Human: "That kubectl command we just figured out was useful, save it"

Claude: [Uses palace_remember to create commands/kubectl/drain-node-safely.md]
Claude: [Uses palace_links to find related kubectl notes]
Claude: [Uses palace_update to add reference in commands/kubectl/_overview.md]
```

### Scenario 3: Client Knowledge

```
Human: "We figured out Touch365 uses MySQL 5.7, document that"

Claude: [Uses palace_read to get clients/touch365/_overview.md]
Claude: [Uses palace_update to append to clients/touch365/systems.md]
Claude: [Updates confidence to 0.95 since human confirmed]
```

### Scenario 4: Finding Past Research

```
Human: "What do we know about setting up Tailscale for POS systems?"

Claude: [Uses palace_recall with query "tailscale POS"]
Claude: [Uses palace_related to find connected topics]
Claude: [Synthesizes response from found notes]
```

---

## Differences from Existing MCP Servers

| Feature | Existing Servers | Palace MCP |
|---------|------------------|------------|
| Purpose | General Obsidian access | AI memory store |
| AI Support | Often Claude-specific | Any MCP client |
| Structure | None enforced | Strict knowledge taxonomy |
| Frontmatter | Basic support | Full provenance tracking |
| Confidence | Not tracked | Per-fact confidence scores |
| Sessions | Not supported | Research session tracking |
| Auto-Linking | Manual or separate tool | Built into remember/update |
| Dataview | Not supported | Full DQL query support |
| Graph | Limited | Full backlink/orphan analysis |
| Index | In-memory or none | Persistent SQLite FTS5 |
| Designed for | Human-initiated ops | AI-initiated knowledge management |

---

## Next Steps

1. **Initialize Repository** - Set up TypeScript project with MCP SDK
2. **Core Services** - Vault reader/writer, SQLite index
3. **Basic Tools** - remember, recall, read, list
4. **Graph Tools** - links, orphans, related
5. **Session Tools** - session_start, session_log
6. **Testing** - Unit tests, integration tests with test vault
7. **Documentation** - README, CLAUDE.md for Claude Code

---

## Design Decisions (Finalized)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Vault Location | User-configurable | Public package, anyone's vault |
| AI Support | Any MCP client | Not Claude-specific |
| Auto-Linking | Built into remember/update | Seamless knowledge graph building |
| Dataview | Full DQL support | Power users expect this |
| Repository | Public GitHub | Community contributions welcome |

---

## Project Initialization

### Repository Setup

**Name:** `obsidian-palace-mcp`
**Package:** `@probablycomputers/obsidian-palace-mcp`

```bash
# Create repository
mkdir obsidian-palace-mcp
cd obsidian-palace-mcp
git init

# Initialize npm package
npm init -y

# Install core dependencies
npm install @modelcontextprotocol/sdk zod gray-matter chokidar better-sqlite3
npm install -D typescript @types/node @types/better-sqlite3 tsx vitest

# Create structure
mkdir -p src/{config,services/{vault,index,graph,autolink,dataview},tools,utils,types}
mkdir -p tests/{unit,integration}
mkdir -p docs
```

### package.json

```json
{
  "name": "@probablycomputers/obsidian-palace-mcp",
  "version": "0.1.0",
  "description": "MCP server for using Obsidian as an AI memory palace",
  "main": "dist/index.js",
  "bin": {
    "obsidian-palace-mcp": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "test": "vitest",
    "lint": "eslint src/",
    "prepublishOnly": "npm run build"
  },
  "keywords": [
    "mcp",
    "obsidian",
    "ai",
    "memory",
    "knowledge-base",
    "model-context-protocol"
  ],
  "author": "Probably Computers",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/probablycomputers/obsidian-palace-mcp"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

### CLAUDE.md (For Claude Code)

```markdown
# Obsidian Palace MCP Server

## Project Overview

This is an MCP server that enables AI assistants to use Obsidian as a persistent 
memory store. It provides tools for storing, retrieving, and querying knowledge
with automatic wiki-linking and Dataview integration.

## Architecture

- **Transport**: stdio (primary) + HTTP/SSE (optional)
- **Index**: SQLite with FTS5 for full-text search
- **File Format**: Markdown with YAML frontmatter
- **Auto-linking**: Scans content for existing note titles, creates [[wiki-links]]

## Key Design Principles

1. **Modular files** - Each source file under 200 lines
2. **Single responsibility** - One tool per file
3. **Type safety** - Full TypeScript with Zod validation
4. **Test coverage** - Unit tests for all services

## File Structure

See src/ for implementation. Key areas:
- services/vault/ - File system operations
- services/index/ - SQLite index management
- services/autolink/ - Wiki-link generation
- services/dataview/ - DQL query execution
- tools/ - MCP tool implementations

## Development Commands

\`\`\`bash
npm run dev      # Run with hot reload
npm run build    # Compile TypeScript
npm run test     # Run tests
\`\`\`

## Environment Variables

- PALACE_VAULT_PATH - Path to Obsidian vault (required)
- PALACE_LOG_LEVEL - debug, info, warn, error (default: info)
```

### README.md

```markdown
# Obsidian Palace MCP

An MCP server that turns your Obsidian vault into an AI memory palace.

## Features

- 🧠 **Knowledge-first design** - Purpose-built for AI memory, not just file access
- 🔗 **Auto-linking** - Automatically creates wiki-links between related notes
- 📊 **Dataview integration** - Query your vault using DQL syntax
- 📍 **Provenance tracking** - Know where every piece of knowledge came from
- 🤖 **AI-agnostic** - Works with Claude, ChatGPT, or any MCP-compatible client

## Installation

\`\`\`bash
npm install -g @probablycomputers/obsidian-palace-mcp
\`\`\`

## Configuration

Add to your MCP client config:

\`\`\`json
{
  "mcpServers": {
    "obsidian-palace": {
      "command": "npx",
      "args": ["@probablycomputers/obsidian-palace-mcp"],
      "env": {
        "PALACE_VAULT_PATH": "/path/to/your/vault"
      }
    }
  }
}
\`\`\`

## Tools

| Tool | Description |
|------|-------------|
| palace_remember | Store new knowledge with auto-linking |
| palace_recall | Search the vault |
| palace_read | Read a specific note |
| palace_update | Update a note with auto-linking |
| palace_links | Get backlinks and outgoing links |
| palace_dataview | Execute Dataview queries |
| palace_query | Simple property-based queries |

## Note Format

Notes use YAML frontmatter for metadata:

\`\`\`yaml
---
type: research
created: 2025-12-05T14:30:00Z
source: claude
confidence: 0.85
verified: false
tags: [kubernetes, networking]
---
\`\`\`

## License

MIT
```

---

## Development Phases

### Phase 1: Foundation
- [ ] Project setup (package.json, tsconfig, etc.)
- [ ] Config service with Zod validation
- [ ] Vault reader/writer services
- [ ] Basic MCP server with stdio transport

### Phase 2: Core Tools
- [ ] palace_remember (basic, no auto-link)
- [ ] palace_read
- [ ] palace_recall (basic text search)
- [ ] palace_list
- [ ] palace_structure

### Phase 3: Index & Search
- [ ] SQLite index with FTS5
- [ ] File watcher for external changes
- [ ] Enhanced palace_recall with filters
- [ ] palace_query

### Phase 4: Graph Intelligence
- [ ] Wiki-link parser
- [ ] palace_links
- [ ] palace_orphans
- [ ] palace_related

### Phase 5: Auto-Linking
- [ ] Autolink service (scanner, linker)
- [ ] Integrate into palace_remember
- [ ] Integrate into palace_update
- [ ] palace_autolink (vault-wide)

### Phase 6: Dataview
- [ ] DQL parser
- [ ] Query executor
- [ ] palace_dataview tool
- [ ] Result formatters

### Phase 7: Polish
- [ ] Session tools
- [ ] HTTP/SSE transport option
- [ ] Comprehensive tests
- [ ] Documentation
- [ ] npm publish
