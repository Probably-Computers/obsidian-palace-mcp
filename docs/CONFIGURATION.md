# Palace MCP Configuration Guide

This guide covers all configuration options for Obsidian Palace MCP.

## Configuration Layers

Palace uses a layered configuration system:

1. **Environment Variables** - Quick setup, overrides defaults
2. **Global Config** (`~/.config/palace/config.yaml`) - Multi-vault setup
3. **Vault Config** (`.palace.yaml` in vault root) - Per-vault customization

## Quick Start

### Single Vault (Environment Variables)

```bash
export PALACE_VAULT_PATH="/path/to/vault"
export PALACE_LOG_LEVEL="info"
```

### Multi-Vault (Quick Setup)

```bash
export PALACE_VAULTS="/path/to/work:work:rw,/path/to/personal:personal:rw"
export PALACE_DEFAULT_VAULT="work"
```

Format: `path:alias:mode,path:alias:mode,...`

### Multi-Vault (Config File)

```bash
export PALACE_CONFIG_PATH="~/.config/palace/config.yaml"
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PALACE_VAULT_PATH` | Yes* | - | Single vault path |
| `PALACE_VAULTS` | No | - | Multi-vault quick setup |
| `PALACE_CONFIG_PATH` | No | `~/.config/palace/config.yaml` | Global config location |
| `PALACE_DEFAULT_VAULT` | No | First vault | Default vault alias |
| `PALACE_INDEX_PATH` | No | `{vault}/.palace/index.sqlite` | SQLite index location |
| `PALACE_LOG_LEVEL` | No | `info` | Logging level |
| `PALACE_WATCH_ENABLED` | No | `true` | File system watching |
| `HTTP_ENABLED` | No | `false` | Enable HTTP transport |
| `HTTP_PORT` | No | `3000` | HTTP server port |
| `HTTP_CORS_ORIGIN` | No | `*` | CORS allowed origins |

*Required unless `PALACE_VAULTS` or `PALACE_CONFIG_PATH` is set.

### Log Levels

| Level | Description |
|-------|-------------|
| `debug` | Verbose debugging information |
| `info` | General operational information |
| `warn` | Warning messages |
| `error` | Error messages only |

---

## Global Configuration

Location: `~/.config/palace/config.yaml`

### Complete Example

```yaml
# Palace Global Configuration
version: 1

# Registered vaults
vaults:
  - path: "/Users/adam/Documents/Work Palace"
    alias: work
    mode: rw
    default: true
    description: "Work-related knowledge"

  - path: "/Users/adam/Documents/Personal Palace"
    alias: personal
    mode: rw
    description: "Personal knowledge base"

  - path: "/Users/adam/Documents/Vendor Docs"
    alias: vendor
    mode: ro
    description: "Read-only vendor documentation"

  - path: "/Users/adam/Documents/Clients/Xlink"
    alias: xlink
    mode: rw
    context:
      client: xlink
      type: client_vault

# Cross-vault behavior
cross_vault:
  search: true                       # Allow searching multiple vaults
  standards_source: work             # Load standards from this vault

# Runtime settings
settings:
  log_level: info
  watch_enabled: true
  auto_index: true
```

### Schema Reference

```typescript
interface GlobalConfig {
  version: number;                   // Config schema version (currently 1)

  vaults: Array<{
    path: string;                    // Absolute path to vault
    alias: string;                   // Short name for reference
    mode: 'rw' | 'ro';              // Read-write or read-only
    default?: boolean;               // Is this the default vault?
    description?: string;            // Human-readable description
    context?: {                      // Optional vault context
      client?: string;
      project?: string;
      type?: 'personal' | 'work' | 'client_vault' | 'reference';
    };
  }>;

  cross_vault?: {
    search?: boolean;                // Search across vaults (default: true)
    standards_source?: string;       // Vault alias for standards
  };

  settings?: {
    log_level?: 'debug' | 'info' | 'warn' | 'error';
    watch_enabled?: boolean;
    auto_index?: boolean;
  };
}
```

