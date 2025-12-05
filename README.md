# Obsidian Palace MCP

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)

An MCP server that turns your Obsidian vault into an AI memory palace.

## What is this?

**Obsidian Palace MCP** enables AI assistants (Claude, ChatGPT, or any MCP-compatible client) to use your Obsidian vault as a persistent memory store. The AI can:

- **Store knowledge** from research sessions with proper categorization
- **Retrieve information** using full-text search or structured queries
- **Auto-link notes** by detecting mentions of existing note titles
- **Query with Dataview** using familiar DQL syntax
- **Track provenance** - know where every piece of knowledge came from

## Features

| Feature | Description |
|---------|-------------|
| 🧠 **Knowledge-first** | Purpose-built for AI memory, not just file access |
| 🔗 **Auto-linking** | Automatically creates `[[wiki-links]]` between related notes |
| 📊 **Dataview queries** | Query your vault using DQL syntax |
| 📍 **Provenance** | Track source, confidence, and verification status |
| 🤖 **AI-agnostic** | Works with any MCP-compatible client |
| ⚡ **Fast search** | SQLite FTS5 full-text search index |
| 👁️ **Live sync** | Watches for external changes to your vault |

## Installation

```bash
npm install -g obsidian-palace-mcp
```

Or use directly with npx:

```bash
npx obsidian-palace-mcp
```

## Configuration

### Claude Desktop / Claude Code

Add to your MCP client configuration:

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

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PALACE_VAULT_PATH` | Yes | - | Path to your Obsidian vault |
| `PALACE_LOG_LEVEL` | No | `info` | Logging level (debug, info, warn, error) |
| `PALACE_WATCH_ENABLED` | No | `true` | Watch for external file changes |

## Tools

### Knowledge Management

| Tool | Description |
|------|-------------|
| `palace_remember` | Store new knowledge with auto-linking |
| `palace_recall` | Search the vault for information |
| `palace_read` | Read a specific note |
| `palace_update` | Update a note with auto-linking |

### Structure & Navigation

| Tool | Description |
|------|-------------|
| `palace_list` | List notes in a directory |
| `palace_structure` | Get vault directory tree |

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
| `palace_query` | Simple property-based queries |

### Sessions

| Tool | Description |
|------|-------------|
| `palace_session_start` | Start a research session |
| `palace_session_log` | Log activity to current session |

## Note Format

Notes use YAML frontmatter for metadata:

```yaml
---
type: research
created: 2025-12-05T14:30:00Z
modified: 2025-12-05T14:30:00Z
source: claude
confidence: 0.85
verified: false
tags: [kubernetes, networking]
related: ["[[Docker Commands]]", "[[K8s Troubleshooting]]"]
aliases: [k8s-networking]
---

# Kubernetes Networking

Content here...
```

### Knowledge Types

| Type | Purpose |
|------|---------|
| `research` | Research findings and notes |
| `command` | CLI commands and snippets |
| `infrastructure` | Systems and services documentation |
| `client` | Client-specific knowledge |
| `project` | Project documentation |
| `pattern` | Reusable patterns |
| `troubleshooting` | Problems and solutions |

## Vault Structure

The server works with any vault structure, but recommends:

```
vault/
├── research/           # Research findings
├── commands/           # CLI commands by technology
├── infrastructure/     # Systems documentation
├── clients/            # Client-specific knowledge
├── projects/           # Project documentation
├── patterns/           # Reusable patterns
├── troubleshooting/    # Problems and solutions
└── daily/              # Session logs
```

## Example Usage

### Storing Knowledge

```
AI: "I'll save this kubectl command for draining nodes safely."

[Uses palace_remember with:
  - type: "command"
  - path: "kubectl"
  - title: "Drain Node Safely"
  - content: "..."
  - tags: ["kubernetes", "maintenance"]
]
```

### Finding Information

```
User: "What do we know about setting up Tailscale?"

AI: [Uses palace_recall with query: "tailscale setup"]
    [Uses palace_related to find connected topics]
    "Based on your notes, here's what we have..."
```

### Dataview Queries

```
User: "Show me all unverified commands"

AI: [Uses palace_dataview with:
  query: "TABLE confidence, source FROM \"commands\" WHERE verified = false"
]
```

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

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Credits

Built by [Probably Computers](https://probablycomputers.co.za)

Inspired by the Luci project's Memory Palace concept.
