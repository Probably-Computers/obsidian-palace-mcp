# Palace MCP API Reference

This document provides complete API documentation for all Obsidian Palace MCP tools.

## Response Format

All tools return a consistent response format:

```typescript
interface ToolResult<T> {
  success: boolean;
  data?: T;           // Present when success=true
  error?: string;     // Present when success=false
  code?: string;      // Error code when success=false
}
```

## Error Codes

| Code | Description |
|------|-------------|
| `VALIDATION_ERROR` | Input validation failed |
| `NOT_FOUND` | Note or resource not found |
| `READONLY_VAULT` | Write attempted on read-only vault |
| `PATH_CONFLICT` | Path already exists |
| `STORE_ERROR` | Error during storage operation |
| `CHECK_ERROR` | Error during check operation |
| `IMPROVE_ERROR` | Error during improve operation |
| `UNKNOWN_TOOL` | Tool name not recognized |

---

## Core Types (Phase 017)

### CaptureType

```typescript
type CaptureType = 'source' | 'knowledge' | 'project';
```

- **source**: Raw capture from a specific source (book, video, article, podcast, etc.)
- **knowledge**: Processed, reusable knowledge about a topic
- **project**: Project or client-specific context

### StorageIntent

```typescript
interface StorageIntent {
  capture_type: CaptureType;           // What kind of capture
  domain: string[];                     // Topic hierarchy - THIS IS THE FOLDER PATH
  source?: SourceInfo;                  // Required when capture_type is 'source'
  project?: string;                     // Project context (for project captures)
  client?: string;                      // Client context (optional)
  references?: string[];                // Explicit links to create
  note_type?: string;                   // Optional frontmatter hint
  tags?: string[];                      // Additional tags
}
```

### SourceInfo

```typescript
interface SourceInfo {
  type: 'book' | 'video' | 'article' | 'podcast' | 'conversation' | 'documentation' | 'other';
  title: string;
  author?: string;
  url?: string;
  date?: string;
}
```

### Path Resolution Rules

| Capture Type | Path Format |
|--------------|-------------|
| `knowledge` | `{domain.join('/')}/` (topic IS the path) |
| `source` | `sources/{source.type}/{source.title}/` |
| `project` | `projects/{project}/` or `clients/{client}/` |

---

## Core Tools

### palace_store

Store new knowledge using intent-based resolution. AI expresses WHAT to store, Palace determines WHERE based on domain.

**Input Schema:**

```typescript
{
  title: string;                    // Note title (required)
  content: string;                  // Content in markdown (required)
  intent: {                         // Storage intent (required)
    capture_type:                   // What kind of capture
      | 'source'                    // From a specific source
      | 'knowledge'                 // Processed, reusable knowledge
      | 'project';                  // Project-specific context
    domain: string[];               // Topic hierarchy - becomes folder path
    source?: {                      // Required for 'source' capture
      type: 'book' | 'video' | 'article' | 'podcast' | 'conversation' | 'documentation' | 'other';
      title: string;
      author?: string;
      url?: string;
      date?: string;
    };
    project?: string;               // Project name (for project captures)
    client?: string;                // Client name (optional)
    references?: string[];          // Explicit links to create
    note_type?: string;             // Optional frontmatter hint
    tags?: string[];                // Additional tags
  };
  options?: {
    vault?: string;                 // Vault alias (default: default vault)
    create_stubs?: boolean;         // Create stubs for references (default: true)
    retroactive_link?: boolean;     // Update existing notes with links (default: true)
    dry_run?: boolean;              // Preview without saving (default: false)
    autolink?: boolean;             // Auto-link to existing notes (default: true)
    force_atomic?: boolean;         // Skip atomic splitting (default: false)
    confirm_new_domain?: boolean;   // Require confirmation for new domains (default: true)
  };
  source?: {
    origin?: string;                // Origin: ai:research, ai:artifact, human, web:url
    confidence?: number;            // Confidence 0-1
  };
}
```

**Output Schema:**

