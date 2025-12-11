# Phase 019: Pre-Deployment Testing

**Status**: Complete
**Start Date**: 2025-12-08
**Completion Date**: 2025-12-08
**Owner**: Adam Claassens

> **Note:** This phase was previously numbered 018, then 017. It was renumbered to 019 to accommodate Phase 018 (Obsidian-Native Architecture), which implements critical changes to align with Obsidian best practices.

## Objectives

- Validate MCP server works with real Claude Desktop client
- Test all tools with actual Obsidian vaults
- Verify Obsidian-native architecture works in practice
- Verify topic-based AI behavior protocols work in practice
- Identify bugs and edge cases before release
- Confirm production readiness

## Prerequisites

- [x] Phase 008-016 completed
- [x] Phase 017 completed (Topic-Based Architecture)
- [x] **Phase 018 completed (Obsidian-Native Architecture)**
- [x] All unit/integration tests passing (390 tests)
- [x] Documentation updated for new architecture (CLAUDE.md)
- [x] Test vaults accessible
- [x] Claude Desktop configured with dev server

## Scope

### In Scope

- Claude Desktop MCP integration
- Real vault testing (2 vaults)
- **Topic-based organization validation**
- **Domain suggestion system testing**
- **Source vs knowledge distinction testing**
- AI behavior protocol validation
- Bug identification and tracking
- Critical bug fixes

### Out of Scope

- New feature development
- HTTP transport testing (stdio primary)
- Performance benchmarking (deferred)
- Automated E2E tests

## Technical Details

### Test Vaults

| Vault | Path | Alias | Mode | Purpose |
|-------|------|-------|------|---------|
| Claude Palace | `/Users/adamc/Documents/Claude Palace` | claude | rw | Primary testing vault |
| Luci Palace | `/Users/adamc/Documents/Luci-Palace` | luci | ro | Read-only testing |

### Claude Desktop Configuration

**Step 1: Open the config file**

In Claude Desktop:
1. Go to **Claude > Settings** (or click the Settings icon)
2. Select the **Developer** tab
3. Click **Edit Config**

This opens `claude_desktop_config.json` in your default editor.

Alternatively, open the file directly:
```bash
# macOS
open ~/Library/Application\ Support/Claude/claude_desktop_config.json

# Windows
%APPDATA%\Claude\claude_desktop_config.json
```

**Step 2: Add the MCP server configuration**

Add the obsidian-palace server to the `mcpServers` object:

```json
{
  "mcpServers": {
    "obsidian-palace": {
      "command": "node",
      "args": ["/Users/adamc/Documents/GitHub/obsidian-palace-mcp/dist/index.js"],
      "env": {
        "PALACE_VAULTS": "/Users/adamc/Documents/Claude Palace:claude:rw,/Users/adamc/Documents/Luci-Palace:luci:ro",
        "PALACE_DEFAULT_VAULT": "claude",
        "PALACE_LOG_LEVEL": "debug"
      }
    }
  }
}
```

**Step 3: Build the project**

```bash
cd /Users/adamc/Documents/GitHub/obsidian-palace-mcp
npm run build
```

**Step 4: Restart Claude Desktop**

Quit Claude Desktop completely (Cmd+Q) and reopen it.

**Step 5: Verify connection**

In a new Claude conversation, ask:
```
Can you list my Palace vaults?
```

### Troubleshooting

**Server not connecting:**
- Check `~/Library/Logs/Claude/` for MCP server logs
- Verify the path to `dist/index.js` is correct
- Ensure `npm run build` completed successfully
- Check vault paths exist and are accessible

**Permission errors:**
- Verify vault directories have read permissions
- For rw vaults, verify write permissions

**Debug mode:**
Set `PALACE_LOG_LEVEL` to `debug` for verbose logging.

## Tasks

### Setup

- [x] Clear test vaults (fresh start after Phase 018 changes)
- [x] Build project: `npm run build`
- [x] Configure Claude Desktop
- [x] Restart Claude Desktop
- [x] Verify MCP connection works

### Quick Smoke Test

- [x] `palace_vaults` - Lists both vaults with correct modes
- [x] `palace_structure` - Shows vault directory tree with domain patterns
- [x] `palace_recall` - Search finds existing notes
- [x] `palace_read` - Can read a specific note
- [x] `palace_store` - Creates a note at topic-based path

### Topic-Based Architecture Testing (NEW - Phase 017)

#### Domain Path Resolution

