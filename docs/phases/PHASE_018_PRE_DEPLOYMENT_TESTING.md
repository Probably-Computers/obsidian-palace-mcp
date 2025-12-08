# Phase 018: Pre-Deployment Testing

**Status**: Pending
**Start Date**: TBD
**Target Completion**: TBD
**Owner**: Adam Claassens

> **Note:** This phase was previously numbered 017. It was renumbered to 018 to accommodate Phase 017 (Topic-Based Architecture), which implements critical architectural changes that must be completed before final testing.

## Objectives

- Validate MCP server works with real Claude Desktop client
- Test all tools with actual Obsidian vaults
- Verify new topic-based AI behavior protocols work in practice
- Identify bugs and edge cases before release
- Confirm production readiness

## Prerequisites

- [x] Phase 008-016 completed
- [ ] **Phase 017 completed (Topic-Based Architecture)**
- [ ] All unit/integration tests passing
- [ ] Documentation updated for new architecture
- [ ] Test vaults accessible
- [ ] Claude Desktop configured with dev server

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
      "args": ["/Users/adamc/Documents/GitLab/obsidian-palace-mcp/dist/index.js"],
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
cd /Users/adamc/Documents/GitLab/obsidian-palace-mcp
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

- [ ] Clear test vaults (fresh start after Phase 017 changes)
- [ ] Build project: `npm run build`
- [ ] Configure Claude Desktop
- [ ] Restart Claude Desktop
- [ ] Verify MCP connection works

### Quick Smoke Test

- [ ] `palace_vaults` - Lists both vaults with correct modes
- [ ] `palace_structure` - Shows vault directory tree with domain patterns
- [ ] `palace_recall` - Search finds existing notes
- [ ] `palace_read` - Can read a specific note
- [ ] `palace_store` - Creates a note at topic-based path

### Topic-Based Architecture Testing (NEW - Phase 017)

#### Domain Path Resolution

- [ ] Knowledge stored at domain path (e.g., `gardening/vegetables/peppers/`)
- [ ] Source captures go to `sources/{type}/{title}/`
- [ ] Project context goes to `projects/{project}/`
- [ ] No hardcoded type-to-folder mappings observed

**Test prompt:**
```
Research how to grow tomatoes in containers. Store what you learn.
```
Expected: Notes created at `gardening/vegetables/tomatoes/` or similar topic path (NOT `research/` or `technologies/`)

#### AI Observation Behavior

- [ ] AI calls `palace_structure` before storing to understand vault
- [ ] AI calls `palace_check` to find existing knowledge
- [ ] AI adapts to existing vault conventions

**Test prompt:**
```
What do you know about wireless networking? Check my vault first.
```
Expected: AI examines vault structure before responding

#### New Top-Level Domain Confirmation

- [ ] AI asks before creating new top-level domains
- [ ] Existing similar domains are suggested
- [ ] User confirmation is respected

**Test prompt (on fresh vault):**
```
Document the basics of woodworking joints.
```
Expected: AI asks "Should I create a 'woodworking' section?" before storing

#### Source vs Knowledge Distinction

- [ ] Source captures include source metadata
- [ ] Knowledge captures are standalone, reusable
- [ ] Knowledge notes reference sources but don't duplicate

**Test prompts:**
```
# Source capture:
I'm reading "The Pragmatic Programmer". Help me capture the key ideas from chapter 1.

# Knowledge capture:
What is the DRY principle in programming?
```
Expected: First goes to `sources/books/the-pragmatic-programmer/`, second goes to `programming/principles/` or similar

#### Domain Suggestions

- [ ] `palace_check` returns suggested domains
- [ ] Suggestions are based on existing vault structure
- [ ] AI can accept or modify suggestions

#### Organic Connections

- [ ] AI discovers related notes via `palace_check`
- [ ] Links are meaningful, not excessive
- [ ] Bidirectional awareness where appropriate

### Tool Testing (via Claude conversation)

#### Core Tools
- [ ] `palace_store` - Create note with topic-based resolution
- [ ] `palace_check` - Check for existing knowledge + domain suggestions
- [ ] `palace_improve` - Update existing note
- [ ] `palace_read` - Read note by path
- [ ] `palace_recall` - Full-text search

#### Structure Tools
- [ ] `palace_list` - List notes in directory
- [ ] `palace_structure` - Get vault tree with domain patterns
- [ ] `palace_vaults` - List configured vaults

#### Graph Tools
- [ ] `palace_links` - Get backlinks/outlinks
- [ ] `palace_orphans` - Find disconnected notes
- [ ] `palace_related` - Find related content
- [ ] `palace_autolink` - Auto-link content

#### Query Tools
- [ ] `palace_query` - Property-based query
- [ ] `palace_dataview` - DQL query execution

#### Standards Tools
- [ ] `palace_standards` - Load binding standards
- [ ] `palace_standards_validate` - Validate compliance

#### Session Tools
- [ ] `palace_session_start` - Start a session
- [ ] `palace_session_log` - Log to session

#### AI Support Tools
- [ ] `palace_clarify` - Generate clarifying questions (including domain_selection)

### Read-Only Vault Testing

- [ ] Verify `palace_recall` works on luci vault
- [ ] Verify `palace_read` works on luci vault
- [ ] Verify `palace_store` fails with clear error on luci vault
- [ ] Verify `palace_improve` fails with clear error on luci vault

### Edge Case Testing

- [ ] Unicode characters in note titles
- [ ] Notes without frontmatter
- [ ] Empty search results
- [ ] Invalid vault alias
- [ ] Non-existent path
- [ ] Very deep domain paths (5+ levels)
- [ ] Domain with special characters

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
6. Creates gardening/vegetables/peppers/_index.md + atomic notes
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
5. Creates networking/wireless/lora/_index.md + atomic notes
```

### Scenario 3: Source Material Capture

```
User: "I'm reading 'Clean Code'. Help me capture the key ideas."

Expected AI behavior:
1. Recognizes this is source capture (studying a book)
2. palace_store() with capture_type: 'source'
3. Creates sources/books/clean-code/_index.md
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
- [ ] All smoke tests pass
- [ ] Topic-based architecture validated
- [ ] Domain suggestions working
- [ ] Source/knowledge distinction correct
- [ ] All tool tests pass
- [ ] AI behavior protocols validated
- [ ] Read-only enforcement verified
- [ ] No critical bugs found

## Acceptance Criteria

- [ ] Claude Desktop connects to dev MCP server
- [ ] All tools callable and functional
- [ ] **Topic-based paths working (domain = folder)**
- [ ] **Domain suggestions returned by palace_check**
- [ ] **AI asks before new top-level domains**
- [ ] **Source vs knowledge distinction working**
- [ ] AI behavior protocols work as designed
- [ ] Read-only vault properly enforced
- [ ] No critical or high severity bugs
- [ ] Ready for npm publish

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

**Version**: 1.1
**Last Updated**: 2025-12-08
