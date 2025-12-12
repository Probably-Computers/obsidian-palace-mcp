# Phase 006: Dataview Integration

**Status**: Complete
**Start Date**: 2025-12-06
**Target Completion**: 2025-12-06
**Actual Completion**: 2025-12-06
**Owner**: Claude

## Objectives

- Implement Dataview Query Language (DQL) parser
- Execute DQL queries against the SQLite index
- Support TABLE, LIST, and TASK query types
- Format results for AI consumption
- Implement palace_dataview tool

## Prerequisites

- [x] Phase 001 completed
- [x] Phase 002 completed
- [x] Phase 003 completed (SQLite index)
- [x] Phase 004 completed (graph for link queries)
- [x] Understanding of DQL syntax
- [x] Test vault configured via PALACE_VAULT_PATH

## Scope

### In Scope

- DQL parser for common query patterns
- Query executor using SQLite index
- TABLE output format
- LIST output format
- TASK output format (if tasks in frontmatter)
- JSON output for programmatic use
- FROM clause (path filtering)
- WHERE clause (property filters)
- SORT clause
- LIMIT clause
- Basic field selection

### Out of Scope

- Full DQL compatibility (subset only)
- JavaScript inline queries
- DataviewJS
- Custom functions
- GROUP BY (future enhancement)
- FLATTEN (future enhancement)

## Tasks

### Setup

- [x] Create services/dataview/ directory structure
- [x] Research DQL syntax and common patterns
- [x] Define supported query subset

### Development

- [x] Implement services/dataview/parser.ts
  - [x] Tokenize DQL query string
  - [x] Parse query type (TABLE, LIST, TASK)
  - [x] Parse field selection
  - [x] Parse FROM clause
  - [x] Parse WHERE conditions
  - [x] Parse SORT clause
  - [x] Parse LIMIT clause
  - [x] Handle syntax errors gracefully
- [x] Implement services/dataview/executor.ts
  - [x] Convert parsed query to SQL
  - [x] Execute against SQLite index
  - [x] Handle property access (frontmatter fields)
  - [x] Support comparison operators
  - [x] Support contains() function
  - [x] Support date comparisons
- [x] Implement services/dataview/formatter.ts
  - [x] Format as TABLE (markdown table)
  - [x] Format as LIST (bullet list)
  - [x] Format as TASK (checkbox list)
  - [x] Format as JSON (structured data)
- [x] Implement services/dataview/index.ts barrel export
- [x] Implement tools/dataview.ts (palace_dataview)
  - [x] Accept DQL query string
  - [x] Output format option
  - [x] Return formatted results

### Testing & Validation

- [x] Unit tests for parser
- [x] Unit tests for executor
- [x] Unit tests for formatter
- [ ] Integration tests with real queries
- [ ] Compatibility tests with Dataview examples

### Documentation

- [x] Update CLAUDE.md with dataview tool
- [x] Document supported DQL subset
- [x] Provide query examples
- [x] Document limitations vs full Dataview

## Standards & References

