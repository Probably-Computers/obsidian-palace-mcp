# Obsidian Palace MCP

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)

An MCP server that turns your Obsidian vault into an AI memory palace.

## What is this?

**Obsidian Palace MCP** enables AI assistants (Claude, ChatGPT, or any MCP-compatible client) to use your Obsidian vault as a persistent memory store. The AI can:

- **Store knowledge** using intent-based storage (AI says WHAT, Palace decides WHERE)
- **Retrieve information** using full-text search or structured queries
- **Auto-link notes** by detecting mentions of existing note titles
- **Check before storing** to prevent duplicates and expand existing knowledge
- **Query with Dataview** using familiar DQL syntax
- **Follow standards** defined in your vault
- **Track provenance** - know where every piece of knowledge came from

## v2.0 Features

| Feature | Description |
|---------|-------------|
| 🧠 **Intent-Based Storage** | AI expresses intent; Palace resolves location |
| 📚 **Multi-Vault Support** | Multiple vaults with read/write access control |
| ⚛️ **Atomic Notes** | Auto-splitting large content into hub + children |
| 📋 **Standards System** | AI follows user-defined binding standards |
| 🔗 **Auto-Linking** | Automatically creates `[[wiki-links]]` between related notes |
| 📊 **Dataview Queries** | Query your vault using DQL syntax |
| 📍 **Provenance** | Track source, confidence, and verification status |
| 🤖 **AI-Agnostic** | Works with any MCP-compatible client |
| ⚡ **Fast Search** | SQLite FTS5 full-text search index |
| 👁️ **Live Sync** | Watches for external changes to your vault |
| ❓ **Context Clarification** | AI asks for missing context before storing |

## Installation

```bash
npm install -g obsidian-palace-mcp
```

Or use directly with npx:

```bash
npx obsidian-palace-mcp
```

## Quick Start

### 1. Configure Claude Desktop / Claude Code

Add to your MCP client configuration:

**Single Vault:**
```json
{
  "mcpServers": {
    "obsidian-palace": {
      "command": "npx",
      "args": ["obsidian-palace-mcp"],
      "env": {
        "PALACE_VAULT_PATH": "/path/to/your/obsidian/vault"
      }
    }
  }
}
```

**Multi-Vault (Quick Setup):**
```json
{
  "mcpServers": {
    "obsidian-palace": {
      "command": "npx",
      "args": ["obsidian-palace-mcp"],
      "env": {
        "PALACE_VAULTS": "/path/to/work:work:rw,/path/to/personal:personal:rw",
        "PALACE_DEFAULT_VAULT": "work"
      }
    }
  }
}
```

**Multi-Vault (Config File):**
```json
{
  "mcpServers": {
    "obsidian-palace": {
      "command": "npx",
      "args": ["obsidian-palace-mcp"],
      "env": {
        "PALACE_CONFIG_PATH": "~/.config/palace/config.yaml"
      }
    }
  }
}
```

### 2. Create a Vault Config (Optional)

Create `.palace.yaml` in your vault root for custom structure mapping:

```yaml
vault:
  name: my-knowledge
  description: "My knowledge base"

structure:
  technology:
    path: "technologies/{domain}/"
  command:
    path: "commands/{domain}/"
  project:
    path: "projects/{project}/"
```

See [Configuration Guide](docs/CONFIGURATION.md) for full options.

## Tools

### Core Tools

| Tool | Description |
|------|-------------|
| `palace_store` | Store knowledge with intent-based resolution |
| `palace_check` | Check for existing knowledge before storing |
| `palace_read` | Read a specific note |
| `palace_improve` | Update existing notes intelligently |
| `palace_recall` | Search the vault for information |

### Structure & Navigation

| Tool | Description |
|------|-------------|
| `palace_list` | List notes in a directory |
| `palace_structure` | Get vault directory tree |
| `palace_vaults` | List configured vaults |

### Graph Intelligence

| Tool | Description |
|------|-------------|
| `palace_links` | Get backlinks and outgoing links |
| `palace_orphans` | Find notes with no connections |
| `palace_related` | Find related notes |
| `palace_autolink` | Scan vault and create wiki-links |

### Queries

| Tool | Description |
|------|-------------|
| `palace_dataview` | Execute Dataview (DQL) queries |
| `palace_query` | Property-based queries |

### Standards & AI Support

| Tool | Description |
|------|-------------|
| `palace_standards` | Load binding standards for AI |
| `palace_standards_validate` | Validate notes against standards |
| `palace_clarify` | Generate clarifying questions for incomplete context |