```typescript
{
  success: boolean;
  vault: string;
  vaultPath: string;
  created: {
    path: string;
    title: string;
    type: 'atomic' | 'hub';
  };
  domain: {
    path: string;                   // The domain path used
    is_new: boolean;                // Whether this is a new domain
    level: number;                  // Domain depth (1 = top-level)
  };
  split_result?: {                  // If content was split
    hub_path: string;
    children_paths: string[];
    children_count: number;
  };
  stubs_created?: string[];         // Stub paths created
  links_added?: {
    to_existing: string[];
    from_existing: string[];
  };
  message: string;
}
```

**Example - Knowledge Capture:**

```javascript
palace_store({
  title: "Kubernetes Pod Networking",
  content: "Pods communicate via the CNI (Container Network Interface)...",
  intent: {
    capture_type: "knowledge",
    domain: ["kubernetes", "networking"],
    tags: ["containers", "cni"]
  },
  source: {
    origin: "ai:research",
    confidence: 0.85
  }
})
// Creates: kubernetes/networking/kubernetes-pod-networking.md
```

**Example - Source Capture:**

```javascript
palace_store({
  title: "Chapter 5 Notes",
  content: "Key insights from chapter 5...",
  intent: {
    capture_type: "source",
    domain: ["containers"],
    source: {
      type: "book",
      title: "Kubernetes in Action",
      author: "Marko Luksa"
    }
  }
})
// Creates: sources/book/kubernetes-in-action/chapter-5-notes.md
```

**Example - Project Capture:**

```javascript
palace_store({
  title: "Database Selection Decision",
  content: "We chose PostgreSQL for the following reasons...",
  intent: {
    capture_type: "project",
    domain: ["architecture"],
    project: "myapp"
  }
})
// Creates: projects/myapp/database-selection-decision.md
```

---

### palace_check

Check for existing knowledge before creating new notes. Returns domain suggestions for organizing new knowledge.

**Input Schema:**

```typescript
{
  query: string;                    // Topic to search for (required)
  domain?: string[];                // Filter by domain (optional)
  include_stubs?: boolean;          // Include stubs (default: true)
  vault?: string;                   // Vault alias
}
```

**Output Schema:**

```typescript
{
  found: boolean;
  vault: string;
  vaultPath: string;
  matches: Array<{
    path: string;
    vault: string;
    title: string;
    status: 'active' | 'stub';
    confidence: number;
    relevance: number;              // Search relevance score
    summary: string;
    last_modified: string;
    domain?: string[];              // The domain path of the match
  }>;
  suggestions: {
    should_expand_stub: boolean;
    stub_path?: string;
    similar_titles: string[];
    suggested_domains: Array<{      // Domain suggestions for new knowledge
      path: string[];               // Suggested domain path
      confidence: number;
      reason: string;
      exists: boolean;              // Whether domain exists
      note_count?: number;
    }>;
  };
  recommendation:
    | 'create_new'                  // No matches, create new
    | 'expand_stub'                 // Found stub, expand it
    | 'improve_existing'            // Good match, improve it
    | 'reference_existing';         // Exact match, just reference
}
```

**Example:**

```javascript
palace_check({
  query: "kubernetes networking",
  domain: ["kubernetes"]
})
// Returns matches and suggests domain: ["kubernetes", "networking"]
```

---

### palace_read

Read a specific note's content.

**Input Schema:**

```typescript
{
  path?: string;                    // Path to note (relative to vault)
  title?: string;                   // Find by title (alternative to path)
  vault?: string;                   // Vault alias
  include_children?: boolean;       // Include child summaries for hubs
}
```

**Output Schema:**

```typescript
{
  success: boolean;
  vault: string;
  path: string;
  title: string;
  frontmatter: object;              // Note metadata
  content: string;                  // Note content
  children?: Array<{                // If hub note
    path: string;
    title: string;
    summary: string;
  }>;
  links: {
    incoming: number;
    outgoing: number;
  };
}
```

**Example:**

