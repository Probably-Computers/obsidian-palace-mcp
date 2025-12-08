# AI Behavior Guide for Palace MCP (Phase 017)

This guide defines the protocols and best practices for AI assistants using Obsidian Palace MCP as a knowledge store.

## Core Philosophy

### The Memory Palace Concept

The vault is not just file storage—it's a living knowledge graph that grows more intelligent over time. Every interaction with AI should potentially contribute to this collective intelligence.

### Topic-Based Architecture (Phase 017)

Palace uses a simple, intuitive topic-based model:

- **The topic/domain IS the folder path** - No complex type-to-folder mappings
- **Only 3 capture types** - source, knowledge, project
- **AI observes and adapts** - Understand existing vault structure before storing

### Always Learning Model

When Palace MCP is active, AI should continuously capture knowledge:

- Every research action → Store as knowledge
- Every source consulted → Capture as source
- Every project decision → Log as project context
- Every problem solved → Document for future reference

### Key Principles

1. **Observe before acting** - Understand vault structure first
2. **Check before store** - Always check for existing knowledge
3. **Express intent, not location** - AI says WHAT, Palace decides WHERE
4. **Use existing domains** - Don't create new top-level domains unnecessarily
5. **Graph integrity** - Create meaningful connections
6. **Follow standards** - Load and adhere to vault standards

---

## Capture Type Model (Phase 017)

### Three Simple Capture Types

```
┌─────────────────────────────────────────────────────────────┐
│  SOURCE CAPTURE                                              │
│  ─────────────────                                          │
│  What: Raw capture from a specific source                   │
│  Path: sources/{type}/{title}/                              │
│  Examples: Book notes, video summaries, article excerpts    │
├─────────────────────────────────────────────────────────────┤
│  KNOWLEDGE CAPTURE                                           │
│  ─────────────────                                          │
│  What: Processed, reusable knowledge about a topic          │
│  Path: {domain.join('/')}/  (topic IS the path)             │
│  Examples: How Docker works, Kubernetes networking          │
├─────────────────────────────────────────────────────────────┤
│  PROJECT CAPTURE                                             │
│  ─────────────────                                          │
│  What: Project or client specific context                   │
│  Path: projects/{project}/ or clients/{client}/             │
│  Examples: Architecture decisions, custom configurations    │
└─────────────────────────────────────────────────────────────┘
```

### Determining Capture Type

| Content Indicators | Capture Type |
|-------------------|--------------|
| "From the book...", "According to...", "The author says..." | source |
| "Our project...", "We decided...", "For this client..." | project |
| General how-to, technical reference, reusable patterns | knowledge |

### Domain-Based Path Resolution

For knowledge captures, the domain array directly becomes the folder path:

```javascript
// Domain: ["kubernetes", "networking", "cni"]
// Result: kubernetes/networking/cni/{title}.md

// Domain: ["docker", "images"]
// Result: docker/images/{title}.md
```

---

## Session Protocols

### Protocol 1: Observe Before Acting

Before storing any knowledge:

```javascript
// 1. Understand vault structure
const structure = await palace_structure({ depth: 3 });

// structure.domain_patterns shows:
// - top_level_domains: existing domains with note counts
// - special_folders: which special folders exist
// - suggestions: hints for domain placement

// 2. Check for existing knowledge
const check = await palace_check({ query: "topic being stored" });

// 3. Only then decide where to store
```

### Protocol 2: Ask Before Creating New Top-Level Domains

```
IF creating content for a domain that doesn't exist:
1. Check if it truly doesn't fit existing domains
2. Look at domain_patterns.suggestions in palace_structure
3. If creating new top-level domain, inform user:
   "I'd like to create a new top-level domain 'gardening' for this knowledge.
   Is that okay, or should I place this under an existing domain?"
```

### Session Start Protocol

When starting a conversation with Palace MCP active:

```javascript
// 1. Load required standards
const standards = await palace_standards({ binding: 'required' });

if (standards.acknowledgment_required) {
  // AI acknowledges: "I've loaded X standards that I'll follow"
  console.log(standards.acknowledgment_message);
}

// 2. Understand structure and existing domains
const structure = await palace_structure({ depth: 3 });
// Note: structure.domain_patterns.top_level_domains lists existing domains

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
│ STEP 1: Understand structure                                 │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
palace_structure({ depth: 3 })
    │  → See existing domains
    │  → Understand organization
    ▼
┌─────────────────────────────────────────────────────────────┐
│ STEP 2: Check for existing knowledge                         │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
palace_check({
  query: "topic being stored",
  domain: ["likely", "domain"]  // Optional filter
})
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ STEP 3: Follow recommendation                                │
└─────────────────────────────────────────────────────────────┘
    │
    ├─► 'reference_existing'
    │   → Just link to existing note, don't create new
    │
    ├─► 'improve_existing'
    │   → Use palace_improve() to add new information
    │
    ├─► 'expand_stub'
    │   → Use palace_improve() with mode: 'replace' on stub
    │
    └─► 'create_new'
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│ STEP 4: Use suggested domain                                 │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
    check.suggestions.suggested_domains[0]?.path
        │
        ├─► Domain exists → Use it
        │
        └─► New domain → Confirm with user if top-level
```

