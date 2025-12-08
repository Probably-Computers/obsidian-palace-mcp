# AI Behavior Guide for Palace MCP

This guide defines the protocols and best practices for AI assistants using Obsidian Palace MCP as a knowledge store.

## Core Philosophy

### The Memory Palace Concept

The vault is not just file storage—it's a living knowledge graph that grows more intelligent over time. Every interaction with AI should potentially contribute to this collective intelligence.

### Always Learning Model

When Palace MCP is active, AI should continuously capture knowledge:

- Every research action → Store findings
- Every command explained → Document it
- Every decision made → Log it
- Every problem solved → Create troubleshooting note

### Key Principles

1. **Check before store** - Always check for existing knowledge before creating new
2. **Express intent, not location** - AI says WHAT, Palace decides WHERE
3. **Graph integrity** - Never create orphaned notes
4. **Follow standards** - Load and adhere to vault standards
5. **Atomic content** - Keep notes focused and linkable

---

## Session Protocols

### Session Start Protocol

When starting a conversation with Palace MCP active:

```
1. Load binding standards
   → palace_standards({ binding: 'required' })
   → Acknowledge standards before proceeding

2. Check vault structure
   → palace_structure({ depth: 2 })
   → Understand where things are

3. Optionally start a session
   → palace_session_start({ topic: "..." })
   → Track work in daily log
```

**Example Implementation:**

```javascript
// 1. Load required standards
const standards = await palace_standards({ binding: 'required' });

if (standards.acknowledgment_required) {
  // AI acknowledges: "I've loaded X standards that I'll follow during this session"
  console.log(standards.acknowledgment_message);
}

// 2. Understand structure
const structure = await palace_structure({ depth: 2 });

// 3. Start session if appropriate
await palace_session_start({ topic: "User's task description" });
```

### Session End Protocol

Before ending a conversation:

```
1. Review notes created/modified
2. Check for orphaned content
3. Log final session entry
```

---

## Knowledge Storage Protocol

### Check-Before-Store Pattern

**NEVER** create notes without first checking for existing knowledge:

```
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
│ STEP 2: Evaluate recommendation                             │
└─────────────────────────────────────────────────────────────┘
    │
    ├─► recommendation: 'reference_existing'
    │   → Just link to existing note, don't create new
    │
    ├─► recommendation: 'improve_existing'
    │   → Use palace_improve() to add new information
    │
    ├─► recommendation: 'expand_stub'
    │   → Use palace_store() with expand_if_stub: true
    │
    └─► recommendation: 'create_new'
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│ STEP 3: Ensure context is complete                          │
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
```

### Context Clarification Triggers

Use `palace_clarify` when context is incomplete:

| Missing Context | Detection | Question to Ask |
|-----------------|-----------|-----------------|
| Scope | Technical content + "our", "we", client names | "Is this general knowledge or specific to a project?" |
| Project | Scope is project-specific but no project identified | "Which project is this for?" |
| Technologies | Technical content with no tech references | "What technologies should I link this to?" |
| Domain | Can't determine categorization | "How should I categorize this?" |
| Client | Mentions company but unclear which | "Which client is this for?" |

**Example:**

```javascript
// AI detects incomplete context
const clarify = await palace_clarify({
  context: {
    title: "Database Optimization Tips",
    content_preview: "Here are some tips for optimizing our database queries..."
  },
  missing: ['scope', 'project', 'technologies']
});

// Present questions to user
for (const question of clarify.questions) {
  // AI asks: "Is this general knowledge that could apply anywhere,
  //          or is it specific to a particular project?"
}
```

---

## Knowledge Layer Model

### Three-Layer Architecture

AI must understand which layer knowledge belongs to:

```
┌─────────────────────────────────────────────────────────────┐
│  LAYER 1: Technical Knowledge                                │
│  ─────────────────────────────                               │
│  Location: technologies/, commands/, reference/              │
│  Scope: ALWAYS general, NEVER project-specific              │
│  Content: How things work, commands, APIs, configurations   │
├─────────────────────────────────────────────────────────────┤
│  LAYER 2: Domain Knowledge                                   │
│  ─────────────────────────────                               │
│  Location: standards/, patterns/, research/                  │
│  Scope: General, reusable across projects                   │
│  Content: Best practices, patterns, research findings       │
├─────────────────────────────────────────────────────────────┤
│  LAYER 3: Contextual Knowledge                               │
│  ─────────────────────────────                               │
│  Location: projects/, clients/, products/                    │
│  Scope: Specific to one project/client/product              │
│  Content: Decisions, configurations, context-specific notes │
└─────────────────────────────────────────────────────────────┘
```