```javascript
palace_read({
  path: "kubernetes/networking/pods.md"
})
```

---

### palace_improve

Intelligently update existing notes with multiple modes.

**Input Schema:**

```typescript
{
  path: string;                     // Path to note (required)
  mode:                             // Update mode (required)
    | 'append'                      // Add to end
    | 'append_section'              // Add as new H2 section
    | 'update_section'              // Update specific section
    | 'merge'                       // Intelligent merge
    | 'replace'                     // Full replacement
    | 'frontmatter';                // Metadata only
  content?: string;                 // New content (not for frontmatter mode)
  section?: string;                 // Section name for update_section
  frontmatter?: object;             // Frontmatter updates (merged)
  autolink?: boolean;               // Auto-link new content (default: true)
  author?: string;                  // Author for tracking (e.g., "ai:claude")
  vault?: string;                   // Vault alias
}
```

**Output Schema:**

```typescript
{
  success: boolean;
  vault: string;
  vaultPath: string;
  path: string;
  mode: string;
  version: number;                  // New version number
  changes: {
    lines_added?: number;
    lines_removed?: number;
    sections_modified?: string[];
    links_added?: number;
    frontmatter_updated?: string[];
    atomic_warning?: string;        // If exceeds atomic limits
  };
  message: string;
}
```

**Example:**

```javascript
palace_improve({
  path: "kubernetes/networking/pods.md",
  mode: "append_section",
  content: "## Service Discovery\n\nKubernetes provides built-in DNS...",
  author: "ai:claude"
})
```

---

### palace_recall

Search across the vault using full-text search with FTS5 BM25 ranking.

**Input Schema:**

```typescript
{
  query: string;                    // Search query (required)
  type?: string | 'all';            // Filter by capture_type
  tags?: string[];                  // Filter by tags (AND logic)
  path?: string;                    // Filter by path prefix
  min_confidence?: number;          // Minimum confidence (0-1)
  limit?: number;                   // Max results (default: 10)
  include_content?: boolean;        // Include full content (default: true)
  vault?: string;                   // Vault alias
}
```

**Output Schema:**

```typescript
{
  success: boolean;
  vault: string;
  total: number;
  results: Array<{
    path: string;
    title: string;
    score: number;                  // Relevance score
    frontmatter: object;
    content?: string;
    snippet?: string;
  }>;
}
```

**Example:**

```javascript
palace_recall({
  query: "kubernetes service mesh",
  type: "knowledge",
  tags: ["networking"],
  limit: 5
})
```

---

## Structure & Navigation Tools

### palace_list

List notes in a directory with optional filtering.

**Input Schema:**

```typescript
{
  path?: string;                    // Directory path (default: root)
  type?: string;                    // Filter by capture_type
  recursive?: boolean;              // Include subdirectories (default: false)
  limit?: number;                   // Max results (default: 50)
  vault?: string;                   // Vault alias
}
```

**Output Schema:**

```typescript
{
  success: boolean;
  vault: string;
  path: string;
  notes: Array<{
    path: string;
    title: string;
    type: string;
    modified: string;
  }>;
  total: number;
}
```

---

### palace_structure

Get vault directory tree structure with domain pattern analysis. Essential for understanding vault organization before storing knowledge.

**Input Schema:**

```typescript
{
  path?: string;                    // Starting path (default: root)
  depth?: number;                   // Max depth (default: 3, max: 10)
  vault?: string;                   // Vault alias
}
```

**Output Schema:**

```typescript
{
  success: boolean;
  vault: string;
  vaultPath: string;
  path: string;
  depth: number;
  stats: {
    files: number;
    directories: number;
  };
  tree: string;                     // Formatted tree view
  entries: DirectoryEntry[];        // Raw structure for programmatic use
  domain_patterns: {                // Phase 017 domain analysis
    top_level_domains: Array<{
      name: string;
      totalNotes: number;
      depth: number;
    }>;
    all_domains: Array<{
      path: string;
      level: number;
      note_count: number;
      has_hub: boolean;
      subdomains: string[];
    }>;
    special_folders: {
      sources: boolean;
      projects: boolean;
      clients: boolean;
      daily: boolean;
      standards: boolean;
    };
    suggestions: {
      existing_domains: string[];
      hint: string;
    };
  };
}
```

