# Example Vault Structure

This shows a recommended vault structure for Obsidian Palace MCP v2.0.

## Directory Structure

```
vault/
├── .palace.yaml                     # Vault configuration
├── .palace/                         # Palace data (auto-created)
│   └── index.sqlite                 # Search index
│
├── _templates/                      # Note templates (optional)
│   ├── technology-hub.md
│   ├── concept.md
│   ├── command.md
│   ├── decision.md
│   └── stub.md
│
├── technologies/                    # Layer 1: Technical Knowledge
│   ├── kubernetes/
│   │   ├── _index.md               # Hub note
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
│       └── _index.md               # Stub note
│
├── commands/                        # Layer 1: CLI Commands
│   ├── linux/
│   │   ├── _index.md
│   │   └── disk-management.md
│   └── git/
│       ├── _index.md
│       └── branching.md
│
├── standards/                       # Layer 2: Standards (ai_binding)
│   ├── git-workflow.md             # type: standard, ai_binding: required
│   ├── code-style/
│   │   ├── _index.md
│   │   ├── typescript.md
│   │   └── python.md
│   └── documentation.md
│
├── patterns/                        # Layer 2: Reusable Patterns
│   └── microservices/
│       ├── _index.md
│       ├── circuit-breaker.md
│       └── saga.md
│
├── research/                        # Layer 2: Research Findings
│   └── cloud-providers/
│       ├── _index.md
│       └── aws-vs-gcp.md
│
├── projects/                        # Layer 3: Contextual Knowledge
│   ├── project-alpha/
│   │   ├── _index.md               # Project hub
│   │   ├── decisions/
│   │   │   └── chose-kubernetes.md
│   │   ├── configurations/
│   │   │   └── namespace-setup.md
│   │   └── notes/
│   │       └── architecture-overview.md
│   └── project-beta/
│       └── _index.md
│
├── clients/                         # Layer 3: Client Knowledge
│   └── acme-corp/
│       ├── _index.md
│       └── systems.md
│
└── daily/                           # Session Logs
    ├── 2025-12-05.md
    └── 2025-12-06.md
```

## Note Types

### Hub Notes (`_index.md`)

Hub notes provide navigation to child notes:

```markdown
---
type: technology_hub
title: Kubernetes
domain: [containers, orchestration]
status: active
children_count: 12
---

# Kubernetes

Brief overview paragraph.

## Knowledge Map

### Concepts
- [[kubernetes/concepts/pods|Pods]]
- [[kubernetes/concepts/services|Services]]

### Networking
- [[kubernetes/networking/_index|Networking Hub]]

## Related

- [[docker/_index|Docker]]
```

### Atomic Notes

Focused notes with max 200 lines:

```markdown
---
type: concept
title: Kubernetes Pods
parent: "[[kubernetes/concepts/_index]]"
domain: [kubernetes]
status: active
---

# Kubernetes Pods

Focused content about pods...
```

### Standard Notes

Notes that AI must follow:

```markdown
---
type: standard
title: Git Workflow
ai_binding: required
applies_to: [all]
---

# Git Workflow Standard

Requirements that AI follows...
```

### Stub Notes

Placeholders for future documentation:

```markdown
---
type: technology
title: Terraform
status: stub
stub_context: "Mentioned in infrastructure planning"
---

# Terraform

*This is a stub note. It will be expanded when more information is available.*
```

## Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Directories | kebab-case | `kubernetes/`, `network-policies/` |
| Files | kebab-case | `pod-networking.md` |
| Hub files | `_index.md` | `kubernetes/_index.md` |
| Titles | Title Case | "Kubernetes Networking" |

## Knowledge Layers

### Layer 1: Technical (General)
- `technologies/` - Technology documentation
- `commands/` - CLI commands and scripts
- `reference/` - Quick reference material

**Rule:** Technical knowledge is NEVER project-specific. It belongs here.

### Layer 2: Domain (Reusable)
- `standards/` - Binding standards for AI
- `patterns/` - Reusable patterns
- `research/` - Research findings

**Rule:** Domain knowledge is reusable across projects.

### Layer 3: Contextual (Specific)
- `projects/` - Project decisions and configs
- `clients/` - Client-specific knowledge

**Rule:** Only project-specific content goes here. Technical knowledge should link FROM here to Layer 1/2.