### Context Clarification Triggers

Use `palace_clarify` when context is incomplete:

| Missing Context | Detection | Question to Ask |
|-----------------|-----------|-----------------|
| Capture Type | Unclear if source, knowledge, or project | "Is this from a specific source, general knowledge, or project-specific?" |
| Domain | Can't determine topic hierarchy | "What topic area does this belong to?" |
| Project | capture_type is 'project' but no project identified | "Which project is this for?" |
| Source Info | capture_type is 'source' but missing details | "What's the source? (book, article, video, etc.)" |
| Client | Mentions company but unclear which | "Which client is this for?" |

**Example:**

```javascript
// AI detects incomplete context
const clarify = await palace_clarify({
  context: {
    title: "Database Optimization Tips",
    content_preview: "Here are some tips for optimizing our database queries..."
  },
  missing: ['capture_type', 'domain', 'project']
});

// Use detected values
// clarify.detected.capture_type.likely = 'project' (detected "our")
// clarify.detected.domains = ['database', 'optimization']
// clarify.questions = questions to ask user
```

---

## Source vs Knowledge Distinction

### Protocol 3: Source vs Knowledge

```
SOURCE CAPTURE:
- Tied to specific source (book, video, article)
- Contains quotes, references, attributions
- Path: sources/{type}/{title}/

KNOWLEDGE CAPTURE:
- Processed, in your own words
- Reusable, general applicability
- Path: {domain.join('/')}/
```

**Example - Source Capture:**

```javascript
palace_store({
  title: "Chapter 5 - Networking",
  content: "Key insights from chapter 5...",
  intent: {
    capture_type: "source",
    domain: ["kubernetes"],  // Topic relevance
    source: {
      type: "book",
      title: "Kubernetes in Action",
      author: "Marko Luksa"
    }
  }
})
// Creates: sources/book/kubernetes-in-action/chapter-5-networking.md
```

**Example - Knowledge Capture:**

```javascript
palace_store({
  title: "Kubernetes Pod Networking",
  content: "Pods communicate via the CNI...",  // In your own words
  intent: {
    capture_type: "knowledge",
    domain: ["kubernetes", "networking"]
  }
})
// Creates: kubernetes/networking/kubernetes-pod-networking.md
```

---

## Intent-Based Storage

### Express Intent, Not Location

AI should never specify file paths. Instead, express storage intent:

```javascript
// WRONG - Path-based
{
  path: "technologies/docker/networking"  // AI shouldn't decide this
}

// RIGHT - Intent-based (Phase 017)
{
  intent: {
    capture_type: "knowledge",
    domain: ["docker", "networking"]  // Domain becomes path
  }
}
```

### Complete Intent Schema

```javascript
{
  intent: {
    // What kind of capture (required)
    capture_type: 'source' | 'knowledge' | 'project',

    // Topic hierarchy - THIS IS THE FOLDER PATH (required)
    domain: ["primary", "subtopic", "sub-subtopic"],

    // For source captures (required when capture_type is 'source')
    source: {
      type: 'book' | 'video' | 'article' | 'podcast' | 'conversation' | 'documentation' | 'other',
      title: "Source Title",
      author: "Author Name",  // optional
      url: "https://...",     // optional
      date: "2024-01-15"      // optional
    },

    // For project captures (required when capture_type is 'project')
    project: "project-name",
    client: "client-name",  // Alternative to project

    // Graph connections
    references: ["existing/note"],  // Explicit links to create

    // Additional
    tags: ["tag1", "tag2"]
  }
}
```

---

## Graph Integrity

### Never Create Orphans

Every note should have connections. AI must:

1. **Use references** - Link to related notes
2. **Enable retroactive linking** - Update existing notes
3. **Create meaningful stubs** - For unresolved references

### Protocol 4: One Concept Per Note

```
Each note covers ONE concept.
Multi-concept content → hub + atomic notes (Palace handles automatically)
```