- [x] Knowledge stored at domain path (e.g., `gardening/vegetables/peppers/`)
- [x] No hardcoded type-to-folder mappings observed

**Test prompt:**
```
Research how to grow tomatoes in containers. Store what you learn.
```
Expected: Notes created at `gardening/vegetables/tomatoes/` or similar topic path (NOT `research/` or `technologies/`)

#### AI Observation Behavior

- [x] AI calls `palace_structure` before storing to understand vault
- [x] AI calls `palace_check` to find existing knowledge
- [x] AI adapts to existing vault conventions

**Test prompt:**
```
What do you know about wireless networking? Check my vault first.
```
Expected: AI examines vault structure before responding

### Tool Testing (via Claude conversation)

#### Core Tools
- [x] `palace_store` - Create note with topic-based resolution
- [x] `palace_check` - Check for existing knowledge + domain suggestions
- [x] `palace_improve` - Update existing note
- [x] `palace_read` - Read note by path
- [x] `palace_recall` - Full-text search

#### Structure Tools
- [x] `palace_list` - List notes in directory
- [x] `palace_structure` - Get vault tree with domain patterns
- [x] `palace_vaults` - List configured vaults

### Bug Tracking

| ID | Description | Severity | Status | Notes |
|----|-------------|----------|--------|-------|
| | | | | |

Severity: Critical (blocks release), High (must fix), Medium (should fix), Low (nice to fix)

## Test Scenarios

### Scenario 1: First Knowledge in New Domain

```
User: "Research green peppers for my garden in South Africa"

Expected AI behavior:
1. palace_structure() - Sees no gardening section
2. palace_check("green peppers gardening") - No matches, suggests domains
3. AI asks user to confirm new "gardening" top-level domain
4. User confirms
5. palace_store() with domain: ["gardening", "vegetables", "peppers"]
6. Creates gardening/vegetables/peppers/Growing Green Peppers from Seed.md (hub) + atomic notes
```

### Scenario 2: Knowledge in Existing Domain

```
User: "Tell me about LoRa wireless technology"
(Vault already has networking/wireless/ structure)

Expected AI behavior:
1. palace_structure() - Sees networking/wireless/
2. palace_check("LoRa wireless") - Suggests networking/wireless/lora
3. NO confirmation needed - domain exists
4. palace_store() with domain: ["networking", "wireless", "lora"]
5. Creates networking/wireless/lora/LoRa.md (hub) + atomic notes
```

### Scenario 3: Source Material Capture

```
User: "I'm reading 'Clean Code'. Help me capture the key ideas."

Expected AI behavior:
1. Recognizes this is source capture (studying a book)
2. palace_store() with capture_type: 'source'
3. Creates sources/books/clean-code/Clean Code.md (hub)
4. Subsequent captures from same book go in same folder
```

### Scenario 4: Project-Specific Context

```
User: "Document our Kubernetes setup for the Xlink project"

Expected AI behavior:
1. Detects "our" + "Xlink project" = project context
2. palace_store() with capture_type: 'project', project: 'xlink'
3. Creates projects/xlink/kubernetes-setup.md
4. Note REFERENCES general Kubernetes knowledge (doesn't duplicate)
```

## Testing & Quality Assurance

### Test Coverage
- Unit/Integration tests: All passing (after Phase 017)
- Manual testing: This phase

### Quality Checks
- [x] All smoke tests pass
- [x] Topic-based architecture validated
- [x] All core tool tests pass
- [x] AI behavior protocols validated
- [x] No critical bugs found

## Acceptance Criteria

- [x] Claude Desktop connects to dev MCP server
- [x] All core tools callable and functional
- [x] **Topic-based paths working (domain = folder)**
- [x] AI behavior protocols work as designed
- [x] No critical or high severity bugs
- [x] Ready for npm publish

## Risks & Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Phase 017 incomplete | High | Low | Complete Phase 017 first |
| Claude Desktop config issues | High | Medium | Detailed setup instructions provided |
| Vault path issues | Medium | Low | Verify paths before testing |
| Tool failures | High | Medium | Fix critical bugs before release |

## Notes & Decisions

### Testing Approach

This phase validates real-world integration that automated tests cannot cover:
- Actual MCP client communication
- Real Obsidian vault data
- AI behavior observation (especially new topic-based patterns)
- User experience verification

### Bug Handling

- **Critical**: Blocks release, fix immediately
- **High**: Must fix before release
- **Medium**: Fix if time permits, otherwise document
- **Low**: Document as known issues

### Fresh Start