### Layer Determination Rules

```javascript
function determineLayer(intent) {
  // Rule 1: Technical how-to → Layer 1
  if (['command', 'technology', 'reference'].includes(intent.knowledge_type)) {
    return 'technical';
  }

  // Rule 2: Standards and patterns → Layer 2
  if (['standard', 'pattern', 'research'].includes(intent.knowledge_type)) {
    return 'domain';
  }

  // Rule 3: Decisions and configurations → Layer 3
  if (['decision', 'configuration'].includes(intent.knowledge_type)) {
    return 'contextual';
  }

  // Rule 4: Explicit project scope → Layer 3
  if (intent.scope === 'project-specific') {
    return 'contextual';
  }

  // Default based on type
  return intent.knowledge_type === 'command' ? 'technical' : 'domain';
}
```

### Critical Rule: Never Trap Technical Knowledge

**WRONG:**
```markdown
projects/xlink/kubernetes-pods.md  ← Technical knowledge trapped in project
```

**RIGHT:**
```markdown
technologies/kubernetes/concepts/pods.md  ← General technical knowledge
projects/xlink/infrastructure.md          ← References [[kubernetes/concepts/pods]]
```

---

## Intent-Based Storage

### Express Intent, Not Location

AI should never specify file paths. Instead, express storage intent:

```javascript
// WRONG - Path-based
palace_remember({
  title: "Docker Bridge Networking",
  path: "commands/docker/networking",  // AI shouldn't decide this
  content: "..."
})

// RIGHT - Intent-based
palace_store({
  title: "Docker Bridge Networking",
  content: "...",
  intent: {
    knowledge_type: "command",
    domain: ["docker", "networking"],
    scope: "general"
  }
})
```

### Complete Intent Schema

```javascript
{
  intent: {
    // What kind of knowledge (required)
    knowledge_type: 'technology' | 'command' | 'reference' | 'standard' |
                    'pattern' | 'research' | 'decision' | 'configuration' |
                    'troubleshooting' | 'note',

    // Domain classification (required)
    domain: ["primary", "secondary"],

    // Scope (required)
    scope: 'general' | 'project-specific',

    // Context (when applicable)
    project: "project-name",
    client: "client-name",
    product: "product-name",

    // Graph connections
    technologies: ["tech1", "tech2"],  // Stubs created if missing
    references: ["existing/note"],      // Explicit links

    // Additional
    tags: ["tag1", "tag2"]
  }
}
```

---

## Graph Integrity

### Never Create Orphans

Every note should have connections. AI must:

1. **Specify technologies** - Creates links or stubs
2. **Add references** - Link to related notes
3. **Use retroactive linking** - Update existing notes

### Stub-and-Expand Pattern

When mentioning technologies that don't have notes:

```javascript
// AI stores a note mentioning "istio"
palace_store({
  title: "Service Mesh Setup",
  content: "We're using Istio for our service mesh...",
  intent: {
    knowledge_type: "technology",
    domain: ["kubernetes", "networking"],
    scope: "general",
    technologies: ["istio", "kubernetes"]  // Stub created for "istio" if missing
  }
})

// Later, when documenting Istio
palace_store({
  title: "Istio",
  content: "Comprehensive Istio documentation...",
  options: { expand_if_stub: true }  // Expands the stub
})
```

### Retroactive Linking

When creating new notes, Palace automatically:
- Scans existing notes for mentions of the new note's title
- Updates those notes with links to the new note

---

## Standards Compliance

### Loading Standards

AI must load required standards at session start:

```javascript
const standards = await palace_standards({ binding: 'required' });

if (standards.acknowledgment_required) {
  // AI must acknowledge before proceeding
}
```

### Following Standards

Standards with `ai_binding: required` must be followed. Example:

```markdown
---
type: standard
title: Git Workflow Standard
ai_binding: required
applies_to: [all]
---

## Requirements

- Use conventional commits format
- Include scope when applicable
- Never force push to main
```

When this standard is loaded, AI must follow these rules.

### Validating Compliance

After creating notes, optionally validate:

```javascript
const validation = await palace_standards_validate({
  path: "new-note.md"
});

if (!validation.compliant) {
  // Fix violations
}
```

---

## Atomic Note Protocol

### Size Limits

| Metric | Limit |
|--------|-------|
| Total lines | 200 |
| H2 sections | 6 |
| Section lines | 50 |

### Auto-Splitting

When content exceeds limits, Palace automatically splits into hub + children.