### Vault Modes

| Mode | Description |
|------|-------------|
| `rw` | Read-write: Full access |
| `ro` | Read-only: Search and read only, no modifications |

---

## Per-Vault Configuration

Location: `{vault}/.palace.yaml`

### Complete Example

```yaml
# Vault Configuration
vault:
  name: work-knowledge
  description: "Work-related knowledge and projects"

# Knowledge layer path mapping
structure:
  # Layer 1: Technical Knowledge
  technology:
    path: "technologies/{domain}/"
    hub_file: "_index.md"

  command:
    path: "commands/{domain}/"
    hub_file: "_index.md"

  reference:
    path: "reference/{domain}/"

  # Layer 2: Domain Knowledge
  standard:
    path: "standards/{domain}/"
    ai_binding: required

  pattern:
    path: "patterns/{domain}/"

  research:
    path: "research/{domain}/"

  # Layer 3: Contextual Knowledge
  project:
    path: "projects/{project}/"
    subpaths:
      decision: "decisions/"
      configuration: "configurations/"
      artifact: "artifacts/"
      note: "notes/"

  client:
    path: "clients/{client}/"

  product:
    path: "products/{product}/"
    subpaths:
      decision: "decisions/"
      artifact: "artifacts/"

  # Other types
  troubleshooting:
    path: "troubleshooting/{domain}/"

  note:
    path: "notes/"

# Session logs
sessions:
  path: "daily/"
  format: "{YYYY-MM-DD}.md"

# Ignore rules
ignore:
  patterns:
    - ".obsidian/"
    - "templates/"
    - "private/**"
    - "*.private.md"
    - "archive/**"
  marker_file: ".palace-ignore"
  frontmatter_key: "palace_ignore"

# Atomic note settings
atomic:
  max_lines: 200
  max_sections: 6
  section_max_lines: 50
  hub_max_lines: 150
  hub_filename: "_index.md"
  auto_split: true

# Stub behavior
stubs:
  auto_create: true
  min_confidence: 0.2
  template: "_templates/stub.md"

# Graph integrity
graph:
  require_technology_links: true
  warn_orphan_depth: 1
  retroactive_linking: true

# Templates
templates:
  technology_hub: "_templates/technology-hub.md"
  concept: "_templates/concept.md"
  command: "_templates/command.md"
  decision: "_templates/decision.md"
  standard: "_templates/standard.md"
```

### Structure Mapping

The `structure` section maps knowledge types to vault paths:

```yaml
structure:
  {knowledge_type}:
    path: "path/with/{variables}/"
    hub_file: "_index.md"           # Optional: hub filename
    ai_binding: required            # Optional: for standards
    subpaths:                       # Optional: nested paths
      {subtype}: "subpath/"
```

**Path Variables:**

| Variable | Description | Example |
|----------|-------------|---------|
| `{domain}` | Domain hierarchy | `kubernetes/networking` |
| `{project}` | Project name | `xlink` |
| `{client}` | Client name | `touch365` |
| `{product}` | Product name | `security-robot` |

**Example Resolution:**

```javascript
// Intent:
{
  knowledge_type: "command",
  domain: ["docker", "networking"],
  scope: "general"
}

// With structure:
structure:
  command:
    path: "commands/{domain}/"

// Resolves to: commands/docker/networking/
```

### Ignore Configuration

Three layers of ignore rules:

#### 1. Pattern-based (glob patterns)

```yaml
ignore:
  patterns:
    - ".obsidian/"        # Obsidian config
    - "templates/"        # Template files
    - "private/**"        # Everything in private/
    - "*.private.md"      # Files ending in .private.md
    - "archive/**"        # Archived content
```

#### 2. Marker file

```yaml
ignore:
  marker_file: ".palace-ignore"
```

Create an empty `.palace-ignore` file in any directory to ignore it.

#### 3. Frontmatter key

```yaml
ignore:
  frontmatter_key: "palace_ignore"
```