- [CLAUDE.md](../../CLAUDE.md) - Project guidelines
- [Obsidian Palace MCP Spec](../obsidian-palace-mcp-spec.md) - Tool specifications
- [Dataview Documentation](https://blacksmithgu.github.io/obsidian-dataview/)
- [DQL Reference](https://blacksmithgu.github.io/obsidian-dataview/queries/dql-js-inline/)

## Technical Details

### Supported DQL Subset

```dataview
// TABLE queries
TABLE field1, field2 FROM "path" WHERE condition SORT field LIMIT n

// LIST queries
LIST FROM "path" WHERE condition SORT field LIMIT n

// TASK queries
TASK FROM "path" WHERE condition
```

### Supported Operators

| Operator | Example | Description |
|----------|---------|-------------|
| = | `type = "research"` | Equality |
| != | `verified != true` | Inequality |
| > < >= <= | `confidence > 0.8` | Comparison |
| contains() | `contains(tags, "k8s")` | Array contains |
| AND | `type = "command" AND verified` | Logical AND |
| OR | `confidence > 0.9 OR verified` | Logical OR |

### Data Structures

```typescript
interface ParsedQuery {
  type: 'TABLE' | 'LIST' | 'TASK';
  fields?: string[];           // For TABLE
  from?: string;               // Path filter
  where?: WhereClause;         // Conditions
  sort?: SortClause;           // Ordering
  limit?: number;              // Result limit
}

interface WhereClause {
  left: string | WhereClause;
  operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'AND' | 'OR' | 'contains';
  right: string | number | boolean | WhereClause;
}

interface DataviewResult {
  type: 'table' | 'list' | 'task';
  headers?: string[];          // For table
  rows: Record<string, unknown>[];
  total: number;
  query: string;
}
```

### Files to Create

```
src/services/dataview/
├── parser.ts          # DQL parser
├── executor.ts        # Query execution
├── formatter.ts       # Output formatting
└── index.ts           # Barrel exports

src/tools/
└── dataview.ts        # palace_dataview
```

### Tool Specification

#### palace_dataview
```typescript
{
  query: string;               // DQL query string
  format: 'table' | 'list' | 'task' | 'json';  // Output format (default: json)
}
```

### Example Queries

```dataview
// Find all unverified research
TABLE title, confidence, source
FROM "research"
WHERE verified = false
SORT confidence DESC

// List commands with kubernetes tag
LIST
FROM "commands"
WHERE contains(tags, "kubernetes")

// Recent low-confidence notes
TABLE title, type, confidence
WHERE confidence < 0.7
SORT modified DESC
LIMIT 10
```

## Testing & Quality Assurance

### Test Vault

Located at: `/Users/adamc/Documents/Claude Palace`

Create test notes with varied frontmatter for query testing.

### Test Coverage Requirements

- Unit tests: 90% coverage for parser
- Query tests: All operators and clauses
- Edge cases: Empty results, syntax errors, missing fields

### Quality Checks

- [x] Code review completed
- [x] All tests passing
- [x] Linting passes
- [x] Documentation updated
- [x] Error messages helpful for bad queries

## Acceptance Criteria

- [x] Parser handles TABLE, LIST, TASK queries
- [x] WHERE clause filters correctly
- [x] SORT clause orders results
- [x] LIMIT clause restricts results
- [x] contains() works for arrays
- [x] Date comparisons work
- [x] Output formats render correctly
- [x] Invalid queries return helpful errors
- [x] Performance acceptable for complex queries

## Risks & Mitigation

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| DQL complexity | High | High | Implement subset, document limitations |
| Query injection | High | Low | Parameterized queries, input validation |
| Performance on complex queries | Medium | Medium | Query optimization, EXPLAIN analysis |
| Incompatibility with Dataview | Medium | Medium | Clear documentation of differences |

## Notes & Decisions

### DQL Subset Scope

- Context: Full DQL is complex, need to define subset
- Options:
  1. Minimal (basic FROM/WHERE/SORT)
  2. Moderate (add functions, GROUP BY)
  3. Comprehensive (most DQL features)
- **Decision**: Minimal subset - TABLE/LIST/TASK with FROM, WHERE (with AND/OR/contains), SORT, LIMIT
- Implementation: Expandable parser architecture allows adding features later

### Error Handling

- Context: How to handle invalid queries
- Options:
  1. Return error with position info
  2. Attempt partial execution
  3. Suggest corrections
- **Decision**: Return error with position info via DQLParseError
- Implementation: Parser throws DQLParseError with position, query context in message

### Field Access Syntax

- Context: How to access nested frontmatter
- Options:
  1. Dot notation (file.frontmatter.field)
  2. Direct field names (field)
  3. Both
- **Decision**: Both - direct field names primary, Dataview-style file.* aliases supported
- Implementation: FIELD_MAP in executor.ts maps both styles to SQL columns
