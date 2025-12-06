# Phase 014: AI Support Tools

**Status**: Planning
**Start Date**: TBD
**Target Completion**: TBD
**Owner**: TBD

## Objectives

- Provide tools to help AI maintain graph integrity
- Enable AI to request missing context from users
- Implement context detection heuristics
- Support the "Always Learning" AI behavior model
- Help AI ask the right clarifying questions

## Prerequisites

- [x] Phase 008 completed (Multi-Vault Configuration)
- [ ] Phase 009 completed (Multi-Vault Tool Integration)
- [ ] Phase 010 completed (Multi-Vault Index & Search)
- [ ] Phase 011 completed (Intent-Based Storage)
- [ ] Phase 012 completed (Atomic Note System)
- [ ] Phase 013 completed (Standards System)
- [ ] Storage intent schema finalized

## Scope

### In Scope

- `palace_clarify` tool for context gathering
- Context detection heuristics
- Missing context identification
- Question generation for AI
- Technology detection in content
- Project/client detection in content

### Out of Scope

- Natural language understanding
- ML-based context inference
- Automatic question answering
- User interface for questions

## Tasks

### Context Detector

- [ ] Create src/services/ai-support/context-detector.ts
  - [ ] detectTechnologies(content) - Find tech mentions
  - [ ] detectProjects(content) - Find project references
  - [ ] detectClients(content) - Find client mentions
  - [ ] detectScope(content) - Guess general vs specific
  - [ ] detectDomain(content) - Suggest categorization
- [ ] Use heuristics:
  - [ ] Known technology names from vault
  - [ ] Project names from projects/ directory
  - [ ] Client names from clients/ directory
  - [ ] Keyword patterns for scope
- [ ] Return confidence scores

### Missing Context Identifier

- [ ] Create src/services/ai-support/missing-identifier.ts
  - [ ] identifyMissing(intent) -> MissingContext[]
  - [ ] Check required fields for knowledge_type
  - [ ] Validate scope has required context
  - [ ] Check technologies are resolvable
  - [ ] Identify ambiguous references
- [ ] Return list of missing items:
  - [ ] scope, project, client, technologies, domain

### Question Generator

- [ ] Create src/services/ai-support/question-generator.ts
  - [ ] generateQuestions(missing, detected) -> Questions[]
  - [ ] Context-aware question phrasing
  - [ ] Include detected hints as suggestions
  - [ ] Support question types:
    - [ ] choice (select from options)
    - [ ] confirm (yes/no)
    - [ ] text (free input)
  - [ ] Provide default values where possible

### palace_clarify Tool

- [ ] Create src/tools/clarify.ts
  - [ ] Input: context (title, content_preview, detected_*)
  - [ ] Input: missing array
  - [ ] Run context detection
  - [ ] Identify missing items
  - [ ] Generate questions
  - [ ] Return questions with suggestions
- [ ] Integrate with palace_store workflow:
  - [ ] Store can call clarify when context incomplete
  - [ ] AI presents questions to user
  - [ ] AI provides answers and retries store

### Technology Detection

- [ ] Build technology vocabulary from vault
  - [ ] Scan technologies/ directory
  - [ ] Include aliases from frontmatter
  - [ ] Case-insensitive matching
- [ ] Detect in content:
  - [ ] Exact matches
  - [ ] Near matches (fuzzy)
  - [ ] Code block language hints
  - [ ] File extension mentions
- [ ] Return with confidence scores

### Project/Client Detection

- [ ] Build project vocabulary from vault
  - [ ] Scan projects/ directory
  - [ ] Scan clients/ directory
  - [ ] Include aliases
- [ ] Detect context clues:
  - [ ] "for {project}" patterns
  - [ ] "client {name}" patterns
  - [ ] "our {project}" patterns
  - [ ] Explicit mentions
- [ ] Distinguish general vs specific

### Scope Detection

- [ ] Heuristics for scope:
  - [ ] Mentions "our", "we", "us" -> project-specific
  - [ ] Mentions specific project/client -> project-specific
  - [ ] Technical explanation only -> general
  - [ ] Configuration details -> check context
  - [ ] Troubleshooting -> check context
- [ ] Return scope with confidence

### Integration Points

- [ ] palace_store uses clarify when incomplete
- [ ] palace_improve can request clarification
- [ ] Session tools log clarification events
- [ ] Standards can define required clarifications

### Testing

- [ ] Unit tests for context detector
- [ ] Unit tests for missing identifier
- [ ] Unit tests for question generator
- [ ] Unit tests for palace_clarify
- [ ] Test with various content types
- [ ] Test technology detection accuracy
- [ ] Test project/client detection
- [ ] Test scope detection

### Documentation

- [ ] Update CLAUDE.md with clarify tool
- [ ] Document AI behavior protocols
- [ ] Document context detection
- [ ] Provide clarification examples

## Standards & References

- [CLAUDE.md](../../CLAUDE.md) - Project guidelines
- [v2.0 Specification](../obsidian-palace-mcp-spec-v2.md) - Sections 8.4, 11
- [Git Workflow Standards](../GIT_WORKFLOW_STANDARDS.md)

## Technical Details