### Protocol 5: Organic Connections

```
Look for related concepts, create meaningful links.
Don't over-link. Let patterns emerge naturally.
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
```

**After:**
```
kubernetes/
├── _index.md          # Hub note with overview
├── pods.md            # Child note
└── services.md        # Child note
```

### AI Guidance

- Don't worry about splitting - Palace handles it
- Focus on complete, well-structured content
- Use H2 sections for logical divisions

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

Standards with `ai_binding: required` must be followed.

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

## Session Logging

### When to Log

Log significant actions to the session:

```javascript
// After storing knowledge
await palace_session_log({
  entry: "Documented Docker networking concepts",
  notes_created: ["docker/networking/bridge-networks.md"]
});

// After researching
await palace_session_log({
  entry: "Researched Kubernetes CNI options - Calico vs Cilium"
});
```

---

## Best Practices Summary

### Do

- ✅ Observe vault structure before storing (palace_structure)
- ✅ Check for existing knowledge before creating (palace_check)
- ✅ Use suggested domains from palace_check
- ✅ Express intent with capture_type and domain, not paths
- ✅ Distinguish source captures from knowledge captures
- ✅ Confirm before creating new top-level domains
- ✅ Load and follow standards
- ✅ Log significant actions to session

### Don't

- ❌ Create notes without checking first
- ❌ Specify file paths directly
- ❌ Create orphaned notes (no links)
- ❌ Mix source content with knowledge content
- ❌ Create new top-level domains without user confirmation
- ❌ Ignore binding standards
- ❌ Assume context when unclear

---

## Example Workflows

### Research Workflow

```javascript
// User asks: "How do I set up a Kubernetes ingress?"

// 1. Understand vault structure
const structure = await palace_structure({ depth: 3 });
// See existing domains: kubernetes, docker, networking, etc.

// 2. Check existing knowledge
const check = await palace_check({
  query: "kubernetes ingress setup",
  domain: ["kubernetes"]
});

if (check.recommendation === 'reference_existing') {
  // Return existing knowledge
  const note = await palace_read({ path: check.matches[0].path });
  return; // "Here's what we have documented..."
}

// 3. Research and gather information
// ... AI researches ...

// 4. Store new knowledge (use suggested domain)
const suggestedDomain = check.suggestions.suggested_domains[0]?.path
  || ["kubernetes", "networking"];

await palace_store({
  title: "Kubernetes Ingress",
  content: "Comprehensive ingress documentation...",
  intent: {
    capture_type: "knowledge",
    domain: suggestedDomain,
    tags: ["networking", "ingress"]
  }
});

// 5. Log to session
await palace_session_log({
  entry: "Documented Kubernetes Ingress setup",
  notes_created: ["kubernetes/networking/kubernetes-ingress.md"]
});
```

### Source Capture Workflow

```javascript
// User is reading a book and wants to capture notes

await palace_store({
  title: "Chapter 3 - Container Orchestration",
  content: `
## Key Points

- Kubernetes manages container lifecycle
- Pods are the smallest deployable unit
- Services provide stable networking

## Quotes

> "The scheduler is the brain of Kubernetes" - p.45
`,
  intent: {
    capture_type: "source",
    domain: ["containers", "orchestration"],
    source: {
      type: "book",
      title: "Cloud Native Infrastructure",
      author: "Justin Garrison"
    }
  }
});
// Creates: sources/book/cloud-native-infrastructure/chapter-3-container-orchestration.md
```

### Project Decision Workflow

```javascript
// User says: "We've decided to use Calico for our CNI in the Xlink project"

// 1. Document the project-specific decision
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
    capture_type: "project",
    domain: ["infrastructure", "networking"],
    project: "xlink",
    tags: ["decision", "cni"]
  }
});
// Creates: projects/xlink/cni-decision-calico.md

// 2. Ensure general Calico knowledge exists
const calicoCheck = await palace_check({ query: "calico cni" });

if (calicoCheck.recommendation === 'create_new') {
  // Create general knowledge (not project-specific)
  await palace_store({
    title: "Calico",
    content: "Calico is a CNI plugin for Kubernetes...",
    intent: {
      capture_type: "knowledge",
      domain: ["kubernetes", "networking", "cni"]
    }
  });
}
```

### Troubleshooting Workflow

```javascript
// User solved a problem - capture it

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
    capture_type: "knowledge",
    domain: ["kubernetes", "troubleshooting"],
    tags: ["debugging", "pods"]
  }
});
// Creates: kubernetes/troubleshooting/pod-crashloopbackoff.md
```