After Phase 017 architectural changes, test vaults should be cleared for a clean test of the new topic-based system.

---

## Test Results Log

### Pre-Phase 017 Testing (2025-12-08)

> Note: These tests were performed with the old type-based architecture. They will be re-run after Phase 017 is complete.

**Connection & Setup**: ✅ Success
- Claude Desktop connected to dev MCP server
- Both vaults detected with correct modes (claude=rw, luci=ro)
- Cross-vault search enabled

**Test 1: Green Peppers Research** ✅
- Topic: Growing green peppers from seed in South Africa
- Result: 12 atomic notes created in `research/` with hub structure
- Note: With new architecture, these would go to `gardening/vegetables/peppers/`

**Test 2: LoRa Technology** ✅
- Topic: LoRa wireless technology documentation
- Result: 17 notes created in `technologies/wireless/IoT/networking/LPWAN/`
- Note: With new architecture, path would be simpler: `networking/wireless/lora/`

**Observations from Pre-Phase 017:**
- Path resolution working but type-driven
- Atomic splitting working correctly
- Stub creation working
- These features should carry forward to new architecture

---

### Post-Phase 017 Testing (2025-12-08)

**Connection & Setup**: ✅ Success
- Claude Desktop connected to dev MCP server
- Both vaults detected: claude (rw), luci (ro)
- Cross-vault search enabled

**Test 1: Green Peppers Research** ✅
- Topic: Growing green peppers from seed in South Africa
- Workflow: web_search → palace_structure → palace_check → palace_store
- Result: Hub + 10 atomic children created at `gardening/vegetables/peppers/`
- 3 stubs created: companion-planting.md, crop-rotation.md, seed-saving.md
- **Topic-based paths working correctly**

**Test 2: Kubernetes Overview** ✅
- Topic: Kubernetes overview with container runtime expansion
- Result: 14 files in `infrastructure/kubernetes/`
- Hub + 7 children, 6 stubs
- **Domain structure correctly created**

**Test 3: Container Runtimes** ✅
- Topic: Container runtime frameworks for Kubernetes
- Result: 14 files in `infrastructure/containers/`
- Hub + 10 children, 3 stubs
- Reference created to kubernetes/_index.md
- **Cross-domain linking working**

**Session Totals:**
- Tool calls: palace_vaults (1), palace_structure (2), palace_check (2), palace_store (3)
- Files created: 3 hubs, 27 children, 12 stubs = 42 total

#### Issues Identified

| ID | Description | Severity | Status | Notes |
|----|-------------|----------|--------|-------|
| 018-001 | Slug generation: "Sandboxed/Secure Runtimes" → "sandboxedsecure-runtimes" | Low | Fixed | Added `/\&+` to hyphen conversion |
| 018-002 | Domain suggestion naive: "green peppers growing" → ["green", "peppers", "growing"] | Medium | Fixed | Now uses dynamic vault-based domain vocabulary |
| 018-003 | Retroactive linking empty for container runtimes | Medium | Fixed | Added aliases from title and domain terms |
| 018-004 | Retroactive linking disabled for atomic split content | Medium | Fixed | Enabled retroactive linking in handleAtomicSplit |
| 018-005 | Stub duplication possible across domains | Low | Fixed | Added check for existing stubs by title before creation |
| 018-006 | Session logging not used | Low | N/A | palace_session_start/log weren't called |
| 018-007 | Confidence stored but not visible in queries | Low | Fixed | Default confidence (0.5) now always returned |
| 018-008 | Wiki-links corrupt titles: "[[_index]] Overview" extracted instead of clean titles | High | Fixed | Added stripWikiLinks() to all title extraction points |
| 018-009 | Similar stub titles not detected: "Container Runtime" vs "Container Runtime (CRI)" | Medium | Fixed | Enhanced findStubByTitle() with slug-based matching |
| 018-010 | palace_improve warns but doesn't auto-split when exceeding atomic limits | Medium | Fixed | Added auto_split parameter with full splitting support |
| 018-011 | palace_check false positives across domains: "containers" matched gardening notes | Medium | Fixed | Added path_filter parameter to constrain searches |
| 018-012 | No way to list stub notes needing expansion | Low | Fixed | Added new palace_stubs tool |

#### Fixes Applied

**018-001: Slug generation for compound words**
- File: `src/utils/slugify.ts`
- Fix: Added `.replace(/[/\\&+]/g, '-')` before removing special chars
- Test: Added `tests/unit/utils/slugify.test.ts` with 19 tests
- Result: "Sandboxed/Secure Runtimes" → "sandboxed-secure-runtimes"