**Before:**
```markdown
# Kubernetes (500 lines)

## Pods (100 lines)
...

## Services (100 lines)
...

## Deployments (100 lines)
...
```

**After:**
```
kubernetes/
├── _index.md          # Hub note
├── pods.md            # Child note
├── services.md        # Child note
└── deployments.md     # Child note
```

### AI Guidance

- Don't worry about splitting - Palace handles it
- Focus on complete, well-structured content
- Use H2 sections for logical divisions

---

## Session Logging

### When to Log

Log significant actions to the session:

```javascript
// After storing knowledge
await palace_session_log({
  entry: "Documented Docker networking commands",
  notes_created: ["commands/docker/networking/bridge-networks.md"]
});

// After researching
await palace_session_log({
  entry: "Researched Kubernetes CNI options - Calico vs Cilium"
});

// After improving notes
await palace_session_log({
  entry: "Updated Kubernetes pods documentation with liveness probes",
  notes_improved: ["technologies/kubernetes/concepts/pods.md"]
});
```

---

## Best Practices Summary

### Do

- ✅ Check for existing knowledge before creating
- ✅ Express intent, not paths
- ✅ Specify technologies for graph connections
- ✅ Load and follow standards
- ✅ Log significant actions to session
- ✅ Ask for clarification when context is incomplete
- ✅ Keep technical knowledge in Layer 1 (general)

### Don't

- ❌ Create notes without checking first
- ❌ Specify file paths directly
- ❌ Create orphaned notes (no links)
- ❌ Trap technical knowledge in project folders
- ❌ Ignore binding standards
- ❌ Assume context when unclear

---

## Example Workflows

### Research Workflow

```javascript
// User asks: "How do I set up a Kubernetes ingress?"

// 1. Check existing knowledge
const check = await palace_check({
  query: "kubernetes ingress setup",
  knowledge_type: "technology"
});

if (check.recommendation === 'reference_existing') {
  // Return existing knowledge
  const note = await palace_read({ path: check.matches[0].path });
  // "Here's what we have documented..."
  return;
}

// 2. Research and gather information
// ... AI researches ...

// 3. Store new knowledge
await palace_store({
  title: "Kubernetes Ingress",
  content: "Comprehensive ingress documentation...",
  intent: {
    knowledge_type: "technology",
    domain: ["kubernetes", "networking"],
    scope: "general",
    technologies: ["kubernetes", "nginx-ingress"]
  }
});

// 4. Log to session
await palace_session_log({
  entry: "Documented Kubernetes Ingress setup",
  notes_created: ["technologies/kubernetes/networking/ingress.md"]
});
```

### Decision Documentation Workflow

```javascript
// User says: "We've decided to use Calico for our CNI in the Xlink project"

// 1. Check clarification needs (project context is clear)

// 2. Document the decision
await palace_store({
  title: "CNI Decision - Calico",
  content: `
## Decision

We will use Calico as our CNI plugin for the Xlink project.

## Rationale

- Network policy support
- BGP peering capability
- Performance characteristics

## Alternatives Considered

- Flannel: Simpler but lacks network policies
- Cilium: More features but higher complexity
`,
  intent: {
    knowledge_type: "decision",
    domain: ["kubernetes", "networking"],
    scope: "project-specific",
    project: "xlink",
    technologies: ["calico", "kubernetes"]
  }
});

// 3. Also ensure general Calico knowledge exists
const calicoCheck = await palace_check({ query: "calico" });

if (calicoCheck.recommendation === 'create_new') {
  // Create general Calico documentation (Layer 1)
  await palace_store({
    title: "Calico",
    content: "Calico is a CNI plugin for Kubernetes...",
    intent: {
      knowledge_type: "technology",
      domain: ["kubernetes", "networking", "cni"],
      scope: "general"
    }
  });
}
```

### Troubleshooting Workflow

```javascript
// User solved a problem

// 1. Document the troubleshooting note
await palace_store({
  title: "Pod CrashLoopBackOff",
  content: `
## Symptom

Pod continuously restarts with CrashLoopBackOff status.

## Diagnosis

1. Check pod logs: \`kubectl logs <pod>\`
2. Check events: \`kubectl describe pod <pod>\`
3. Common causes:
   - Application error
   - Missing config/secrets
   - Resource constraints

## Solution

[Solution details...]
`,
  intent: {
    knowledge_type: "troubleshooting",
    domain: ["kubernetes", "debugging"],
    scope: "general",
    technologies: ["kubernetes"]
  }
});
```
