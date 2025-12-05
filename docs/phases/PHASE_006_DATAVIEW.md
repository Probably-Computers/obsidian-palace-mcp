# Phase 006: Dataview Integration

**Status**: Planning
**Start Date**: TBD
**Target Completion**: TBD
**Actual Completion**: -
**Owner**: TBD

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
- [ ] Phase 004 completed (graph for link queries)
- [ ] Understanding of DQL syntax
- [ ] Test vault configured via PALACE_VAULT_PATH

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

- [ ] Create services/dataview/ directory structure
- [ ] Research DQL syntax and common patterns
- [ ] Define supported query subset

### Development

- [ ] Implement services/dataview/parser.ts
  - [ ] Tokenize DQL query string
  - [ ] Parse query type (TABLE, LIST, TASK)
  - [ ] Parse field selection
  - [ ] Parse FROM clause
  - [ ] Parse WHERE conditions
  - [ ] Parse SORT clause
  - [ ] Parse LIMIT clause
  - [ ] Handle syntax errors gracefully
- [ ] Implement services/dataview/executor.ts
  - [ ] Convert parsed query to SQL
  - [ ] Execute against SQLite index
  - [ ] Handle property access (frontmatter fields)
  - [ ] Support comparison operators
  - [ ] Support contains() function
  - [ ] Support date comparisons
- [ ] Implement services/dataview/formatter.ts
  - [ ] Format as TABLE (markdown table)
  - [ ] Format as LIST (bullet list)
  - [ ] Format as TASK (checkbox list)
  - [ ] Format as JSON (structured data)
- [ ] Implement services/dataview/index.ts barrel export
- [ ] Implement tools/dataview.ts (palace_dataview)
  - [ ] Accept DQL query string
  - [ ] Output format option
  - [ ] Return formatted results

### Testing & Validation

- [ ] Unit tests for parser
- [ ] Unit tests for executor
- [ ] Unit tests for formatter
- [ ] Integration tests with real queries
- [ ] Compatibility tests with Dataview examples

### Documentation

- [ ] Update CLAUDE.md with dataview tool
- [ ] Document supported DQL subset
- [ ] Provide query examples
- [ ] Document limitations vs full Dataview

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

- [ ] Code review completed
- [ ] All tests passing
- [ ] Linting passes
- [ ] Documentation updated
- [ ] Error messages helpful for bad queries

## Acceptance Criteria

- [ ] Parser handles TABLE, LIST, TASK queries
- [ ] WHERE clause filters correctly
- [ ] SORT clause orders results
- [ ] LIMIT clause restricts results
- [ ] contains() works for arrays
- [ ] Date comparisons work
- [ ] Output formats render correctly
- [ ] Invalid queries return helpful errors
- [ ] Performance acceptable for complex queries

## Risks & Mitigation

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| DQL complexity | High | High | Implement subset, document limitations |
| Query injection | High | Low | Parameterized queries, input validation |
| Performance on complex queries | Medium | Medium | Query optimization, EXPLAIN analysis |
| Incompatibility with Dataview | Medium | Medium | Clear documentation of differences |

## Notes & Decisions

### TBD - DQL Subset Scope

- Context: Full DQL is complex, need to define subset
- Options:
  1. Minimal (basic FROM/WHERE/SORT)
  2. Moderate (add functions, GROUP BY)
  3. Comprehensive (most DQL features)
- Decision: Pending (start minimal, expand based on use)

### TBD - Error Handling

- Context: How to handle invalid queries
- Options:
  1. Return error with position info
  2. Attempt partial execution
  3. Suggest corrections
- Decision: Pending

### TBD - Field Access Syntax

- Context: How to access nested frontmatter
- Options:
  1. Dot notation (file.frontmatter.field)
  2. Direct field names (field)
  3. Both
- Decision: Pending (likely direct field names)
