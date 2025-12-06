# Obsidian Palace MCP v2.0 - Engineering Specification

**Version:** 2.0.0-draft
**Date:** 2025-12-06
**Status:** Specification Complete, Ready for Engineering
**Repository:** https://gitlab.com/AdamClaassens/obsidian-palace-mcp

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Core Philosophy](#2-core-philosophy)
3. [Design Principles](#3-design-principles)
4. [Architecture Overview](#4-architecture-overview)
5. [Knowledge Layer Model](#5-knowledge-layer-model)
6. [Atomic Note Architecture](#6-atomic-note-architecture)
7. [Multi-Vault System](#7-multi-vault-system)
8. [Tool Specifications](#8-tool-specifications)
9. [Data Structures](#9-data-structures)
10. [Configuration Schema](#10-configuration-schema)
11. [AI Behavior Protocols](#11-ai-behavior-protocols)
12. [Implementation Phases](#12-implementation-phases)
13. [Migration from v1.0](#13-migration-from-v10)
14. [Appendices](#14-appendices)

---

## 1. Executive Summary

### 1.1 Purpose

Obsidian Palace MCP is a Model Context Protocol server that enables AI assistants to use Obsidian vaults as collaborative knowledge stores. The system acts as a "Memory Palace" where both humans and AI can contribute, organize, and retrieve knowledge.

### 1.2 Key Goals

1. **Collaborative Knowledge Building** - AI and humans co-create a growing knowledge base
2. **AI-Agnostic** - Works with any MCP-compatible client (Claude, ChatGPT, etc.)
3. **Always Learning** - When active, AI continuously captures knowledge
4. **Graph Integrity** - Knowledge is interconnected, never orphaned
5. **Atomic Organization** - One concept per file, scalable structure
6. **Standards Enforcement** - AI follows user-defined standards and conventions

### 1.3 What's New in v2.0

| Feature | v1.0 | v2.0 |
|---------|------|------|
| Storage Model | Path-based | Intent-based with automatic resolution |
| Vault Support | Single | Multi-vault with access control |
| Note Structure | Flat files | Atomic notes with hub pattern |
| Knowledge Organization | Type-based folders | Three-layer knowledge model |
| Graph Management | Passive | Active integrity enforcement |
| Standards | None | Binding standards system |
| Stubs | None | Stub-and-expand pattern |
| AI Behavior | Store on request | Always learning with check-first |

---

## 2. Core Philosophy

### 2.1 The Memory Palace Concept

The vault is not just file storage—it's a living knowledge graph that grows more intelligent over time. Every interaction with AI should potentially contribute to this collective intelligence.

### 2.2 Separation of Concerns

```
┌─────────────────────────────────────────────────────────────┐
│  AI (Claude, ChatGPT, etc.)                                 │
│  - Expresses INTENT (what to store, why)                    │
│  - Ensures GRAPH INTEGRITY (connections exist)              │
│  - Follows STANDARDS (loaded from vault)                    │
├─────────────────────────────────────────────────────────────┤
│  Palace MCP Server                                          │
│  - Resolves LOCATION (where to store based on config)       │
│  - Enforces STRUCTURE (atomic notes, hubs)                  │
│  - Maintains INDEX (search, queries)                        │
│  - Manages VAULTS (multi-vault, access control)             │
├─────────────────────────────────────────────────────────────┤
│  Obsidian Vault(s)                                          │
│  - Stores KNOWLEDGE (markdown files)                        │
│  - Human READABLE and EDITABLE                              │
│  - Version controlled via Git/Sync                          │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 Knowledge Belongs at the Right Level

Technical knowledge is NEVER trapped in project-specific locations. Projects REFERENCE general knowledge, they don't duplicate it.

```
WRONG:
projects/xlink/kubernetes-pods.md  ← Knowledge trapped in project

RIGHT:
technologies/kubernetes/concepts/pods.md  ← General knowledge
projects/xlink/infrastructure.md          ← References [[kubernetes/concepts/pods]]
```

---

## 3. Design Principles

### 3.1 Intent-Based Storage

**Decision:** AI expresses what it's storing and why; MCP determines where.

**Rationale:**
- AI doesn't need to know vault structure
- Structure can change without breaking AI
- Consistent organization regardless of AI used
- Prevents AI "creativity" in file placement

**Implementation:**
```typescript
// AI says WHAT, not WHERE
palace_store({
  title: "Docker Bridge Networking",
  content: "...",
  intent: {
    knowledge_type: "command",
    domain: ["docker", "networking"],
    scope: "general"
  }
})

// MCP resolves to: commands/docker/networking/docker-bridge-networking.md
```

### 3.2 Always Learning Model

**Decision:** When MCP is active, AI always saves knowledge to the vault.

**Rationale:**
- Knowledge compounds over time
- Users expect AI to remember
- Vault grows like a child learning
- No knowledge is lost

**Implementation:**
- Every research action → Store findings
- Every command explained → Document it
- Every decision made → Log it
- Every problem solved → Create troubleshooting note

### 3.3 Check-Before-Store Pattern

**Decision:** AI must check for existing knowledge before creating new notes.

**Rationale:**
- Prevents duplicate information
- Enables expansion of existing notes
- Maintains single source of truth
- Improves knowledge quality over time

**Implementation:**
```
User asks question
    ↓
AI calls palace_check()
    ↓
┌─ Exists? ─────────────────────────────┐
│                                        │
│  YES → Read existing                   │
│        Answer from knowledge           │
│        Optionally improve note         │
│                                        │
│  STUB → Expand the stub               │
│         Add comprehensive content      │
│                                        │
│  NO → Research/answer                  │
│       Create new note                  │
│       Create stubs for mentioned tech  │
└────────────────────────────────────────┘
```

### 3.4 Graph Integrity Enforcement

**Decision:** AI must ensure all stored knowledge has proper connections.

**Rationale:**
- Orphaned notes are lost notes
- Connections enable discovery
- Graph structure adds value
- Retroactive linking improves old content

**Implementation:**
- AI must specify technologies used → Links created
- Missing connections → AI asks for clarification
- Stubs created for mentioned but unknown concepts
- Retroactive linking when stubs expand

### 3.5 Atomic Note Architecture

**Decision:** One concept per file, maximum 200 lines, hub pattern for organization.

**Rationale:**
- Large files are unmanageable
- Precise linking to exact concepts
- Easy to update individual concepts
- Scales to any knowledge size

**Implementation:**
- Max 200 lines per atomic note
- Max 6 H2 sections per note
- Hub notes (`_index.md`) for navigation
- Auto-split when limits exceeded

### 3.6 Standards Are Binding

**Decision:** AI must load and follow standards defined in the vault.

**Rationale:**
- Consistent output regardless of AI
- User controls AI behavior
- Standards are version-controlled
- Can be updated without changing AI

**Implementation:**
- Standards marked with `ai_binding: required`
- Loaded automatically at session start
- AI must acknowledge before proceeding
- Validation can enforce compliance

### 3.7 Structured AI Conventions

**Decision:** AI always uses structured, consistent conventions regardless of human vault organization.

**Rationale:**
- Human inconsistencies shouldn't corrupt AI knowledge
- AI notes should be predictable
- Easier to query and process
- Clear separation of AI vs human content

**Implementation:**
- AI content always has full frontmatter
- Consistent naming conventions
- Predictable folder structure
- Machine-readable metadata

### 3.8 Multi-Vault with Access Control

**Decision:** Support multiple vaults with configurable read/write access.

**Rationale:**
- Separate work/personal knowledge
- Vendor docs can be read-only
- Client-specific vaults
- Shared team vaults

**Implementation:**
- Global config lists all vaults
- Each vault has mode: `rw` or `ro`
- Ignore patterns per vault
- Cross-vault search and linking

### 3.9 Version Tracking Without Rollback

**Decision:** Track version numbers but rely on git/sync for actual rollback.

**Rationale:**
- Avoid complexity and storage overhead
- Git already solves this problem
- Palace shouldn't duplicate functionality
- Keep implementation focused

**Implementation:**
- `palace.version` in frontmatter increments on edit
- `authors` array tracks who changed what
- No internal version storage
- Users use git for history

---

## 4. Architecture Overview

### 4.1 System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         MCP Clients                                  │
│            (Claude Desktop, Claude Code, ChatGPT, etc.)             │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │ MCP Protocol (stdio/HTTP+SSE)
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Palace MCP Server                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │   Tools     │  │  Services   │  │   Index     │  │   Config    │ │
│  │             │  │             │  │             │  │             │ │
│  │ - store     │  │ - vault     │  │ - SQLite    │  │ - multi-    │ │
│  │ - check     │  │ - graph     │  │ - FTS5      │  │   vault     │ │
│  │ - read      │  │ - autolink  │  │ - watcher   │  │ - structure │ │
│  │ - improve   │  │ - dataview  │  │             │  │ - ignore    │ │
│  │ - recall    │  │ - standards │  │             │  │ - atomic    │ │
│  │ - ...       │  │ - atomic    │  │             │  │             │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘ │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │ File System
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        Obsidian Vaults                               │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │
│  │  Work (rw)   │  │ Personal(rw) │  │ Vendor (ro)  │               │
│  │              │  │              │  │              │               │
│  │ .palace.yaml │  │ .palace.yaml │  │ .palace.yaml │               │
│  │ technologies/│  │ personal/    │  │ docs/        │               │
│  │ projects/    │  │ journal/     │  │ reference/   │               │
│  │ standards/   │  │              │  │              │               │
│  └──────────────┘  └──────────────┘  └──────────────┘               │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 Directory Structure (Server)

```
src/
├── index.ts                    # Entry point, transport selection
├── config/
│   ├── index.ts               # Configuration loading
│   ├── vault-config.ts        # Per-vault .palace.yaml parsing
│   └── global-config.ts       # Global multi-vault config
├── services/
│   ├── vault/
│   │   ├── reader.ts          # Read operations
│   │   ├── writer.ts          # Write operations
│   │   ├── watcher.ts         # File system watching
│   │   ├── resolver.ts        # Intent → path resolution
│   │   └── index.ts
│   ├── index/
│   │   ├── sqlite.ts          # Database management
│   │   ├── query.ts           # Query building
│   │   ├── sync.ts            # Index synchronization
│   │   └── index.ts
│   ├── graph/
│   │   ├── links.ts           # Link extraction
│   │   ├── relationships.ts   # Graph traversal
│   │   ├── integrity.ts       # Orphan detection, validation
│   │   └── index.ts
│   ├── autolink/
│   │   ├── scanner.ts         # Find linkable terms
│   │   ├── linker.ts          # Insert links
│   │   ├── aliases.ts         # Alias management
│   │   └── index.ts
│   ├── atomic/
│   │   ├── analyzer.ts        # Content size analysis
│   │   ├── splitter.ts        # Split large content
│   │   ├── hub-manager.ts     # Hub note management
│   │   └── index.ts
│   ├── standards/
│   │   ├── loader.ts          # Load binding standards
│   │   ├── validator.ts       # Validate compliance
│   │   └── index.ts
│   └── dataview/
│       ├── parser.ts          # DQL parsing
│       ├── executor.ts        # Query execution
│       ├── formatter.ts       # Result formatting
│       └── index.ts
├── tools/
│   ├── store.ts               # palace_store
│   ├── check.ts               # palace_check
│   ├── read.ts                # palace_read
│   ├── improve.ts             # palace_improve
│   ├── recall.ts              # palace_recall
│   ├── list.ts                # palace_list
│   ├── structure.ts           # palace_structure
│   ├── vaults.ts              # palace_vaults
│   ├── standards.ts           # palace_standards
│   ├── links.ts               # palace_links
│   ├── orphans.ts             # palace_orphans
│   ├── related.ts             # palace_related
│   ├── autolink.ts            # palace_autolink
│   ├── query.ts               # palace_query
│   ├── dataview.ts            # palace_dataview
│   ├── session.ts             # palace_session
│   ├── clarify.ts             # palace_clarify
│   └── index.ts               # Tool registration
├── transports/
│   ├── stdio.ts               # Standard I/O transport
│   └── http.ts                # HTTP/SSE transport
├── utils/
│   ├── logger.ts
│   ├── slugify.ts
│   ├── frontmatter.ts
│   ├── wikilinks.ts
│   ├── markdown.ts
│   └── index.ts
└── types/
    └── index.ts
```

---

## 5. Knowledge Layer Model

### 5.1 Three-Layer Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 1: Technical Knowledge                                    │
│  ─────────────────────────────                                   │
│  Location: technologies/, commands/, reference/                  │
│  Scope: ALWAYS general, NEVER project-specific                  │
│  Content: How things work, commands, APIs, configurations       │
│                                                                  │
│  Examples:                                                       │
│  - technologies/kubernetes/concepts/pods.md                     │
│  - commands/docker/networking/bridge-networks.md                │
│  - reference/http-status-codes.md                               │
├─────────────────────────────────────────────────────────────────┤
│  LAYER 2: Domain Knowledge                                       │
│  ─────────────────────────────                                   │
│  Location: standards/, patterns/, research/                      │
│  Scope: General, reusable across projects                       │
│  Content: Best practices, patterns, research findings           │
│                                                                  │
│  Examples:                                                       │
│  - standards/git-workflow.md                                    │
│  - patterns/microservices/circuit-breaker.md                    │
│  - research/camera-comparison-2025.md                           │
├─────────────────────────────────────────────────────────────────┤
│  LAYER 3: Contextual Knowledge                                   │
│  ─────────────────────────────                                   │
│  Location: projects/, clients/, products/                        │
│  Scope: Specific to one project/client/product                  │
│  Content: Decisions, configurations, context-specific notes     │
│                                                                  │
│  Examples:                                                       │
│  - projects/xlink/decisions/chose-calico-for-cni.md            │
│  - projects/xlink/configurations/namespace-setup.md             │
│  - clients/touch365/overview.md                                 │
│  - products/security-robot/hardware-selection.md                │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Layer Determination Rules

```typescript
function determineLayer(intent: StorageIntent): Layer {
  // Rule 1: Technical how-to knowledge → Layer 1
  if (['command', 'technology', 'reference'].includes(intent.knowledge_type)) {
    return Layer.TECHNICAL;
  }

  // Rule 2: Standards and patterns → Layer 2
  if (['standard', 'pattern', 'research'].includes(intent.knowledge_type)) {
    return Layer.DOMAIN;
  }

  // Rule 3: Decisions and configurations → Layer 3
  if (['decision', 'configuration'].includes(intent.knowledge_type)) {
    return Layer.CONTEXTUAL;
  }

  // Rule 4: Scope explicitly set
  if (intent.scope === 'project-specific') {
    return Layer.CONTEXTUAL;
  }

  // Rule 5: Has project/client/product context
  if (intent.project || intent.client || intent.product) {
    // But check if content is reusable
    if (isReusableKnowledge(intent.content)) {
      // Store in Layer 1/2, but create reference in Layer 3
      return Layer.TECHNICAL_WITH_REFERENCE;
    }
    return Layer.CONTEXTUAL;
  }

  // Default: Layer 1 for technical, Layer 2 for everything else
  return isCommand(intent) ? Layer.TECHNICAL : Layer.DOMAIN;
}
```

### 5.3 Reference Pattern for Projects

When technical knowledge is discovered in a project context:

```markdown
<!-- Layer 1: General Knowledge -->
# technologies/kubernetes/networking/calico.md
...comprehensive Calico documentation...

<!-- Layer 3: Project Reference -->
# projects/xlink/infrastructure.md

## Networking

We use [[technologies/kubernetes/networking/calico|Calico]] for network policies.

### Xlink-Specific Configuration

Our Calico configuration differs from default in:
- Custom IPAM range: 10.244.0.0/16
- BGP peering with edge routers

> For general Calico documentation, see [[technologies/kubernetes/networking/calico]]
```

---

## 6. Atomic Note Architecture

### 6.1 File Size Limits

| Metric | Limit | Action When Exceeded |
|--------|-------|---------------------|
| Total lines | 200 | Split into hub + children |
| H2 sections | 6 | Create sub-hubs |
| Section lines | 50 | Extract to own file |
| Hub lines | 150 | Hubs are navigation only |

### 6.2 Hub Note Pattern

#### Root Hub (`_index.md`)

```yaml
---
type: technology_hub
title: Kubernetes
domain: [containers, orchestration]
status: active
children_count: 47              # Auto-maintained
official_docs: https://kubernetes.io/docs/
created: 2025-12-06T10:00:00Z
modified: 2025-12-10T14:30:00Z
---

# Kubernetes

Container orchestration platform for automating deployment, scaling, and management.

## Overview

Brief 2-3 paragraph introduction. NOT comprehensive documentation.

## Knowledge Map

### Core Concepts → [[kubernetes/concepts/_index]]
- [[kubernetes/concepts/pods|Pods]] - Smallest deployable unit
- [[kubernetes/concepts/services|Services]] - Network abstraction
- [[kubernetes/concepts/deployments|Deployments]] - Declarative updates

### Networking → [[kubernetes/networking/_index]]
- [[kubernetes/networking/cni|CNI Plugins]]
- [[kubernetes/networking/network-policies|Network Policies]]

### Commands → [[kubernetes/commands/_index]]
- [[kubernetes/commands/kubectl-basics|kubectl Basics]]

## Used In

- [[projects/xlink/infrastructure]]
- [[projects/minuvox/deployment]]

## Related

- [[technologies/docker/_index|Docker]]
- [[technologies/helm/_index|Helm]]
```

#### Sub-Hub (`concepts/_index.md`)

```yaml
---
type: concept_hub
title: Kubernetes Concepts
parent: "[[kubernetes/_index]]"
children_count: 12
---

# Kubernetes Concepts

Core concepts for understanding Kubernetes.

## Workload Resources

- [[pods]] - Smallest deployable unit
- [[deployments]] - Declarative updates for Pods
- [[statefulsets]] - Stateful application management
- [[daemonsets]] - Run on all/selected nodes
- [[jobs]] - Run-to-completion workloads

## Configuration

- [[configmaps]] - Non-confidential configuration
- [[secrets]] - Sensitive data storage

## Organization

- [[namespaces]] - Virtual clusters
- [[labels-and-selectors]] - Organize and select resources
```

#### Atomic Note (`pods.md`)

```yaml
---
type: concept
title: Kubernetes Pods
parent: "[[kubernetes/concepts/_index]]"
technology: "[[kubernetes/_index]]"
domain: [kubernetes, containers]
status: active
confidence: 0.8
official_docs: https://kubernetes.io/docs/concepts/workloads/pods/
created: 2025-12-06T10:00:00Z
modified: 2025-12-10T14:30:00Z
palace:
  version: 3
  last_agent: claude
---

# Kubernetes Pods

A Pod is the smallest deployable unit in Kubernetes.

## Overview

[40-50 lines max for this section]

## Key Characteristics

[Bullet points, concise]

## Common Patterns

- [[kubernetes/patterns/sidecar|Sidecar Pattern]]
- [[kubernetes/patterns/init-containers|Init Containers]]

## Commands

```bash
kubectl get pods
kubectl describe pod <name>
```

> For comprehensive kubectl commands, see [[kubernetes/commands/kubectl-basics]]

## Troubleshooting

- [[kubernetes/troubleshooting/pod-crashloopbackoff]]
- [[kubernetes/troubleshooting/image-pull-errors]]

## See Also

- [[kubernetes/concepts/deployments|Deployments]]
- [[kubernetes/concepts/services|Services]]
```

### 6.3 Directory Structure Example

```
technologies/kubernetes/
├── _index.md                           # Root hub (max 150 lines)
├── concepts/
│   ├── _index.md                       # Concepts hub
│   ├── pods.md                         # Atomic (max 200 lines)
│   ├── services.md
│   ├── deployments.md
│   ├── statefulsets.md
│   ├── configmaps.md
│   └── secrets.md
├── networking/
│   ├── _index.md
│   ├── cni/
│   │   ├── _index.md                   # Sub-hub when topic is large
│   │   ├── calico.md
│   │   ├── flannel.md
│   │   └── cilium.md
│   ├── network-policies.md
│   ├── ingress.md
│   └── services/                       # Sub-folder when needed
│       ├── _index.md
│       ├── clusterip.md
│       ├── nodeport.md
│       └── loadbalancer.md
├── commands/
│   ├── _index.md
│   ├── kubectl-basics.md
│   ├── cluster-management.md
│   └── debugging.md
├── troubleshooting/
│   ├── _index.md
│   ├── pod-crashloopbackoff.md         # One problem per file
│   ├── image-pull-errors.md
│   └── pending-pods.md
└── patterns/
    ├── _index.md
    ├── sidecar.md
    ├── init-containers.md
    └── jobs-and-cronjobs.md
```

### 6.4 Auto-Split Algorithm

```typescript
interface SplitAnalysis {
  shouldSplit: boolean;
  reason: string;
  suggestedStructure: {
    hub: string;
    children: Array<{
      title: string;
      content: string;
      path: string;
    }>;
  };
}

function analyzeForSplit(content: string, metadata: NoteMetadata): SplitAnalysis {
  const lines = content.split('\n').length;
  const sections = extractH2Sections(content);

  // Check total lines
  if (lines > 200) {
    return {
      shouldSplit: true,
      reason: `Content exceeds 200 lines (${lines} lines)`,
      suggestedStructure: splitByHeadings(content, metadata)
    };
  }

  // Check section count
  if (sections.length > 6) {
    return {
      shouldSplit: true,
      reason: `Too many sections (${sections.length} > 6)`,
      suggestedStructure: splitByHeadings(content, metadata)
    };
  }

  // Check individual section sizes
  const largeSections = sections.filter(s => s.lines > 50);
  if (largeSections.length > 0) {
    return {
      shouldSplit: true,
      reason: `${largeSections.length} section(s) exceed 50 lines`,
      suggestedStructure: extractLargeSections(content, largeSections, metadata)
    };
  }

  // Check for sub-concepts that deserve own files
  const subConcepts = detectSubConcepts(content);
  if (subConcepts.length >= 3) {
    return {
      shouldSplit: true,
      reason: `Detected ${subConcepts.length} sub-concepts`,
      suggestedStructure: splitBySubConcepts(content, subConcepts, metadata)
    };
  }

  return { shouldSplit: false, reason: 'Content within limits', suggestedStructure: null };
}
```

---

## 7. Multi-Vault System

### 7.1 Global Configuration

Location: `~/.config/palace/config.yaml`

```yaml
# Palace Global Configuration
version: 1

# Registered vaults
vaults:
  - path: "/Users/adam/Documents/Work Palace"
    alias: work
    mode: rw
    default: true                    # Default for new content

  - path: "/Users/adam/Documents/Personal Palace"
    alias: personal
    mode: rw

  - path: "/Users/adam/Documents/Vendor Docs"
    alias: vendor
    mode: ro                         # Read-only

  - path: "/Users/adam/Documents/Clients/Xlink"
    alias: xlink
    mode: rw
    context:
      client: xlink
      type: client_vault

# Cross-vault behavior
cross_vault:
  search: true                       # Search across all vaults
  link_format: "vault:alias/path"    # [[vault:work/note]]
  standards_source: work             # Load standards from this vault

# Runtime settings
settings:
  log_level: info
  watch_enabled: true
  auto_index: true
```

### 7.2 Per-Vault Configuration

Location: `{vault}/.palace.yaml`

```yaml
# Vault Configuration
vault:
  name: work-knowledge
  description: "Work-related knowledge, projects, infrastructure"
  mode: rw                           # Can be overridden by global config

# Knowledge layer path mapping
structure:
  # Layer 1: Technical
  technology:
    path: "technologies/{domain}/"
    hub_file: "_index.md"

  command:
    path: "commands/{domain}/"
    hub_file: "_index.md"

  reference:
    path: "reference/{domain}/"

  # Layer 2: Domain
  standard:
    path: "standards/{domain}/"
    ai_binding: required              # AI must follow these

  pattern:
    path: "patterns/{domain}/"

  research:
    path: "research/{domain}/"

  # Layer 3: Contextual
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
      research: "research/"

# Session logs
sessions:
  path: "daily/"
  format: "{YYYY-MM-DD}.md"

# Ignore rules
ignore:
  # Glob patterns
  patterns:
    - ".obsidian/"
    - "templates/"
    - "private/**"
    - "*.private.md"
    - "archive/**"

  # Marker file - any folder containing this file is ignored
  marker_file: ".palace-ignore"

  # Frontmatter key - notes with this set to true are ignored
  frontmatter_key: "palace_ignore"

# Atomic note rules
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
  warn_orphan_depth: 1               # Warn if note has no connections
  retroactive_linking: true

# Templates (optional)
templates:
  technology_hub: "_templates/technology-hub.md"
  concept: "_templates/concept.md"
  command: "_templates/command.md"
  decision: "_templates/decision.md"
  standard: "_templates/standard.md"
```

### 7.3 Ignore Mechanism (Three Layers)

```
Layer 1: Global Patterns (.palace.yaml)
├── patterns: ["private/**", "*.private.md"]
│
Layer 2: Directory Markers
├── any_folder/.palace-ignore      # Empty file = ignore folder
│
Layer 3: Note Frontmatter
└── palace_ignore: true            # In any note's frontmatter
```

### 7.4 Vault Resolution

```typescript
interface VaultResolution {
  vault: Vault;
  path: string;
  fullPath: string;
}

function resolveStorage(intent: StorageIntent): VaultResolution {
  // 1. Explicit vault specified
  if (intent.vault) {
    return resolveInVault(intent.vault, intent);
  }

  // 2. Project/client context points to specific vault
  if (intent.project) {
    const projectVault = findVaultForProject(intent.project);
    if (projectVault) return resolveInVault(projectVault, intent);
  }

  if (intent.client) {
    const clientVault = findVaultForClient(intent.client);
    if (clientVault) return resolveInVault(clientVault, intent);
  }

  // 3. Use default vault
  const defaultVault = getDefaultVault();
  return resolveInVault(defaultVault, intent);
}

function resolveInVault(vault: Vault, intent: StorageIntent): VaultResolution {
  const config = loadVaultConfig(vault);
  const structure = config.structure[intent.knowledge_type];

  // Build path from template
  let path = structure.path;
  path = path.replace('{domain}', intent.domain.join('/'));
  path = path.replace('{project}', intent.project || '');
  path = path.replace('{client}', intent.client || '');
  path = path.replace('{product}', intent.product || '');

  // Add subpath if applicable
  if (structure.subpaths && intent.subtype) {
    path = join(path, structure.subpaths[intent.subtype]);
  }

  // Add filename
  const filename = slugify(intent.title) + '.md';
  path = join(path, filename);

  return {
    vault,
    path,
    fullPath: join(vault.path, path)
  };
}
```

---

## 8. Tool Specifications

### 8.1 Tool Overview

| Tool | Purpose | Layer |
|------|---------|-------|
| `palace_store` | Intent-based knowledge storage | Core |
| `palace_check` | Check for existing knowledge | Core |
| `palace_read` | Read specific note | Core |
| `palace_improve` | Update existing note intelligently | Core |
| `palace_recall` | Search across vaults | Core |
| `palace_list` | List notes with filters | Structure |
| `palace_structure` | Get vault/path structure | Structure |
| `palace_vaults` | List available vaults | Structure |
| `palace_standards` | Get binding standards | Standards |
| `palace_links` | Get backlinks/outlinks | Graph |
| `palace_orphans` | Find disconnected notes | Graph |
| `palace_related` | Find related content | Graph |
| `palace_autolink` | Batch auto-linking | Graph |
| `palace_query` | Property-based queries | Query |
| `palace_dataview` | DQL queries | Query |
| `palace_session` | Session management | Session |
| `palace_clarify` | Request missing context | AI Support |

### 8.2 Core Tools

#### `palace_store`

**Purpose:** Store new knowledge with intent-based resolution

```typescript
interface PalaceStoreInput {
  // Content
  title: string;
  content: string;

  // Intent
  intent: {
    // What kind of knowledge
    knowledge_type:
      | 'technology'        // Technology documentation
      | 'command'           // CLI commands, scripts
      | 'reference'         // Quick reference, cheat sheets
      | 'standard'          // Standards and conventions
      | 'pattern'           // Reusable patterns
      | 'research'          // Research findings
      | 'decision'          // Project decisions
      | 'configuration'     // Project-specific config
      | 'troubleshooting'   // Problems and solutions
      | 'note';             // General notes

    // Classification
    domain: string[];                  // ["kubernetes", "networking"]
    tags?: string[];

    // Scope
    scope: 'general' | 'project-specific';

    // Context (required if scope is project-specific)
    project?: string;
    client?: string;
    product?: string;

    // Graph connections
    technologies?: string[];           // Technologies to link/stub
    references?: string[];             // Explicit links to create
    parent?: string;                   // Parent hub if known
  };

  // Options
  options?: {
    vault?: string;                    // Specific vault alias
    create_stubs?: boolean;            // Create stubs for unknown tech (default: true)
    retroactive_link?: boolean;        // Update existing notes (default: true)
    expand_if_stub?: boolean;          // Expand existing stub (default: true)
    dry_run?: boolean;                 // Preview without saving
  };

  // Provenance
  source?: {
    origin: 'ai:research' | 'ai:artifact' | 'human' | `web:${string}`;
    confidence?: number;               // 0.0 - 1.0
  };
}

interface PalaceStoreOutput {
  success: boolean;

  // What was created
  created: {
    path: string;
    vault: string;
    title: string;
    type: 'atomic' | 'hub';
  };

  // If content was split
  split?: {
    hub: string;
    children: string[];
    reason: string;
  };

  // Stubs created
  stubs_created?: string[];

  // Links added
  links_added?: {
    to_existing: string[];
    from_existing: string[];
  };

  // If existing note was expanded
  expanded_stub?: string;

  // Warnings
  warnings?: string[];
}
```

#### `palace_check`

**Purpose:** Check for existing knowledge before storing

```typescript
interface PalaceCheckInput {
  query: string;                       // What to search for
  knowledge_type?: string;             // Filter by type
  domain?: string[];                   // Filter by domain
  include_stubs?: boolean;             // Include stub notes (default: true)
  vault?: string;                      // Specific vault
}

interface PalaceCheckOutput {
  found: boolean;

  matches: Array<{
    path: string;
    vault: string;
    title: string;
    status: 'active' | 'stub';
    confidence: number;
    relevance: number;                 // Search relevance score
    summary: string;                   // First paragraph
    last_modified: string;
  }>;

  suggestions: {
    should_expand_stub: boolean;
    stub_path?: string;
    missing_technologies: string[];    // Mentioned but no notes exist
    similar_titles: string[];          // Possible duplicates
  };

  recommendation:
    | 'create_new'                     // No matches, create new note
    | 'expand_stub'                    // Found stub, expand it
    | 'improve_existing'               // Good match exists, improve it
    | 'reference_existing';            // Exact match, just reference it
}
```

#### `palace_read`

**Purpose:** Read a specific note

```typescript
interface PalaceReadInput {
  path?: string;                       // Full path to note
  title?: string;                      // Find by title
  vault?: string;                      // Specific vault
  include_children?: boolean;          // If hub, include child summaries
}

interface PalaceReadOutput {
  success: boolean;

  note: {
    path: string;
    vault: string;
    title: string;
    frontmatter: NoteFrontmatter;
    content: string;

    // If hub note
    children?: Array<{
      path: string;
      title: string;
      summary: string;
    }>;

    // Graph info
    links: {
      incoming: number;
      outgoing: number;
    };
  };
}
```

#### `palace_improve`

**Purpose:** Intelligently update an existing note

```typescript
interface PalaceImproveInput {
  path: string;
  vault?: string;

  // What to improve
  improvement: string;                 // New content to add

  // How to improve
  mode:
    | 'append'                         // Add to end
    | 'append_section'                 // Add as new section
    | 'update_section'                 // Update specific section
    | 'merge'                          // Intelligently merge
    | 'replace';                       // Full replacement

  // For update_section mode
  section?: string;                    // Section heading to update

  // Frontmatter updates
  frontmatter_updates?: Partial<NoteFrontmatter>;

  // Options
  options?: {
    auto_link?: boolean;               // Auto-link new content
    update_modified?: boolean;         // Update modified timestamp
    add_author?: boolean;              // Add to authors list
  };
}

interface PalaceImproveOutput {
  success: boolean;

  changes: {
    path: string;
    mode: string;
    lines_added: number;
    lines_removed: number;
    links_added: string[];
  };

  // If improvement caused split
  split?: {
    reason: string;
    new_files: string[];
  };

  // Updated note summary
  note: {
    path: string;
    title: string;
    lines: number;
    sections: number;
  };
}
```

#### `palace_recall`

**Purpose:** Search across vaults

```typescript
interface PalaceRecallInput {
  query: string;

  // Filters
  filters?: {
    knowledge_type?: string | string[];
    domain?: string[];
    tags?: string[];
    vault?: string;
    project?: string;
    client?: string;
    status?: 'active' | 'stub' | 'all';
    min_confidence?: number;
    modified_after?: string;           // ISO date
    modified_before?: string;
  };

  // Options
  options?: {
    limit?: number;                    // Default: 10, max: 50
    include_content?: boolean;         // Include full content
    include_stubs?: boolean;           // Include stub notes
    sort_by?: 'relevance' | 'modified' | 'confidence';
  };
}

interface PalaceRecallOutput {
  success: boolean;

  query: string;
  total: number;
  returned: number;

  results: Array<{
    path: string;
    vault: string;
    title: string;
    status: 'active' | 'stub';
    relevance: number;

    frontmatter: {
      type: string;
      domain: string[];
      confidence: number;
      modified: string;
    };

    // If include_content
    content?: string;

    // Snippet around match
    snippet?: string;
  }>;

  // Related searches
  suggestions?: string[];
}
```

### 8.3 Standards Tool

#### `palace_standards`

**Purpose:** Get standards AI must follow

```typescript
interface PalaceStandardsInput {
  domain?: string[];                   // Filter by domain
  applies_to?: string;                 // Filter by what it applies to
  vault?: string;                      // Specific vault
}

interface PalaceStandardsOutput {
  success: boolean;

  standards: Array<{
    path: string;
    vault: string;
    title: string;

    binding: 'required' | 'recommended' | 'optional';
    applies_to: string[];              // What domains/contexts

    content: string;                   // Full standard content

    summary: string;                   // Brief description
  }>;

  // AI acknowledgment required
  acknowledgment_required: boolean;
  acknowledgment_message?: string;
}
```

### 8.4 AI Support Tool

#### `palace_clarify`

**Purpose:** Request missing context from user

```typescript
interface PalaceClarifyInput {
  context: {
    title: string;
    content_preview: string;           // First 500 chars
    detected_technologies: string[];
    detected_context: {
      possible_projects: string[];
      possible_clients: string[];
    };
  };

  missing: Array<
    | 'scope'                          // General vs project-specific
    | 'project'                        // Which project
    | 'client'                         // Which client
    | 'technologies'                   // Confirm tech links
    | 'domain'                         // Categorization
  >;
}

interface PalaceClarifyOutput {
  questions: Array<{
    key: string;
    question: string;
    type: 'choice' | 'confirm' | 'text';
    options?: string[];
    detected_hints?: string[];
    default?: string;
  }>;

  // Pre-filled suggestions based on detection
  suggestions: {
    scope?: 'general' | 'project-specific';
    project?: string;
    technologies?: string[];
  };
}
```

### 8.5 Session Tool

#### `palace_session`

**Purpose:** Manage work sessions

```typescript
interface PalaceSessionInput {
  action: 'start' | 'log' | 'end' | 'status';

  // For 'start'
  topic?: string;
  context?: string;
  project?: string;

  // For 'log'
  entry?: string;
  notes_created?: string[];
  notes_improved?: string[];

  // Options
  vault?: string;
}

interface PalaceSessionOutput {
  success: boolean;

  session: {
    id: string;
    date: string;
    topic: string;
    context?: string;
    project?: string;

    started_at: string;
    ended_at?: string;

    stats: {
      entries: number;
      notes_created: number;
      notes_improved: number;
    };
  };

  // For 'log' action
  entry_added?: {
    timestamp: string;
    entry: string;
  };

  // Path to session file
  session_file: string;
}
```

---

## 9. Data Structures

### 9.1 Note Frontmatter Schema

```yaml
---
# Identity
type: technology | concept | command | reference | standard | pattern |
      research | decision | configuration | troubleshooting | note |
      technology_hub | concept_hub | project_hub
title: "Note Title"

# Hierarchy (for atomic notes)
parent: "[[parent/_index]]"           # Parent hub
technology: "[[technologies/x/_index]]"  # Root technology (if applicable)

# Classification
domain: [primary, secondary]          # Topic hierarchy
tags: [tag1, tag2]                    # Freeform tags
aliases: [alt-name-1, alt-name-2]     # Alternative titles for linking

# Status
status: active | stub | archived | deprecated
stub_context: "Why/where this was first mentioned"  # If stub

# Provenance
source:
  origin: ai:research | ai:artifact | human | web:url
  confidence: 0.0-1.0
  verified: boolean
  verified_by: string                 # Who verified
  verified_at: string                 # When verified

# Authorship
authors:
  - agent: claude | human | username
    action: created | expanded | improved | verified
    date: ISO-8601
    context: "Optional context about the change"

# Dates
created: ISO-8601
modified: ISO-8601

# Standards binding (for standard type only)
ai_binding: required | recommended | optional
applies_to: [all] | [typescript, python, ...]

# External references
official_docs: URL
see_also: [URLs]

# Palace metadata
palace:
  version: number                     # Increments on each edit
  last_agent: claude | human
  auto_linked: boolean
  children_count: number              # For hubs

# User can add any additional fields
custom_field: value
---
```

### 9.2 Confidence Scale

| Range | Meaning | When to Use |
|-------|---------|-------------|
| 0.1-0.2 | Stub | Placeholder, not yet documented |
| 0.3-0.4 | AI Speculation | AI reasoning without sources |
| 0.5-0.6 | Single Source | One web result, one doc |
| 0.7 | Multiple Sources | Cross-referenced research |
| 0.8 | Authoritative | Official docs, well-tested |
| 0.9 | Human Verified | Human confirmed accuracy |
| 1.0 | Canonical | Definitive, authoritative source |

**Rule:** AI should NEVER set confidence above 0.7 without human verification.

### 9.3 SQLite Schema

```sql
-- Notes table (per vault)
CREATE TABLE notes (
    id INTEGER PRIMARY KEY,
    path TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,

    -- Classification
    type TEXT,
    status TEXT DEFAULT 'active',
    domain TEXT,                       -- JSON array
    tags TEXT,                         -- JSON array

    -- Hierarchy
    parent_path TEXT,
    technology_path TEXT,

    -- Provenance
    source_origin TEXT,
    confidence REAL,
    verified INTEGER DEFAULT 0,

    -- Timestamps
    created TEXT,
    modified TEXT,

    -- Content
    content TEXT,
    content_hash TEXT,

    -- Metrics
    line_count INTEGER,
    section_count INTEGER,
    word_count INTEGER,

    -- Palace metadata
    palace_version INTEGER DEFAULT 1,
    last_agent TEXT,
    children_count INTEGER DEFAULT 0
);

-- Tags junction table
CREATE TABLE note_tags (
    note_id INTEGER,
    tag TEXT,
    PRIMARY KEY (note_id, tag),
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
);

-- Domain junction table
CREATE TABLE note_domains (
    note_id INTEGER,
    domain TEXT,
    position INTEGER,                  -- Order in hierarchy
    PRIMARY KEY (note_id, domain, position),
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
);

-- Links table
CREATE TABLE links (
    id INTEGER PRIMARY KEY,
    source_id INTEGER,
    target_path TEXT,                  -- May not exist (broken link)
    target_id INTEGER,                 -- NULL if target doesn't exist
    link_text TEXT,                    -- Display text if different
    resolved INTEGER DEFAULT 0,
    FOREIGN KEY (source_id) REFERENCES notes(id) ON DELETE CASCADE,
    FOREIGN KEY (target_id) REFERENCES notes(id) ON DELETE SET NULL
);

-- Full-text search
CREATE VIRTUAL TABLE notes_fts USING fts5(
    title,
    content,
    tags,
    domain,
    content='notes',
    content_rowid='id',
    tokenize='porter unicode61'
);

-- Authors table (for tracking contributions)
CREATE TABLE authors (
    id INTEGER PRIMARY KEY,
    note_id INTEGER,
    agent TEXT,
    action TEXT,
    date TEXT,
    context TEXT,
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
);

-- Stubs tracking
CREATE TABLE stubs (
    id INTEGER PRIMARY KEY,
    path TEXT UNIQUE,
    title TEXT,
    stub_context TEXT,
    created TEXT,
    mentioned_in TEXT                  -- JSON array of paths that mention this
);

-- Indexes
CREATE INDEX idx_notes_type ON notes(type);
CREATE INDEX idx_notes_status ON notes(status);
CREATE INDEX idx_notes_parent ON notes(parent_path);
CREATE INDEX idx_notes_technology ON notes(technology_path);
CREATE INDEX idx_notes_modified ON notes(modified);
CREATE INDEX idx_notes_confidence ON notes(confidence);
CREATE INDEX idx_links_source ON links(source_id);
CREATE INDEX idx_links_target ON links(target_path);
CREATE INDEX idx_links_resolved ON links(resolved);
CREATE INDEX idx_authors_note ON authors(note_id);
CREATE INDEX idx_authors_agent ON authors(agent);

-- Triggers for FTS sync
CREATE TRIGGER notes_ai AFTER INSERT ON notes BEGIN
    INSERT INTO notes_fts(rowid, title, content, tags, domain)
    VALUES (new.id, new.title, new.content, new.tags, new.domain);
END;

CREATE TRIGGER notes_ad AFTER DELETE ON notes BEGIN
    INSERT INTO notes_fts(notes_fts, rowid, title, content, tags, domain)
    VALUES ('delete', old.id, old.title, old.content, old.tags, old.domain);
END;

CREATE TRIGGER notes_au AFTER UPDATE ON notes BEGIN
    INSERT INTO notes_fts(notes_fts, rowid, title, content, tags, domain)
    VALUES ('delete', old.id, old.title, old.content, old.tags, old.domain);
    INSERT INTO notes_fts(rowid, title, content, tags, domain)
    VALUES (new.id, new.title, new.content, new.tags, new.domain);
END;
```

---

## 10. Configuration Schema

### 10.1 Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PALACE_CONFIG_PATH` | No | `~/.config/palace/config.yaml` | Global config location |
| `PALACE_VAULTS` | No* | - | Quick vault setup: `path:alias:mode,...` |
| `PALACE_DEFAULT_VAULT` | No | First vault | Default vault alias |
| `PALACE_LOG_LEVEL` | No | `info` | debug, info, warn, error |
| `PALACE_WATCH_ENABLED` | No | `true` | File system watching |
| `HTTP_ENABLED` | No | `false` | Enable HTTP transport |
| `HTTP_PORT` | No | `3000` | HTTP server port |
| `HTTP_CORS_ORIGIN` | No | `*` | CORS allowed origins |

*Either `PALACE_CONFIG_PATH` or `PALACE_VAULTS` must provide vault configuration.

### 10.2 Global Config Schema

```typescript
interface GlobalConfig {
  version: number;

  vaults: Array<{
    path: string;                      // Absolute path to vault
    alias: string;                     // Short name for reference
    mode: 'rw' | 'ro';                // Access mode
    default?: boolean;                 // Is this the default vault?
    context?: {
      client?: string;                 // Associated client
      project?: string;                // Associated project
      type?: 'personal' | 'work' | 'client_vault' | 'reference';
    };
  }>;

  cross_vault: {
    search: boolean;                   // Search across all vaults
    link_format: string;               // Format for cross-vault links
    standards_source: string;          // Vault alias for standards
  };

  settings: {
    log_level: 'debug' | 'info' | 'warn' | 'error';
    watch_enabled: boolean;
    auto_index: boolean;
  };
}
```

### 10.3 Vault Config Schema

```typescript
interface VaultConfig {
  vault: {
    name: string;
    description?: string;
    mode: 'rw' | 'ro';
  };

  structure: Record<KnowledgeType, {
    path: string;                      // Path template with {variables}
    hub_file?: string;                 // Hub filename (default: _index.md)
    ai_binding?: 'required' | 'recommended' | 'optional';
    subpaths?: Record<string, string>; // Subtype → subpath mapping
  }>;

  sessions: {
    path: string;
    format: string;                    // Filename format with {variables}
  };

  ignore: {
    patterns: string[];                // Glob patterns
    marker_file: string;               // File that marks folder as ignored
    frontmatter_key: string;           // Frontmatter field for ignore
  };

  atomic: {
    max_lines: number;
    max_sections: number;
    section_max_lines: number;
    hub_max_lines: number;
    hub_filename: string;
    auto_split: boolean;
  };

  stubs: {
    auto_create: boolean;
    min_confidence: number;
    template?: string;
  };

  graph: {
    require_technology_links: boolean;
    warn_orphan_depth: number;
    retroactive_linking: boolean;
  };

  templates?: Record<string, string>;  // Type → template path
}
```

---

## 11. AI Behavior Protocols

### 11.1 Session Start Protocol

```
When AI starts a conversation with Palace MCP active:

1. Load binding standards
   → palace_standards({ binding: 'required' })
   → Acknowledge standards in system context

2. Check for active session
   → palace_session({ action: 'status' })
   → Resume or start new session based on context

3. Understand vault structure
   → palace_structure({ depth: 2 })
   → Know where things are
```

### 11.2 Knowledge Storage Protocol

```
When AI needs to store knowledge:

┌─────────────────────────────────────────────────────────────┐
│ STEP 1: Check for existing knowledge                        │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
palace_check({
  query: "topic being stored",
  knowledge_type: "command",
  include_stubs: true
})
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ STEP 2: Evaluate result                                      │
└─────────────────────────────────────────────────────────────┘
    │
    ├─► recommendation: 'reference_existing'
    │   → Just link to existing note, don't create
    │
    ├─► recommendation: 'improve_existing'
    │   → palace_improve() with new information
    │
    ├─► recommendation: 'expand_stub'
    │   → palace_store() with expand_if_stub: true
    │
    └─► recommendation: 'create_new'
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│ STEP 3: Ensure context is complete                           │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
    Is scope clear? (general vs project-specific)
    Are technologies identified?
    Is domain classification clear?
        │
        ├─► YES → Proceed to store
        │
        └─► NO → palace_clarify() → Ask user → Then store
                │
                ▼
┌─────────────────────────────────────────────────────────────┐
│ STEP 4: Store with full intent                               │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
palace_store({
  title: "...",
  content: "...",
  intent: {
    knowledge_type: "...",
    domain: [...],
    scope: "general" | "project-specific",
    technologies: [...],
    // ... full intent object
  }
})
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│ STEP 5: Log to session                                       │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
palace_session({
  action: 'log',
  entry: "Documented X",
  notes_created: ["path/to/note.md"]
})
```

### 11.3 Context Clarification Triggers

AI must ask for clarification when:

| Missing Context | Detection | Question |
|-----------------|-----------|----------|
| Scope | Technical content + mentions "our", "we", client names | "Is this general knowledge or specific to a project?" |
| Project | Scope is project-specific but no project identified | "Which project is this for?" |
| Technologies | Technical content with no tech references | "What technologies should I link this to?" |
| Domain | Can't determine categorization | "How should I categorize this?" |
| Client | Mentions company but unclear which | "Which client is this for?" |

### 11.4 Layer Determination Protocol

```
When storing new knowledge:

1. Is this HOW something works, a command, or API?
   → Layer 1 (Technical): technologies/, commands/, reference/

2. Is this a standard, pattern, or research finding?
   → Layer 2 (Domain): standards/, patterns/, research/

3. Is this a decision or project-specific configuration?
   → Layer 3 (Contextual): projects/, clients/, products/

4. Does it have project context BUT is reusable knowledge?
   → Store in Layer 1/2
   → Create reference note in Layer 3 project folder
```

### 11.5 Atomic Note Protocol

```
Before saving content:

1. Analyze content
   - Count lines
   - Count H2 sections
   - Detect sub-concepts

2. If lines > 200 OR sections > 6 OR sub-concepts >= 3:
   → Split into hub + atomic notes
   → Each atomic note < 200 lines
   → Hub provides navigation

3. If updating existing note and would exceed limits:
   → Convert to hub structure
   → Migrate existing content to children
   → Add new content as additional child
```

---

## 12. Implementation Phases

### Phase 8: Multi-Vault & Configuration

**Objective:** Support multiple vaults with configuration system

**Tasks:**
- Global config loading (`~/.config/palace/config.yaml`)
- Per-vault config loading (`.palace.yaml`)
- Vault registry service
- Access mode enforcement (rw/ro)
- Ignore mechanism (patterns, markers, frontmatter)
- `palace_vaults` tool
- Update all existing tools for multi-vault
- Tests for config parsing and vault resolution

**See:** [PHASE_008_MULTI_VAULT_CONFIG.md](phases/PHASE_008_MULTI_VAULT_CONFIG.md)

---

### Phase 9: Intent-Based Storage

**Objective:** Replace path-based storage with intent-based resolution

**Tasks:**
- Storage intent schema (Zod validation)
- Path resolution engine (intent → location)
- Knowledge layer determination
- `palace_store` tool (replaces `palace_remember`)
- `palace_check` tool
- Stub creation on technology mention
- Retroactive linking service
- Update `palace_improve` (was `palace_update`)
- Tests for intent resolution

**See:** [PHASE_009_INTENT_BASED_STORAGE.md](phases/PHASE_009_INTENT_BASED_STORAGE.md)

---

### Phase 10: Atomic Note System

**Objective:** Implement atomic notes with auto-splitting

**Tasks:**
- Content analyzer (lines, sections, sub-concepts)
- Split decision engine
- Content splitter (preserves links, creates hubs)
- Hub manager (create, update, maintain children count)
- Integration with `palace_store`
- Integration with `palace_improve`
- Tests for split scenarios

**See:** [PHASE_010_ATOMIC_NOTE_SYSTEM.md](phases/PHASE_010_ATOMIC_NOTE_SYSTEM.md)

---

### Phase 11: Standards System

**Objective:** Implement binding standards for AI behavior

**Tasks:**
- Standards loader (finds `ai_binding: required` notes)
- Standards validator (optional, for compliance checking)
- `palace_standards` tool
- Session-start standards loading
- Tests for standards system

**See:** [PHASE_011_STANDARDS_SYSTEM.md](phases/PHASE_011_STANDARDS_SYSTEM.md)

---

### Phase 12: AI Support Tools

**Objective:** Tools to help AI maintain graph integrity

**Tasks:**
- `palace_clarify` tool
- Context detection heuristics
- Missing context identification
- Question generation
- Tests

**See:** [PHASE_012_AI_SUPPORT_TOOLS.md](phases/PHASE_012_AI_SUPPORT_TOOLS.md)

---

### Phase 13: Documentation & Release

**Objective:** Complete documentation and prepare v2.0 release

**Tasks:**
- Update README.md for v2.0
- API documentation for all tools
- Configuration documentation
- AI behavior guide (for AI developers)
- Migration guide from v1.0
- Example configurations
- CHANGELOG.md update
- npm package preparation
- GitLab release

**See:** [PHASE_013_DOCUMENTATION_RELEASE.md](phases/PHASE_013_DOCUMENTATION_RELEASE.md)

---

## 13. Migration from v1.0

### 13.1 Breaking Changes

| v1.0 | v2.0 | Migration |
|------|------|-----------|
| `palace_remember` | `palace_store` | Update tool calls, add intent |
| `palace_update` | `palace_improve` | Update tool calls, add mode |
| Single vault | Multi-vault | Add global config |
| Flat files | Atomic notes | Run migration script |
| No stubs | Stub system | Automatic |

### 13.2 Migration Script

```bash
# Migrate existing vault to v2.0 structure
npx obsidian-palace-mcp migrate --vault /path/to/vault

# What it does:
# 1. Creates .palace.yaml with default config
# 2. Analyzes existing notes
# 3. Suggests splits for large files
# 4. Creates hub notes where needed
# 5. Updates frontmatter to v2.0 schema
# 6. Rebuilds index
```

### 13.3 Backward Compatibility

- v1.0 tool names continue to work (deprecated warnings)
- v1.0 frontmatter is auto-upgraded on read
- Single vault mode still works (just don't configure multiple)

---

## 14. Appendices

### Appendix A: Example Vault Structure

```
work-palace/
├── .palace.yaml                      # Vault configuration
├── _templates/                       # Note templates
│   ├── technology-hub.md
│   ├── concept.md
│   ├── command.md
│   ├── decision.md
│   └── stub.md
├── technologies/
│   ├── kubernetes/
│   │   ├── _index.md                # Hub
│   │   ├── concepts/
│   │   │   ├── _index.md
│   │   │   ├── pods.md
│   │   │   ├── services.md
│   │   │   └── deployments.md
│   │   ├── networking/
│   │   │   ├── _index.md
│   │   │   ├── cni/
│   │   │   │   ├── _index.md
│   │   │   │   ├── calico.md
│   │   │   │   └── flannel.md
│   │   │   └── network-policies.md
│   │   ├── commands/
│   │   │   ├── _index.md
│   │   │   └── kubectl-basics.md
│   │   └── troubleshooting/
│   │       ├── _index.md
│   │       └── pod-crashloopbackoff.md
│   ├── docker/
│   │   ├── _index.md
│   │   └── ...
│   └── terraform/
│       ├── _index.md                # Stub - not yet documented
│       └── ...
├── commands/
│   ├── linux/
│   │   ├── _index.md
│   │   ├── disk-management.md
│   │   └── networking.md
│   └── windows/
│       ├── _index.md
│       └── disk-management.md
├── standards/
│   ├── git-workflow.md
│   ├── code-style/
│   │   ├── _index.md
│   │   ├── typescript.md
│   │   └── python.md
│   └── documentation.md
├── patterns/
│   ├── microservices/
│   │   ├── _index.md
│   │   ├── circuit-breaker.md
│   │   └── saga.md
│   └── ...
├── research/
│   ├── cameras/
│   │   ├── _index.md
│   │   └── reolink-vs-hikvision.md
│   └── ...
├── projects/
│   ├── xlink/
│   │   ├── _index.md                # Project hub
│   │   ├── decisions/
│   │   │   ├── chose-calico-for-cni.md
│   │   │   └── namespace-strategy.md
│   │   ├── configurations/
│   │   │   └── namespace-setup.md
│   │   └── notes/
│   │       └── infrastructure-overview.md
│   └── security-robot/
│       ├── _index.md
│       └── ...
├── clients/
│   ├── touch365/
│   │   ├── _index.md
│   │   └── systems.md
│   └── ...
├── products/
│   └── ...
└── daily/
    ├── 2025-12-05.md
    └── 2025-12-06.md
```

### Appendix B: Example .palace.yaml

See Section 7.2 for complete example.

### Appendix C: Example Global Config

See Section 7.1 for complete example.

### Appendix D: Tool Quick Reference

| Tool | Purpose | Key Parameters |
|------|---------|----------------|
| `palace_store` | Store knowledge | title, content, intent |
| `palace_check` | Check existing | query, knowledge_type |
| `palace_read` | Read note | path OR title |
| `palace_improve` | Update note | path, improvement, mode |
| `palace_recall` | Search | query, filters |
| `palace_list` | List notes | path, filters |
| `palace_structure` | Vault structure | depth, path |
| `palace_vaults` | List vaults | - |
| `palace_standards` | Get standards | domain, binding |
| `palace_links` | Get links | path, direction |
| `palace_orphans` | Find orphans | type |
| `palace_related` | Find related | path, method |
| `palace_autolink` | Batch link | path, dry_run |
| `palace_query` | Property query | filters, sort |
| `palace_dataview` | DQL query | query, format |
| `palace_session` | Session mgmt | action |
| `palace_clarify` | Get questions | context, missing |

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 2.0.0-draft | 2025-12-06 | Claude/Adam | Initial v2.0 specification |

---

*End of Specification*