**018-002: Dynamic domain suggestion**
- File: `src/tools/check.ts`
- Fix: Replaced hardcoded domain mappings with `buildDomainPathFromVault()` function
- Approach: Learns vocabulary from existing vault domains dynamically
- Falls back to meaningful words sorted by length when no domain matches
- Only uses standard English stop words for filtering

**018-003 & 018-004: Retroactive linking improvements**
- File: `src/tools/store.ts`
- Fix: Added `buildRetroactiveAliases()` function to build search aliases
- Aliases include: last domain term, significant title words (>4 chars)
- Enabled retroactive linking in `handleAtomicSplit()` function
- Hub notes now get retroactive links from existing notes

**018-005: Stub deduplication across domains**
- File: `src/services/vault/stub-manager.ts`
- Fix: Added check for existing stub by title before creating new one
- If stub exists elsewhere, adds mention to existing stub instead of duplicating
- Uses `findStubByTitle()` and `addStubMention()` functions

**018-007: Confidence visibility in queries**
- File: `src/services/index/query.ts`
- Fix: Changed confidence to always be returned with default of 0.5
- Previously: confidence only included if explicitly set in database
- Now: `frontmatter.confidence = row.confidence ?? 0.5`

**018-008: Wiki-link syntax in titles**
- Files: `src/utils/markdown.ts`, `src/services/atomic/analyzer.ts`, `src/services/atomic/hub-manager.ts`, `src/tools/improve.ts`, `src/services/vault/stub-manager.ts`, `src/services/atomic/splitter.ts`
- Root cause: Auto-linking ran on content before atomic splitting, corrupting section titles
- Fix: Added `stripWikiLinks()` utility function and applied comprehensively
- Applied to ALL title extraction and creation points:
  - `extractTitle()`, `extractHeadings()` (markdown.ts)
  - `extractSections()`, `extractTitle()`, `detectSubConcepts()` (analyzer.ts)
  - `extractTitleFromBody()` (hub-manager.ts)
  - `parseSections()`, `applyUpdateSection()` (improve.ts)
  - `createStub()`, `createStubsForUnresolvedLinks()` (stub-manager.ts)
  - `buildHubContent()`, `buildChildContent()`, `splitBySubConcepts()` (splitter.ts)
- Test: Added `tests/unit/utils/markdown.test.ts` with 17 tests
- Result: "[[_index]] Overview" → "_index Overview" (then indexes cleanly)

**018-009: Similar stub title detection**
- File: `src/services/vault/stub-manager.ts`
- Fix: Enhanced `findStubByTitle()` to use two-stage matching:
  1. Exact match (case-insensitive) on title
  2. Slug-based match on path for near-duplicates
- Handles cases like "Container Runtime Interface" vs "Container Runtime Interface (CRI)"
- Prevents duplicate stubs when titles are similar but not identical

**018-010: Auto-split for palace_improve**
- Files: `src/tools/improve.ts`, `src/types/intent.ts`
- Problem: When `palace_improve` added content exceeding atomic limits, it only warned
- Fix: Added `auto_split` parameter (default: true) that triggers full atomic splitting
- When enabled and content exceeds limits:
  1. Note is converted to hub + children structure
  2. Original file is deleted
  3. Hub and child notes are created and indexed
- Output now includes `split_result` with hub_path, children_paths, children_count
- Message includes "auto-split into hub + N children" when triggered

**018-011: Domain-aware search filtering**
- Files: `src/tools/check.ts`, `src/types/intent.ts`
- Problem: Searching for "containers" (tech) matched "container-growing.md" (gardening)
- Fix: Added `path_filter` parameter to constrain search results by path prefix
- Usage: `palace_check({ query: "containers", path_filter: "infrastructure" })`
- Filtering logic checks if note path starts with or contains the filter value
- Reduces false positives when searching across multi-domain vaults

**018-012: New palace_stubs tool**
- File: `src/tools/stubs.ts` (new), `src/tools/index.ts`
- Purpose: List all stub notes that need expansion
- Parameters:
  - `path_filter`: Filter stubs by path prefix
  - `sort_by`: 'created' (default), 'mentions', or 'title'
  - `limit`: Max results (default: 50)
  - `vault`: Vault alias
- Output includes:
  - `stubs`: Array with path, title, domain, created, mentioned_in, mention_count
  - `summary`: total_stubs, oldest_stub, most_mentioned, domains_with_stubs
