# Phase 026: Export & Portability

**Status**: Complete
**Start Date**: 2025-12-17
**Target Completion**: 2025-12-17
**Actual Completion**: 2025-12-17
**Owner**: Adam

## Objectives

- Add `palace_export` tool to render hub + children as single file
- Implement `portable: true` option to guarantee single-file storage
- Support multiple export formats (markdown, clean markdown, HTML)
- Enable generating standalone files for use outside the vault
- Strip wiki-links for clean export when needed

## Prerequisites

- [x] Phase 022 complete (Smart Split System - consolidation)
- [x] Phase 024 complete (Autolink Improvements - link stripping)
- [x] Understanding of current vault structure

## Scope

### In Scope
- `palace_export` tool for single-file output
- `portable: true` option for `palace_store`
- Clean markdown export (no wiki-links)
- HTML export with resolved links
- Frontmatter stripping options
- Hub + children consolidation export

### Out of Scope
- PDF export (external tool territory)
- Static site generation (use dedicated tools)
- Complex templating systems
- Image embedding/base64 encoding

## Tasks

### 026.1: Implement palace_export Tool
- [x] Create `src/tools/export.ts` with Zod schema
- [x] Support exporting single notes
- [x] Support exporting hub + all children as single file
- [x] Support exporting directory as single file
- [x] Register tool in `src/tools/index.ts`

### 026.2: Export Formats
- [x] `markdown` - Original markdown with wiki-links intact
- [x] `clean_markdown` - Wiki-links converted to plain text
- [x] `resolved_markdown` - Wiki-links converted to relative file links
- [x] `html` - Rendered HTML with links
- [x] Add format option to export tool

### 026.3: Hub Consolidation Export
- [x] Read hub and all children
- [x] Order children by Knowledge Map order (or alphabetically)
- [x] Insert child content under appropriate headers
- [x] Handle nested hubs (hub of hubs)
- [x] Maintain internal links between sections

### 026.4: Portable Storage Option
- [x] Add `portable: true` option to `palace_store`
- [x] When portable, never split regardless of size
- [x] When portable, don't create stubs
- [x] When portable, use clean_markdown by default
- [x] Warn if content exceeds atomic limits but proceed anyway

### 026.5: Link Processing
- [x] Convert `[[Note]]` to `Note` (plain text)
- [x] Convert `[[Note|alias]]` to `alias`
- [x] Convert `[[Note]]` to `[Note](./Note.md)` (relative links)
- [x] Optionally strip all links entirely
- [x] Handle broken links gracefully

### 026.6: Frontmatter Handling
- [x] Option to include frontmatter (`include_frontmatter: true`)
- [x] Option to strip frontmatter (default for clean export)
- [x] Option to convert frontmatter to document header
- [x] Merge frontmatter from hub and children intelligently

### 026.7: Output Options
- [x] Return content as string (default)
- [x] Write to specified output path
- [x] Option to write outside vault
- [x] Filename generation for consolidated exports

### 026.8: Testing & Validation
- [x] Unit tests for link processing
- [x] Integration tests for hub consolidation
- [x] Integration tests for each format
- [x] Test with complex nested hub structures

### 026.9: Documentation
- [x] Document `palace_export` in CLAUDE.md
- [x] Document export formats and options
- [x] Add examples for common use cases
- [x] Document portable storage option

## Standards & References

- [CLAUDE.md](../../../CLAUDE.md) - Project guidelines
- [obsidian-palace-mcp-spec.md](../obsidian-palace-mcp-spec.md) - Full specification
- Markdown processing: `src/utils/markdown.ts`

## Technical Details

### palace_export Schema

```typescript
const exportSchema = z.object({
  path: z.string().describe('Note or hub path to export'),
  vault: z.string().optional(),
  format: z.enum([
    'markdown',
    'clean_markdown',
    'resolved_markdown',
    'html',
  ]).default('markdown'),
  include_children: z.boolean().default(true).describe('Include hub children'),
  include_frontmatter: z.boolean().default(false),
  output_path: z.string().optional().describe('Write to file instead of returning'),
  link_style: z.enum([
    'keep',           // [[Note]] stays as is
    'plain_text',     // [[Note]] → Note
    'relative',       // [[Note]] → [Note](./Note.md)
    'remove',         // [[Note]] → (removed entirely)
  ]).default('keep'),
});
```