### Context Detection Output

```typescript
interface DetectedContext {
  technologies: Array<{
    name: string;
    confidence: number;
    exists_in_vault: boolean;
    suggested_path?: string;
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

  scope: {
    likely: 'general' | 'project-specific';
    confidence: number;
    indicators: string[];
  };

  domains: Array<{
    name: string;
    confidence: number;
  }>;
}
```

### Missing Context Types

```typescript
type MissingContextType =
  | 'scope'           // General vs project-specific
  | 'project'         // Which project
  | 'client'          // Which client
  | 'technologies'    // Confirm tech links
  | 'domain';         // Categorization
```

### palace_clarify Input

```typescript
interface PalaceClarifyInput {
  context: {
    title: string;
    content_preview: string;     // First 500 chars
    detected_technologies?: string[];
    detected_context?: {
      possible_projects: string[];
      possible_clients: string[];
    };
  };

  missing: MissingContextType[];
}
```

### palace_clarify Output

```typescript
interface PalaceClarifyOutput {
  questions: Array<{
    key: MissingContextType;
    question: string;
    type: 'choice' | 'confirm' | 'text';
    options?: string[];
    detected_hints?: string[];
    default?: string;
  }>;

  suggestions: {
    scope?: 'general' | 'project-specific';
    project?: string;
    client?: string;
    technologies?: string[];
    domain?: string[];
  };

  confidence: {
    overall: number;
    per_field: Record<string, number>;
  };
}
```

### Clarification Triggers

| Missing Context | Detection | Example Question |
|-----------------|-----------|------------------|
| Scope | Technical + "our"/"we" | "Is this general knowledge or specific to a project?" |
| Project | Scope=specific, no project | "Which project is this for?" |
| Client | Mentions company unclear | "Which client is this for?" |
| Technologies | Technical with no refs | "What technologies should I link this to?" |
| Domain | Unclear categorization | "How should I categorize this?" |

### Question Generation Examples

```typescript
// Scope unclear
{
  key: 'scope',
  question: 'Is this Docker networking guide general knowledge that could apply anywhere, or is it specific to a particular project?',
  type: 'choice',
  options: ['General knowledge', 'Project-specific'],
  detected_hints: ['Mentions "our cluster"', 'References specific IP range'],
  default: 'Project-specific'
}

// Project missing
{
  key: 'project',
  question: 'Which project is this Kubernetes configuration for?',
  type: 'choice',
  options: ['xlink', 'minuvox', 'security-robot', 'Other'],
  detected_hints: ['Found in xlink-related conversation'],
  default: 'xlink'
}

// Technologies ambiguous
{
  key: 'technologies',
  question: 'I detected mentions of Kubernetes and Calico. Should I link this note to both?',
  type: 'confirm',
  detected_hints: ['kubernetes', 'calico', 'cni'],
  default: 'yes'
}
```

### AI Workflow with Clarification

```
AI wants to store knowledge
    ↓
palace_check() - Is this new?
    ↓
Prepare storage intent
    ↓
┌─ Intent complete? ────────────────────┐
│                                        │
│  YES → palace_store()                 │
│                                        │
│  NO → palace_clarify()                │
│       Get questions                   │
│       Present to user                 │
│       Collect answers                 │
│       Update intent                   │
│       palace_store()                  │
└────────────────────────────────────────┘
```

### Files to Create

```
src/services/ai-support/
├── context-detector.ts    # Detect context in content
├── missing-identifier.ts  # Identify missing context
├── question-generator.ts  # Generate clarifying questions
└── index.ts               # Barrel export

src/tools/
└── clarify.ts             # palace_clarify tool
```

## Testing & Quality Assurance

### Test Coverage Requirements

| Area | Target |
|------|--------|
| Context detector | 85% |
| Missing identifier | 90% |
| Question generator | 85% |
| palace_clarify | 85% |

### Test Scenarios

1. **Clear context** - No questions needed
2. **Missing scope** - Scope question generated
3. **Missing project** - Project question with options
4. **Technology detection** - Finds known technologies
5. **Unknown technology** - Suggests stub creation
6. **Multiple missing** - Multiple questions generated
7. **With hints** - Defaults based on detection

### Quality Checks

- [ ] All tests passing
- [ ] No TypeScript errors
- [ ] Linting passes
- [ ] Questions are clear and helpful
- [ ] Detection accuracy acceptable

## Acceptance Criteria

- [ ] Context detector finds technologies accurately
- [ ] Context detector finds projects/clients
- [ ] Scope detection provides reasonable guesses
- [ ] Missing identifier catches incomplete intents
- [ ] Questions are well-formed and helpful
- [ ] Suggestions include detected hints
- [ ] palace_clarify integrates with store workflow
- [ ] All tests passing

## Risks & Mitigation

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| Poor detection accuracy | Medium | Medium | Iterative improvement, fallbacks |
| Too many questions | Medium | Medium | Prioritize, limit questions |
| Unhelpful suggestions | Low | Medium | Include confidence scores |
| AI loop (clarify -> store -> clarify) | Medium | Low | Track clarification attempts |

## Notes & Decisions

*To be filled during implementation*
