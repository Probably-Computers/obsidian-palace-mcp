# Phase 002: Core Tools

**Status**: Completed
**Start Date**: 2025-12-05
**Target Completion**: 2025-12-05
**Actual Completion**: 2025-12-05
**Owner**: Claude/Adam

## Objectives

- Implement the core MCP tools for basic knowledge management
- Enable storing new knowledge (palace_remember)
- Enable reading existing notes (palace_read)
- Enable searching the vault (palace_recall)
- Enable listing vault contents (palace_list)
- Enable viewing vault structure (palace_structure)

## Prerequisites

- [x] Phase 001 completed
- [x] Vault services operational
- [x] MCP server accepting connections
- [x] Type definitions for tool results

## Scope

### In Scope

- palace_remember tool (create notes)
- palace_read tool (read specific notes)
- palace_recall tool (search vault)
- palace_list tool (list directory contents)
- palace_structure tool (directory tree)
- Tool registration system
- Input validation with Zod schemas
- Consistent error handling

### Out of Scope

- palace_update tool (Phase 3 or later)
- SQLite-backed search (Phase 3)
- Graph tools (Phase 4)
- Auto-linking in remember (Phase 5)

## Tasks

### Setup

- [x] Create tools/index.ts for tool registration
- [x] Define tool handler pattern

### Development

- [x] Implement palace_remember tool
  - [x] Zod input schema
  - [x] MCP tool definition
  - [x] Handler function
  - [x] Creates notes with proper frontmatter
- [x] Implement palace_read tool
  - [x] Read by path
  - [x] Find by title (with alias support)
- [x] Implement palace_recall tool
  - [x] Basic text search
  - [x] Filter by type
  - [x] Filter by tags
  - [x] Filter by path prefix
  - [x] Filter by confidence
  - [x] Scoring and ranking
- [x] Implement palace_list tool
  - [x] List notes in directory
  - [x] Recursive option
  - [x] Include metadata option
- [x] Implement palace_structure tool
  - [x] Directory tree generation
  - [x] Depth limiting
  - [x] Formatted tree output

### Testing & Validation

- [ ] Unit tests for tool handlers (deferred)
- [ ] Integration tests with test vault (deferred)

### Documentation

- [x] Tool descriptions in tool definitions
- [x] Input schema documentation via MCP

## Standards & References

- [CLAUDE.md](../../../CLAUDE.md) - Project guidelines
- [Obsidian Palace MCP Spec](../../obsidian-palace-mcp-spec.md) - Tool specifications
- [MCP Tool Schema](https://modelcontextprotocol.io/docs/concepts/tools)

## Technical Details

### Tool Architecture

Each tool follows a consistent pattern:
1. Zod schema for input validation
2. MCP Tool definition with JSON Schema
3. Async handler function returning ToolResult
4. Registration in tools/index.ts

### Tool Definitions

| Tool | Description | Required Params |
|------|-------------|-----------------|
| palace_remember | Store new knowledge | content, title, type |
| palace_read | Read specific note | path OR title |
| palace_recall | Search vault | query |
| palace_list | List notes | (none) |
| palace_structure | Get directory tree | (none) |

### Files Created

```
src/tools/
├── index.ts       # Tool registration and dispatch
├── remember.ts    # palace_remember implementation
├── read.ts        # palace_read implementation
├── recall.ts      # palace_recall implementation
├── list.ts        # palace_list implementation
└── structure.ts   # palace_structure implementation
```

### Error Handling

All tools return a consistent ToolResult type:
```typescript
interface ToolSuccess<T> {
  success: true;
  data: T;
}

interface ToolError {
  success: false;
  error: string;
  code?: string;
}
```

Error codes used:
- `VALIDATION_ERROR` - Input validation failed
- `NOT_FOUND` - Note or path not found
- `CREATE_ERROR` - Failed to create note
- `READ_ERROR` - Failed to read note
- `LIST_ERROR` - Failed to list directory
- `SEARCH_ERROR` - Search operation failed
- `STRUCTURE_ERROR` - Failed to get structure
- `UNKNOWN_TOOL` - Tool not registered

## Testing & Quality Assurance

### Test Coverage Requirements

- Unit tests: Deferred to future phase
- Integration tests: Deferred to Phase 3

### Quality Checks

- [x] All tools compile without errors
- [x] Input validation working
- [x] Error handling consistent
- [x] Tools registered correctly

## Acceptance Criteria

- [x] palace_remember creates notes with proper structure
- [x] palace_read retrieves notes by path or title
- [x] palace_recall finds notes matching search criteria
- [x] palace_list shows directory contents
- [x] palace_structure displays vault tree
- [x] All tools validate input with helpful errors
- [x] All tools return consistent result format

## Risks & Mitigation

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| Search performance | Medium | High | SQLite FTS in Phase 3 |
| Large vault scanning | Medium | Medium | Add pagination in future |

## Notes & Decisions

### 2025-12-05 - Search Implementation

- Context: Need search before SQLite index
- Decision: Simple in-memory text search with scoring
- Rationale: Functional for small vaults, placeholder for FTS
- Alternatives considered: Wait for SQLite

### 2025-12-05 - Tool Result Format

- Context: Consistent tool responses needed
- Decision: All tools return {success, data/error} structure
- Rationale: Easy error handling, consistent parsing
- Alternatives considered: Throwing exceptions

### 2025-12-05 - Find by Title

- Context: Users may not know exact paths
- Decision: palace_read supports title lookup with alias checking
- Rationale: Better UX, mirrors Obsidian behavior
- Alternatives considered: Separate find tool