### Response Structure

```typescript
interface ExportResult {
  success: boolean;
  content: string;              // Exported content
  format: string;
  sources: string[];            // Files that were combined
  output_path?: string;         // If written to file
  warnings: string[];
}
```

### Hub Consolidation Logic

```typescript
async function consolidateHub(hubPath: string): Promise<string> {
  const hub = await readNote(hubPath);
  const children = await getOrderedChildren(hubPath);

  let content = hub.contentBeforeKnowledgeMap;

  for (const child of children) {
    const childContent = await readNote(child.path);
    // Insert child content, adjusting header levels
    content += `\n\n## ${child.title}\n\n`;
    content += adjustHeaderLevels(childContent.content, 1);
  }

  return content;
}
```

### Link Processing

```typescript
function processLinks(
  content: string,
  style: 'keep' | 'plain_text' | 'relative' | 'remove'
): string {
  // Match [[Link]] and [[Link|Alias]] patterns
  const linkPattern = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

  return content.replace(linkPattern, (match, target, alias) => {
    const displayText = alias || target;

    switch (style) {
      case 'keep':
        return match;
      case 'plain_text':
        return displayText;
      case 'relative':
        return `[${displayText}](./${slugify(target)}.md)`;
      case 'remove':
        return '';
    }
  });
}
```

### Portable Store Option

```typescript
// In palace_store
if (options.portable) {
  // Override all splitting behavior
  options.auto_split = false;
  options.force_single_file = true;
  options.create_stubs = false;
  options.autolink = false;  // or options.link_style = 'plain_text'
}
```

### Files to Create/Modify

| File | Action |
|------|---------|
| `src/tools/export.ts` | Create - new export tool |
| `src/tools/index.ts` | Modify - register export tool |
| `src/tools/store.ts` | Modify - portable option |
| `src/utils/markdown.ts` | Modify - link processing utilities |
| `src/services/export/` | Create - export service directory |

## Testing & Quality Assurance

### Test Coverage Requirements
- Unit tests for link processing
- Unit tests for frontmatter handling
- Integration tests for hub consolidation
- Integration tests for each export format

### Quality Checks
- [x] All existing tests still pass
- [x] Export output is valid markdown/HTML
- [x] Links processed correctly in all modes
- [x] Large documents export without issues

## Acceptance Criteria

- [x] `palace_export` tool available and documented
- [x] Hub + children can be exported as single file
- [x] Clean markdown export strips wiki-links correctly
- [x] `portable: true` prevents all splitting
- [x] HTML export renders correctly
- [x] Frontmatter can be included or stripped
- [x] All tests passing (601 tests)
- [x] Documentation updated

## Risks & Mitigation

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| Complex hub structures fail | Medium | Medium | Recursive handling, depth limits |
| Link resolution misses edge cases | Medium | Medium | Comprehensive regex, test suite |
| Large exports cause memory issues | Low | Low | Streaming for large files |
| HTML rendering inconsistencies | Low | Medium | Use established markdown library |

## Notes & Decisions

### Why Not PDF?
- **Context**: PDF is a common export request
- **Decision**: Out of scope - recommend external tools
- **Rationale**: PDF rendering is complex; tools like Pandoc do it well
- **Suggestion**: Export to clean markdown, then use Pandoc for PDF

### Link Style Default
- **Context**: Different use cases need different link handling
- **Decision**: Default to `keep` (preserve wiki-links)
- **Rationale**: Most exports stay within Obsidian ecosystem
- **Note**: `portable: true` implies `plain_text` by default

### Frontmatter Default
- **Context**: External tools may not understand YAML frontmatter
- **Decision**: Default to excluding frontmatter in exports
- **Rationale**: Cleaner output for external use
- **Trade-off**: Metadata is lost; can be included with option