**Example:**

```javascript
palace_structure({
  depth: 3
})
// Returns tree structure plus domain analysis:
// - Top-level domains: kubernetes, docker, networking
// - Each with note counts, depths, and subdomain info
// - Suggestions for where to place new knowledge
```

---

### palace_vaults

List all configured vaults with their details.

**Input Schema:**

```typescript
{
  include_counts?: boolean;         // Include note counts (default: false)
  include_config?: boolean;         // Include config details (default: false)
}
```

**Output Schema:**

```typescript
{
  success: boolean;
  vaults: Array<{
    alias: string;
    path: string;
    mode: 'rw' | 'ro';
    is_default: boolean;
    note_count?: number;
    config?: object;
  }>;
  cross_vault_search: boolean;
  default_vault: string;
}
```

---

## Graph Intelligence Tools

### palace_links

Get incoming (backlinks) and outgoing links for a note with multi-hop traversal.

**Input Schema:**

```typescript
{
  path: string;                     // Note path (required)
  direction?: 'incoming' | 'outgoing' | 'both';  // Default: both
  depth?: number;                   // Traversal depth 1-5 (default: 1)
  vault?: string;                   // Vault alias
}
```

**Output Schema:**

```typescript
{
  success: boolean;
  vault: string;
  path: string;
  incoming: Array<{
    path: string;
    title: string;
    depth: number;
    link_text?: string;
  }>;
  outgoing: Array<{
    path: string;
    title: string;
    depth: number;
    link_text?: string;
  }>;
  stats: {
    incoming_count: number;
    outgoing_count: number;
  };
}
```

---

### palace_orphans

Find orphan notes with missing link connections.

**Input Schema:**

```typescript
{
  type?: 'no_incoming' | 'no_outgoing' | 'isolated';  // Default: isolated
  path?: string;                    // Limit to directory
  limit?: number;                   // Max results (default: 50)
  vault?: string;                   // Vault alias
}
```

**Output Schema:**

```typescript
{
  success: boolean;
  vault: string;
  orphans: Array<{
    path: string;
    title: string;
    type: string;
    orphan_type: string;
  }>;
  total: number;
}
```

---

### palace_related

Find notes related to a given note by shared links or tags.

**Input Schema:**

```typescript
{
  path: string;                     // Source note (required)
  method?: 'links' | 'tags' | 'both';  // Default: both
  limit?: number;                   // Max results (default: 10)
  vault?: string;                   // Vault alias
}
```

**Output Schema:**

```typescript
{
  success: boolean;
  vault: string;
  path: string;
  related: Array<{
    path: string;
    title: string;
    relevance: number;
    shared_links?: string[];
    shared_tags?: string[];
  }>;
}
```

---

### palace_autolink

Scan content and automatically insert wiki-links for mentions of existing note titles.

**Input Schema:**

```typescript
{
  path?: string;                    // Note or directory (default: entire vault)
  dry_run?: boolean;                // Preview only (default: true)
  min_title_length?: number;        // Min title length to match (default: 3)
  exclude_paths?: string[];         // Paths to skip
  include_aliases?: boolean;        // Include note aliases (default: true)
  vault?: string;                   // Vault alias
}
```

**Output Schema:**

```typescript
{
  success: boolean;
  vault: string;
  dry_run: boolean;
  results: Array<{
    path: string;
    links_added: number;
    matches: string[];
  }>;
  total_links_added: number;
  notes_processed: number;
}
```

---

## Query Tools

### palace_query

Query notes by properties without full-text search.

**Input Schema:**