### Sessions

| Tool | Description |
|------|-------------|
| `palace_session_start` | Start a research session |
| `palace_session_log` | Log activity to current session |

### Legacy (Deprecated)

| Tool | Replacement | Description |
|------|-------------|-------------|
| `palace_remember` | `palace_store` | Create notes (path-based) |
| `palace_update` | `palace_improve` | Update notes |

## Knowledge Organization

### Knowledge Layers

Palace organizes knowledge into three layers:

**Layer 1: Technical** (never project-specific)
- `technologies/` - Technology documentation
- `commands/` - CLI commands and scripts
- `reference/` - Quick references

**Layer 2: Domain** (reusable knowledge)
- `standards/` - Standards and conventions
- `patterns/` - Reusable patterns
- `research/` - Research findings

**Layer 3: Contextual** (project/client specific)
- `projects/` - Project decisions and configs
- `clients/` - Client-specific knowledge

### Intent-Based Storage

AI expresses WHAT to store; Palace determines WHERE:

```javascript
palace_store({
  title: "Docker Bridge Networking",
  content: "...",
  intent: {
    knowledge_type: "command",
    domain: ["docker", "networking"],
    scope: "general"
  }
})
// Resolves to: commands/docker/networking/docker-bridge-networking.md
```

### Atomic Notes

Large content is automatically split into hub + atomic notes:
- Max 200 lines per atomic note
- Max 6 H2 sections per note
- Hub notes (`_index.md`) provide navigation

## Note Format

Notes use YAML frontmatter for metadata:

```yaml
---
type: technology
status: active
domain: [kubernetes, networking]
source:
  origin: ai:research
  confidence: 0.8
  verified: false
tags: [kubernetes, networking]
created: 2025-12-05T14:30:00Z
modified: 2025-12-05T14:30:00Z
---

# Kubernetes Networking

Content here...
```

### Knowledge Types

| Type | Layer | Purpose |
|------|-------|---------|
| `technology` | 1 | Technology documentation |
| `command` | 1 | CLI commands and snippets |
| `reference` | 1 | Quick reference material |
| `standard` | 2 | Standards and conventions |
| `pattern` | 2 | Reusable patterns |
| `research` | 2 | Research findings |
| `decision` | 3 | Project decisions |
| `configuration` | 3 | Project-specific configs |
| `troubleshooting` | 1-2 | Problems and solutions |
| `note` | varies | General notes |

## Example Usage

### Storing Knowledge (v2.0 way)

```
AI: "I'll document this Docker networking command."

[Uses palace_check to verify no existing note]
[Uses palace_store with:
  - knowledge_type: "command"
  - domain: ["docker", "networking"]
  - scope: "general"
  - technologies: ["docker"]
]
```

### Finding Information

```
User: "What do we know about setting up Tailscale?"

AI: [Uses palace_recall with query: "tailscale setup"]
    [Uses palace_related to find connected topics]
    "Based on your notes, here's what we have..."
```

### Following Standards

```
AI starts session:
[Uses palace_standards({ binding: 'required' })]
[Acknowledges standards before proceeding]

User: "Help me with a git commit"
AI: [Follows git workflow standard from vault]
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PALACE_VAULT_PATH` | Yes* | - | Single vault path |
| `PALACE_VAULTS` | No | - | Multi-vault: `path:alias:mode,...` |
| `PALACE_CONFIG_PATH` | No | `~/.config/palace/config.yaml` | Global config |
| `PALACE_DEFAULT_VAULT` | No | First vault | Default vault alias |
| `PALACE_LOG_LEVEL` | No | `info` | debug, info, warn, error |
| `PALACE_WATCH_ENABLED` | No | `true` | Watch for file changes |

*Required unless `PALACE_VAULTS` or `PALACE_CONFIG_PATH` is set.

## Documentation

- [API Reference](docs/API.md) - Complete tool documentation
- [Configuration Guide](docs/CONFIGURATION.md) - All configuration options
- [AI Behavior Guide](docs/AI-BEHAVIOR.md) - Protocols for AI assistants
- [Changelog](docs/CHANGELOG.md) - Version history

## Development

```bash
# Clone the repository
git clone https://gitlab.com/AdamClaassens/obsidian-palace-mcp.git
cd obsidian-palace-mcp

# Install dependencies
npm install

# Run in development mode
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Merge Request

See [CONTRIBUTING.md](docs/CONTRIBUTING.md) for detailed guidelines.

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Credits

Built by [Probably Computers](https://probablycomputers.co.za)

Inspired by the Luci project's Memory Palace concept.