Add to any note's frontmatter:

```yaml
---
palace_ignore: true
---
```

### Atomic Note Settings

Control automatic note splitting:

```yaml
atomic:
  max_lines: 200          # Max lines per atomic note
  max_sections: 6         # Max H2 sections per note
  section_max_lines: 50   # Max lines per section
  hub_max_lines: 150      # Max lines for hub notes
  hub_filename: "_index.md"
  auto_split: true        # Enable auto-splitting
```

When content exceeds limits, Palace automatically:
1. Creates a hub note with navigation
2. Splits content into child atomic notes
3. Links everything together

### Stub Settings

Control automatic stub creation:

```yaml
stubs:
  auto_create: true       # Create stubs for unknown technologies
  min_confidence: 0.2     # Minimum confidence for stub
  template: "_templates/stub.md"  # Optional template
```

### Graph Settings

Control graph integrity:

```yaml
graph:
  require_technology_links: true  # Warn if no tech links
  warn_orphan_depth: 1            # Warn if note has no connections
  retroactive_linking: true       # Update old notes with new links
```

---

## Example Configurations

### Single Developer (Personal)

**Environment:**
```bash
export PALACE_VAULT_PATH="/Users/me/Obsidian/Knowledge"
```

**.palace.yaml:**
```yaml
vault:
  name: personal-knowledge

structure:
  technology:
    path: "tech/{domain}/"
  command:
    path: "commands/{domain}/"
  note:
    path: "notes/"

ignore:
  patterns:
    - ".obsidian/"
    - "templates/"

atomic:
  auto_split: true
```

### Work + Personal (Multi-Vault)

**config.yaml:**
```yaml
version: 1

vaults:
  - path: "/Users/me/Work Palace"
    alias: work
    mode: rw
    default: true

  - path: "/Users/me/Personal Palace"
    alias: personal
    mode: rw

cross_vault:
  search: true
```

### Team with Vendor Docs

**config.yaml:**
```yaml
version: 1

vaults:
  - path: "/shared/team-knowledge"
    alias: team
    mode: rw
    default: true

  - path: "/shared/vendor-docs"
    alias: vendor
    mode: ro
    description: "Read-only vendor documentation"

cross_vault:
  search: true
  standards_source: team
```

### Client Project Structure

**config.yaml:**
```yaml
version: 1

vaults:
  - path: "/work/knowledge"
    alias: work
    mode: rw
    default: true

  - path: "/work/clients/acme"
    alias: acme
    mode: rw
    context:
      client: acme
      type: client_vault

  - path: "/work/clients/bigcorp"
    alias: bigcorp
    mode: rw
    context:
      client: bigcorp
      type: client_vault
```

---

## MCP Client Configuration

### Claude Desktop

```json
{
  "mcpServers": {
    "obsidian-palace": {
      "command": "npx",
      "args": ["obsidian-palace-mcp"],
      "env": {
        "PALACE_CONFIG_PATH": "/Users/me/.config/palace/config.yaml"
      }
    }
  }
}
```

### Claude Code

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

### Development Setup

Use direnv for development:

**.envrc:**
```bash
export PALACE_VAULT_PATH="/path/to/test-vault"
export PALACE_LOG_LEVEL="debug"
```

Run `direnv allow` to activate.

---

## Troubleshooting

### Common Issues

**Vault not found:**
- Check path is absolute
- Verify path exists
- Check permissions

**Read-only error:**
- Check vault mode is `rw`
- Verify file system permissions

**Index errors:**
- Delete `.palace/index.sqlite` to rebuild
- Check disk space

**Config not loading:**
- Verify YAML syntax
- Check file permissions
- Use `PALACE_LOG_LEVEL=debug` for details

### Validating Configuration

Run with debug logging to see config resolution:

```bash
PALACE_LOG_LEVEL=debug npx obsidian-palace-mcp
```

Check the logs for:
- Vault registration
- Config file loading
- Structure mapping