```typescript
{
  type?: string | 'all';            // Capture type filter
  tags?: string[];                  // Must have ALL tags
  path?: string;                    // Path prefix filter
  source?: string;                  // Source filter
  min_confidence?: number;
  max_confidence?: number;
  verified?: boolean;
  created_after?: string;           // ISO date
  created_before?: string;
  modified_after?: string;
  modified_before?: string;
  sort_by?: 'created' | 'modified' | 'title' | 'confidence';
  sort_order?: 'asc' | 'desc';
  limit?: number;                   // Default: 20
  offset?: number;                  // For pagination
  vault?: string;
}
```

**Output Schema:**

```typescript
{
  success: boolean;
  vault: string;
  total: number;
  results: Array<{
    path: string;
    title: string;
    type: string;
    frontmatter: object;
  }>;
}
```

---

### palace_dataview

Execute Dataview Query Language (DQL) queries.

**Input Schema:**

```typescript
{
  query: string;                    // DQL query (required)
  format?: 'table' | 'list' | 'task' | 'json';  // Default: json
  vault?: string;
}
```

**Supported DQL Syntax:**

- Query types: `TABLE`, `LIST`, `TASK`
- Clauses: `FROM`, `WHERE`, `SORT`, `LIMIT`
- Operators: `=`, `!=`, `>`, `<`, `>=`, `<=`, `AND`, `OR`
- Functions: `contains(field, value)`

**Example Queries:**

```dataview
TABLE title, confidence FROM "kubernetes" WHERE status = "stub" SORT confidence DESC
LIST FROM "sources" WHERE contains(tags, "networking")
TABLE title, capture_type WHERE confidence > 0.8 SORT modified DESC LIMIT 10
```

**Output Schema:**

```typescript
{
  success: boolean;
  vault: string;
  query_type: string;
  fields: string[];
  results: Array<object>;           // Format depends on query type
  total: number;
}
```

---

## Standards & AI Support Tools

### palace_standards

Load binding standards that AI should follow.

**Input Schema:**

```typescript
{
  domain?: string[];                // Filter by domain
  applies_to?: string;              // Filter by what it applies to
  binding?: 'required' | 'recommended' | 'optional' | 'all';
  vault?: string;
  include_content?: boolean;        // Include full content (default: true)
}
```

**Output Schema:**

```typescript
{
  success: boolean;
  vault: string;
  standards: Array<{
    path: string;
    vault: string;
    title: string;
    binding: 'required' | 'recommended' | 'optional';
    applies_to: string[];
    content: string;
    summary: string;
  }>;
  acknowledgment_required: boolean;
  acknowledgment_message?: string;
}
```

---

### palace_standards_validate

Validate a note against applicable standards.

**Input Schema:**

```typescript
{
  path: string;                     // Note path to validate (required)
  vault?: string;
  standards?: string[];             // Specific standards to check
}
```

**Output Schema:**

```typescript
{
  success: boolean;
  vault: string;
  path: string;
  compliant: boolean;
  violations: Array<{
    standard: string;
    requirement: string;
    actual: string;
  }>;
  warnings: string[];
  checked_against: string[];
}
```

---

### palace_clarify

Detect context and generate clarifying questions when storage intent is incomplete.

**Input Schema:**

```typescript
{
  context: {
    title: string;                  // Note title (required)
    content_preview: string;        // First 500 chars (required)
    detected_technologies?: string[];
    detected_context?: {
      possible_projects?: string[];
      possible_clients?: string[];
    };
  };
  missing?: Array<'capture_type' | 'domain' | 'project' | 'client' | 'source_info'>;
  vault?: string;
}
```

**Output Schema:**

```typescript
{
  success: boolean;
  vault: string;
  vaultPath: string;
  detected: {
    capture_type: {
      likely: 'source' | 'knowledge' | 'project';
      confidence: number;
      indicators: string[];
    };
    domains: Array<{
      name: string;
      confidence: number;
      exists_in_vault: boolean;
      note_count?: number;
    }>;
    projects: Array<{
      name: string;
      confidence: number;
      path?: string;
    }>;
    clients: Array<{
      name: string;
      confidence: number;
      path?: string;
    }>;
  };
  questions: Array<{
    key: string;
    question: string;
    type: 'choice' | 'confirm' | 'text';
    options?: string[];
    detected_hints?: string[];
    default?: string;
  }>;
  suggestions: {
    capture_type?: 'source' | 'knowledge' | 'project';
    domain?: string[];
    project?: string;
    client?: string;
  };
  confidence: {
    overall: number;
    per_field: Record<string, number>;
  };
  message: string;
}
```