- Helps AI prioritize which stubs to expand (most mentioned = most needed)

---

### Second Test Round (2025-12-08) - After 018-008 to 018-012 Fixes

**Connection & Setup**: ✅ Success
- Claude Desktop connected successfully
- Both vaults detected: claude (rw), luci (ro)
- Cross-vault search enabled

**Test Results:**
- 27 notes created across 2 domains (gardening, infrastructure)
- Multi-vault discovery working
- Topic-based storage working correctly
- Atomic splitting working correctly
- Auto-linking functional
- Stub creation functional
- palace_check correctly identified existing vs new content

**Key Observations:**
1. **No title corruption** - All 27 notes have clean titles (018-008 fix working)
2. **No duplicate stubs** - Stub deduplication working (018-009 fix working)
3. **All core functionality verified**

**Recommendations from Testing (implemented as 018-010 to 018-012):**
1. ✅ Auto-split on palace_improve (018-010)
2. ✅ Domain context filtering for palace_check (018-011)
3. ✅ Stub dashboard tool (018-012)

**Ready for final testing round** after clearing vault.

---

### Third Test Round (2025-12-08) - Phase 018 Verification

**Connection & Setup**: ✅ Success
- Claude Desktop connected successfully
- Both vaults detected: claude (rw), luci (ro)
- Cross-vault search enabled

**Phase 018 Obsidian-Native Architecture Verification:**

After clearing the vault, comprehensive testing was performed to validate the new title-style filename architecture.

**Test 1: Green Peppers Research** ✅
- Topic: Growing green peppers from seed in South Africa
- Workflow: web_search → palace_structure → palace_check → palace_store
- Result: Hub + 12 atomic children created
- **Hub filename**: `Growing Green Peppers from Seed.md` (title-style, NOT `_index.md`)
- **Child filenames**: `Climate Requirements.md`, `Gauteng Planting Schedule.md`, etc.
- **Path**: `gardening/vegetables/peppers/`

**Test 2: Kubernetes & Container Runtimes** ✅
- Topic: Kubernetes overview with container runtime expansion
- Workflow: palace_check → palace_store → palace_improve × 7 (stub expansion)
- Result: 109 files in `infrastructure/kubernetes/`
- **Hub notes**: `Kubernetes.md`, `containerd.md`, `CRI-O.md`, `gVisor.md`, etc.
- **Auto-split working**: Each expanded stub became hub + children
- **Cross-domain linking working**: References between runtimes and Kubernetes core

**Key Verifications:**

| Check | Result |
|-------|--------|
| Zero `_index.md` files created | ✅ Verified (0 found) |
| Title-style filenames | ✅ All 122 files use titles |
| Spaces preserved in filenames | ✅ `Green Peppers.md`, `Climate Requirements.md` |
| Case preserved in filenames | ✅ `CRI-O.md`, `gVisor.md` |
| Wiki-links work naturally | ✅ `[[Kubernetes]]`, `[[containerd]]` |
| Hub notes named by title | ✅ `Kubernetes.md` not `kubernetes/_index.md` |
| Child notes named by heading | ✅ `Architecture.md`, `Core Concepts.md` |
| No filename collisions | ✅ Folder context handles similar names |

**Performance Metrics:**

| Metric | Value |
|--------|-------|
| Total files created | 122 |
| Directories created | 13 |
| Hub notes | 9 |
| Average children per hub | 11.2 |
| Wiki-links generated | 100+ |
| Tool calls | 18 |
| Errors | 0 |
| Session duration | ~15 minutes |

**Tools Verified Working:**

| Tool | Status | Notes |
|------|--------|-------|
| `palace_vaults` | ✅ | Multi-vault detection, config retrieval |
| `palace_structure` | ✅ | Directory tree with domain patterns |
| `palace_check` | ✅ | Duplicate detection, domain suggestions |
| `palace_store` | ✅ | Intent-based storage, auto-split |
| `palace_improve` | ✅ | Stub expansion, auto-split on exceed |
| `palace_read` | ✅ | Note content retrieval |
| `palace_list` | ✅ | Directory listing |

**Conclusion:**
Phase 018 Obsidian-Native Architecture is **fully verified**. The system correctly:
1. Creates title-style filenames for all notes
2. Never creates `_index.md` files
3. Generates natural wiki-links (`[[Kubernetes]]`)
4. Preserves case and spaces in filenames
5. Auto-splits large content into hub + children structure

---

**Version**: 1.7
**Last Updated**: 2025-12-08
