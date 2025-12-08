# Phase 014: AI Support Tools

**Status**: Completed
**Start Date**: 2025-12-08
**Completion Date**: 2025-12-08
**Owner**: AI

## Objectives

- Provide tools to help AI maintain graph integrity
- Enable AI to request missing context from users
- Implement context detection heuristics
- Support the "Always Learning" AI behavior model
- Help AI ask the right clarifying questions

## Prerequisites

- [x] Phase 008 completed (Multi-Vault Configuration)
- [x] Phase 009 completed (Multi-Vault Tool Integration)
- [x] Phase 010 completed (Multi-Vault Index & Search)
- [x] Phase 011 completed (Intent-Based Storage)
- [x] Phase 012 completed (Atomic Note System)
- [x] Phase 013 completed (Standards System)
- [x] Storage intent schema finalized

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

- [x] Create src/services/ai-support/context-detector.ts
  - [x] detectTechnologies(content) - Find tech mentions
  - [x] detectProjects(content) - Find project references
  - [x] detectClients(content) - Find client mentions
  - [x] detectScope(content) - Guess general vs specific
  - [x] detectDomains(content) - Suggest categorization
- [x] Use heuristics:
  - [x] Known technology names from vault
  - [x] Project names from projects/ directory
  - [x] Client names from clients/ directory
  - [x] Keyword patterns for scope
- [x] Return confidence scores

### Missing Context Identifier

- [x] Create src/services/ai-support/missing-identifier.ts
  - [x] identifyMissing(intent) -> MissingContext[]
  - [x] Check required fields for knowledge_type
  - [x] Validate scope has required context
  - [x] Check technologies are resolvable
  - [x] Identify ambiguous references
- [x] Return list of missing items:
  - [x] scope, project, client, technologies, domain

### Question Generator

- [x] Create src/services/ai-support/question-generator.ts
  - [x] generateQuestions(missing, detected) -> Questions[]
  - [x] Context-aware question phrasing
  - [x] Include detected hints as suggestions
  - [x] Support question types:
    - [x] choice (select from options)
    - [x] confirm (yes/no)
    - [x] text (free input)
  - [x] Provide default values where possible

### palace_clarify Tool

- [x] Create src/tools/clarify.ts
  - [x] Input: context (title, content_preview, detected_*)
  - [x] Input: missing array
  - [x] Run context detection
  - [x] Identify missing items
  - [x] Generate questions
  - [x] Return questions with suggestions
- [x] Integrate with palace_store workflow:
  - [x] Store can call clarify when context incomplete
  - [x] AI presents questions to user
  - [x] AI provides answers and retries store

### Technology Detection

- [x] Build technology vocabulary from vault
  - [x] Scan technologies/ directory
  - [x] Include aliases from frontmatter
  - [x] Case-insensitive matching
- [x] Detect in content:
  - [x] Exact matches
  - [x] Pattern matching for known tech names
  - [x] Code block language hints
  - [x] File extension mentions
- [x] Return with confidence scores

### Project/Client Detection

- [x] Build project vocabulary from vault
  - [x] Scan projects/ directory
  - [x] Scan clients/ directory
  - [x] Include path-based names
- [x] Detect context clues:
  - [x] "for {project}" patterns
  - [x] "client {name}" patterns
  - [x] "our {project}" patterns
  - [x] Explicit mentions
- [x] Distinguish general vs specific

### Scope Detection

- [x] Heuristics for scope:
  - [x] Mentions "our", "we", "us" -> project-specific
  - [x] Mentions specific project/client -> project-specific
  - [x] Technical explanation only -> general
  - [x] "best practice", "standard way" -> general
- [x] Return scope with confidence

### Integration Points

- [x] palace_clarify registered as MCP tool
- [x] Can be called before palace_store for incomplete intents
- [x] Returns structured questions for AI to present

### Testing

- [x] Unit tests for context detector
- [x] Unit tests for missing identifier
- [x] Unit tests for question generator
- [x] Unit tests for clarify tool types
- [x] Test with various content types
- [x] Test technology detection accuracy
- [x] Test project/client detection
- [x] Test scope detection

### Documentation

- [x] Update CLAUDE.md with clarify tool
- [x] Document context detection capabilities
- [x] Provide usage workflow

## Implementation Notes

### Files Created

- `src/types/clarify.ts` - Type definitions for AI support
- `src/services/ai-support/context-detector.ts` - Context detection
- `src/services/ai-support/missing-identifier.ts` - Missing context identification
- `src/services/ai-support/question-generator.ts` - Question generation
- `src/services/ai-support/index.ts` - Barrel export
- `src/tools/clarify.ts` - palace_clarify tool
- `tests/unit/services/ai-support/ai-support.test.ts` - Unit tests

### Key Design Decisions

1. **Heuristic-based detection**: Uses pattern matching rather than ML for simplicity and predictability
2. **Confidence scores**: All detection returns confidence 0-1 for AI to use in decisions
3. **Vocabulary building**: Scans vault index for known technologies, projects, clients
4. **Question types**: Choice, confirm, text support different clarification needs
5. **Integration with palace_store**: Designed to be called before storage when intent incomplete

### Technology Patterns Detected

- Languages: TypeScript, JavaScript, Python, Rust, Go, Java, C#
- Frameworks: React, Vue, Angular, Next.js, Express, FastAPI, Django
- Infrastructure: Docker, Kubernetes, Terraform, Ansible, nginx, AWS, Azure, GCP
- Databases: PostgreSQL, MySQL, MongoDB, Redis, SQLite, Elasticsearch
- Tools: Git, GitHub, GitLab, npm, yarn, webpack, Vite

### Scope Indicators

**Project-specific indicators:**
- "our", "we", "us" patterns
- "this project", "our codebase"
- "for the client", "specific to"
- "custom", "internal", "proprietary"

**General indicators:**
- "general", "universal"
- "standard way", "best practice"
- "commonly", "typically"
- "official documentation"

## Acceptance Criteria

- [x] Context detector finds technologies accurately
- [x] Context detector finds projects/clients
- [x] Scope detection provides reasonable guesses
- [x] Missing identifier catches incomplete intents
- [x] Questions are well-formed and helpful
- [x] Suggestions include detected hints
- [x] palace_clarify integrates with store workflow
- [x] All tests passing (348 tests)

## Standards & References

- [CLAUDE.md](../../CLAUDE.md) - Project guidelines
- [v2.0 Specification](../obsidian-palace-mcp-spec-v2.md) - Sections 8.4, 11
- [Git Workflow Standards](../GIT_WORKFLOW_STANDARDS.md)