**Example:**

```javascript
palace_clarify({
  context: {
    title: "Docker Networking",
    content_preview: "Docker uses bridge networking by default..."
  },
  missing: ["domain"]
})
// Returns detected capture_type: "knowledge"
// Suggests domain: ["docker", "networking"]
```

---

## Session Tools

### palace_session_start

Start a new work session in today's daily log.

**Input Schema:**

```typescript
{
  topic: string;                    // Session topic (required)
  context?: string;                 // Additional context
  vault?: string;
}
```

**Output Schema:**

```typescript
{
  success: boolean;
  vault: string;
  session_id: string;
  log_path: string;
  topic: string;
  started_at: string;
}
```

---

### palace_session_log

Add an entry to the current session.

**Input Schema:**

```typescript
{
  entry: string;                    // What happened/learned (required)
  notes_created?: string[];         // Paths of notes created
  vault?: string;
}
```

**Output Schema:**

```typescript
{
  success: boolean;
  vault: string;
  log_path: string;
  entry_added: {
    timestamp: string;
    content: string;
  };
}
```

---

## Workflow Examples

### Check-Before-Store Pattern (Phase 017)

```javascript
// 1. Understand vault structure
const structure = palace_structure({ depth: 3 });
// See existing domains: kubernetes, docker, networking, etc.

// 2. Check for existing knowledge
const check = palace_check({
  query: "kubernetes pod networking",
  domain: ["kubernetes"]
});

// 3. Based on recommendation and domain suggestions
if (check.recommendation === 'create_new') {
  // Use suggested domain from check
  const suggestedDomain = check.suggestions.suggested_domains[0]?.path;

  palace_store({
    title: "Pod Network Model",
    content: "...",
    intent: {
      capture_type: "knowledge",
      domain: suggestedDomain || ["kubernetes", "networking"]
    }
  });
} else if (check.recommendation === 'expand_stub') {
  palace_improve({
    path: check.suggestions.stub_path,
    mode: "replace",
    content: "..."
  });
} else if (check.recommendation === 'improve_existing') {
  palace_improve({
    path: check.matches[0].path,
    mode: "append_section",
    content: "..."
  });
}
```

### Source Capture Workflow

```javascript
// Capturing notes from a book
palace_store({
  title: "Chapter 3 - Container Orchestration",
  content: "Key points:\n- Kubernetes manages container lifecycle...",
  intent: {
    capture_type: "source",
    domain: ["containers", "orchestration"],
    source: {
      type: "book",
      title: "Cloud Native Infrastructure",
      author: "Justin Garrison"
    }
  }
})
// Creates: sources/book/cloud-native-infrastructure/chapter-3-container-orchestration.md
```

### Session Workflow

```javascript
// 1. Start session
palace_session_start({ topic: "Kubernetes networking research" });

// 2. Research and store knowledge
palace_store({
  title: "CNI Plugins Overview",
  content: "...",
  intent: { capture_type: "knowledge", domain: ["kubernetes", "networking", "cni"] }
});
palace_session_log({ entry: "Documented CNI plugins", notes_created: ["kubernetes/networking/cni/cni-plugins-overview.md"] });

// 3. Continue research
palace_store({ ... });
palace_session_log({ entry: "Added network policy examples" });
```

### Standards-Aware Workflow

```javascript
// 1. Load required standards at session start
const standards = palace_standards({ binding: 'required' });

// 2. Acknowledge standards
console.log(standards.acknowledgment_message);

// 3. Work following standards...

// 4. Validate compliance
palace_standards_validate({ path: "kubernetes/pods.md" });
```
