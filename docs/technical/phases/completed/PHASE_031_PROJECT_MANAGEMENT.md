# Phase 031: Project Management

**Status**: Completed
**Start Date**: 2026-02-18
**Completion Date**: 2026-02-18
**Owner**: Adam

## Objectives

- Enable AI-assisted project context management within the Memory Palace, replacing manual tools like ClickUp
- Provide efficient project context loading for new AI sessions ("continue where I left off")
- Support project status tracking, progress reporting, and work item management
- Integrate with time tracking data (Phase 030) for project-level time visibility

## Prerequisites

- [x] Phase 029 (Quality and Integrity Fixes) completed
- [x] Phase 030 (Time Tracking) completed
- [x] Research on industry standards for project management completed
- [x] Research on best practices for AI-assisted project management completed

## Scope

### In Scope
- Project context summary tool (load everything needed to resume work on a project)
- Project status tracking (backlog, todo, in_progress, blocked, review, done, on_hold, cancelled)
- Work item tracking within project notes (checklist-based, not separate notes)
- Progress reporting via work item completion counts
- Integration with time tracking data from Phase 030
- Project-level search and filtering (add project/client filters to existing query)
- Multi-project dashboard (all active projects at brief depth)
- Client-level rollup

### Out of Scope
- Gantt charts or timeline visualization (Obsidian plugins can handle this)
- Resource allocation / team management
- Budget tracking / financial management
- Sprint planning (may be a future phase)
- Integration with external project management tools (Jira, ClickUp, Asana)
- Notifications or reminders
- Separate work item notes (work items are checklists in project content, not individual files)
- Story points or velocity tracking
- Formal change control or risk matrices

## Research Findings

### Industry Standards (PMBOK, PRINCE2, Agile)

**PMBOK**: The WBS (Work Breakdown Structure) is the most universally useful artifact. Palace's hub/children pattern IS a WBS. A project hub is the top level; deliverable sections and task lists are the children. Skip EVM, RACI, formal change control -- all overhead for solo/small team.

**PRINCE2**: Product-based planning -- define deliverables (what you produce) before tasks (what you do). This means the project summary should foreground deliverables with acceptance criteria rather than raw task lists.

**Kanban/GTD**: Status is the most important field. Every lightweight system revolves around moving items through states. The status set should be small (8 max) and must include a "blocked/waiting" state -- critical for consulting where you often wait on client feedback. GTD's "waiting_for" maps to `blocked` with `blocked_by` context.

**Personal Kanban**: Simplicity enables adoption. If the schema has more than 10-12 fields, a solo consultant will not maintain it. Every field must earn its place.

### Tool Patterns (ClickUp, Notion, Linear, Obsidian)

**Linear**: Cleanest model. Opinionated workflow: Triage > Backlog > Todo > In Progress > In Review > Done > Cancelled. 5 priority levels (No priority, Urgent, High, Medium, Low). Project milestones for organizing issues within projects. Key insight: opinionated defaults reduce decision fatigue.

**Notion**: Minimal setup philosophy -- "start basic, add only as needed." Core properties: Status, Priority, Due Date. Freelancers consistently report they use fewer than 5 custom fields.

**Obsidian ecosystem**: Tasks plugin uses emoji format or Dataview-compatible inline fields. Projects plugin uses frontmatter properties. Our frontmatter approach aligns with the ecosystem.

### AI Context Loading (Critical Research Area)

**Context rot is real**: Anthropic's own research shows AI agents get dumber with too much context. The attention mechanism degrades with volume. Default to Standard depth, not Deep.

**AIST Protocol**: Demonstrates that project state can be expressed in constant-size format (~950 tokens, 60x compression). Key sections: HEADER, ESSENCE, MEMORY, DECISIONS, THREADS, HANDOFF. Inspiration for our brief/standard depth levels.

**Progressive disclosure** (Claude-Mem pattern): 3 layers (index > timeline > details). 10x token savings. Load the table of contents first; use `palace_read` for on-demand detail.

**Cursor/Claude Code pattern**: Separate "knowing what exists" (lightweight index) from "loading content" (tool calls for specifics). The project summary should be an orientation document, not a data dump.

**Single tool with depth parameter** is better than multiple tools -- avoids AI routing decisions. One compositor tool that aggregates from existing services.

**Token budgets:**
| Level | Target Tokens | Max Tokens | Use Case |
|-------|---------------|------------|----------|
| Brief | 200-300 | 500 | Dashboard, triage, multi-project |
| Standard | 2,000-3,000 | 5,000 | Session resume (primary use case) |
| Deep | 8,000-12,000 | 20,000 | Onboarding, major planning |

**Information priority ordering:**
1. Orientation (project name, status, client, description)
2. Current state (active work items, blockers)
3. Recent activity (changes since last session)
4. Structure (hub, Knowledge Map)
5. History (time summary, completed milestones, decisions)
6. Reference (full content, detailed logs)

### Existing Palace Infrastructure

Codebase exploration confirmed strong foundations:
- `project_hub` type already valid in note-types
- Time tracking links to projects via `frontmatter.project`
- Hub/children pattern maps directly to project structure
- Path resolution already handles `projects/{project}/` and `clients/{client}/`

**Gaps filled during implementation:**
- Added `project` and `client` columns to SQLite notes table (schema migration)
- Added `project`/`client` filter options to query service
- Created work item parser for markdown checklists
- Created project context loader with brief/standard/deep depth levels
- Created `palace_project_summary` tool

## Design Decisions

### 2026-02-18 - Research-Informed Design

**D1: Single tool with depth parameter**
- Decision: Implement one `palace_project_summary` tool with `depth: brief | standard | deep`
- Rationale: Research shows single tool with progressive disclosure outperforms multiple specialized tools. AI avoids routing decisions. One compositor tool calls existing services internally.

**D2: Work items as markdown checklists with wiki-link drill-down**
- Decision: Work items live as `- [ ] Task description` checklists in project hub content. Items that need detail link to notes via wiki-links: `- [ ] [[API Authentication]] - Implement scope-based permissions [priority:high]`
- Rationale: Avoids note bloat while supporting drill-down. Checklists are Obsidian-native, readable, and parseable. Simple items stay inline; complex items link to full notes for detail. This mirrors real-world patterns (e.g., phase docs linking to change docs, sprints linking to phases). The parser extracts wiki-links from work items and the context loader can follow them for deeper context.
- Format: `- [ ] Task title [priority:high] [due:2026-03-15] [blocked_by:client review]`
- Linked format: `- [ ] [[Note Title]] - Description [priority:high]`

**D3: 8 project status states**
- Decision: `backlog`, `todo`, `in_progress`, `blocked`, `review`, `done`, `on_hold`, `cancelled`
- Rationale: Converges across PMBOK, PRINCE2, Kanban, Linear, GTD. Includes `blocked` (critical for consulting) and `on_hold` (paused projects). Maps to Linear's status groups.

**D4: 4 priority levels**
- Decision: `critical`, `high`, `medium`, `low`
- Rationale: Universal across tools. Four levels is the sweet spot; more creates decision fatigue.

**D5: Project metadata in frontmatter with lightweight schema migration**
- Decision: Store project status, deadline, budget_hours in existing frontmatter `[key: string]: unknown` extension. Add `project` and `client` columns to SQLite notes table for indexed querying.
- Rationale: Frontmatter is the source of truth; DB columns enable efficient filtering. Schema migration is safe (ALTER TABLE ADD COLUMN, idempotent check).

**D6: Extend existing query service with project/client filters**
- Decision: Add `project` and `client` filter options to `queryNotesInVault()` and `countNotesInVault()`
- Rationale: With indexed DB columns, project/client filtering is efficient. Enables "show all notes for project X" without new tools.

**D7: Context freshness tiers**
- Decision: Hot (today/since last session) = include with previews. Warm (this week) = titles + summaries. Cool (this month) = counts only.
- Rationale: Delta information is more useful than full state for returning to a project. Matches AIST protocol's approach.

**D8: No separate palace_project_status tool**
- Decision: Use `palace_improve` with `mode: frontmatter` to update project status. Use `palace_project_summary` with `depth: brief` to read status.
- Rationale: Avoid tool proliferation. Existing tools handle status reads and writes. The summary tool handles the "dashboard" use case.

## Tasks

### Research
- [x] Research industry standards for project management data models (PMI PMBOK, PRINCE2 concepts)
- [x] Research lightweight project management approaches suitable for consultancies and freelancers
- [x] Research existing tools (ClickUp, Notion, Linear, Obsidian project plugins) for data model patterns
- [x] Research how AI assistants can efficiently summarize and present project context
- [x] Define the project data model (status, milestones, work items, relationships)
- [x] Define how project data integrates with existing Palace structures (hubs, domains, tags)
- [x] Document research findings and design decisions
- [x] Review existing workflow templates (pc-standards, pw-docs) for real-world patterns

### Core Implementation
- [x] Add project/client filter support to query service (`src/services/index/query.ts`)
- [x] Create project context loading service (`src/services/project/context-loader.ts`)
- [x] Implement work item parser (extract checklists from markdown content)
- [x] Implement `palace_project_summary` tool with depth parameter
- [x] Support multi-project queries ("show all active projects", "client rollup")

### Context Loading
- [x] Brief depth: project metadata, status, active item count, blockers count, time this week
- [x] Standard depth: + work items with status/priority, recent changes, Knowledge Map, time summary, recent decisions
- [x] Deep depth: + full hub content, session history, related projects, stubs/orphans, applicable standards

### Integration
- [x] Integrate with Phase 030 `aggregateTime()` for project-level time data
- [x] Integrate with vault reader for hub/Knowledge Map content
- [x] Integrate with history service for change detection (modified since last session)
- [x] Ensure project summaries work across multi-vault configurations

### Testing & Validation
- [x] Unit tests for work item parser
- [x] Unit tests for context loader (brief, standard, deep)
- [x] Unit tests for project/client query filters
- [x] Integration tests for time tracking integration
- [x] Integration tests for multi-project queries

### Documentation
- [x] Update CLAUDE.md with `palace_project_summary` tool schema
- [x] Document project note conventions (frontmatter fields, work item format)
- [x] Document context loading options and output format

## Technical Details

### Project Hub Frontmatter Schema

```yaml
---
type: project_hub
title: "Project Name"
project: "Project Name"
client: "Client Name"              # Optional
status: in_progress                 # backlog|todo|in_progress|blocked|review|done|on_hold|cancelled
priority: high                      # critical|high|medium|low
start_date: 2026-02-18             # When work begins
due_date: 2026-03-15               # Deadline
completed_date:                     # Auto-set when status -> done
budget_hours: 40                    # Optional estimated total hours
billable: true                      # Default true
children_count: 5
domain: [consulting, web-dev]
tags: [active, q1-2026]
created: 2026-02-18T10:00:00Z
modified: 2026-02-18T10:00:00Z
---
```

### Work Item Format (in project hub content)

```markdown
## Work Items

### Active
- [ ] Design API endpoints [priority:high] [due:2026-02-25]
- [ ] [[API Authentication]] - Implement scope-based permissions [priority:high] [blocked_by:client review]
- [ ] Write integration tests [priority:medium]

### Completed
- [x] Set up project repository
- [x] [[Architecture Document]] - Initial system design
```

Work items support two styles:
1. **Inline**: `- [ ] Task description [annotations...]` -- for simple tasks
2. **Linked**: `- [ ] [[Note Title]] - Description [annotations...]` -- for complex items with detail notes

The parser extracts wiki-links from work items. At standard/deep depth, linked notes are read for additional context (title, status, summary).

Work item annotations (optional, parsed by context loader):
- `[priority:high]` -- Priority level (critical, high, medium, low)
- `[due:YYYY-MM-DD]` -- Due date
- `[blocked_by:description]` -- What's blocking this item
- `[category:development]` -- Time tracking category hint

### palace_project_summary Tool Schema

```typescript
{
  project: string;               // Project name or path (required)
  vault?: string;                // Vault alias
  depth?: 'brief' | 'standard' | 'deep';  // Context depth (default: standard)
  lookback_days?: number;        // Days to look back for changes (default: 7)
  include_time?: boolean;        // Include time summary (default: true)
}
```

### Output Schema by Depth

**Brief** (~200-500 tokens):
```json
{
  "project": "PC Standards",
  "client": "ProbablyComputers",
  "status": "in_progress",
  "priority": "high",
  "path": "projects/pc-standards/",
  "description": "Standards framework research for PC",
  "last_modified": "2026-02-15T14:30:00Z",
  "work_items": { "total": 12, "done": 5, "in_progress": 3, "blocked": 1 },
  "time_this_week": { "total_formatted": "8h", "total_minutes": 480 },
  "blockers": ["Waiting on client review of design doc"],
  "sections_available": ["work_items", "recent_changes", "knowledge_map", "time_detail", "decisions"]
}
```

**Standard** (~1K-5K tokens): Brief + work items with details, recent changes, Knowledge Map, time by category, recent decisions.

**Deep** (~5K-20K tokens): Standard + full hub content, session history, related projects, orphans/stubs, applicable standards with content.

### Files Created/Modified

**New files:**
- `src/services/project/context-loader.ts` -- Project context aggregation (brief/standard/deep)
- `src/services/project/work-items.ts` -- Parse work items from markdown checklists
- `src/services/project/index.ts` -- Re-exports
- `src/tools/project-summary.ts` -- palace_project_summary tool
- `tests/unit/services/project.test.ts` -- 31 unit tests

**Modified files:**
- `src/services/index/sqlite.ts` -- Added project/client columns + indexes + migration
- `src/services/index/sync.ts` -- Extract project/client from frontmatter during indexing
- `src/services/index/query.ts` -- Added project/client filter options to FilterOptions, queryNotesInVault, countNotesInVault
- `src/tools/query.ts` -- Exposed project/client filters in palace_query tool schema
- `src/tools/index.ts` -- Registered palace_project_summary
- `CLAUDE.md` -- Tool documentation, directory structure, query filter docs

## Acceptance Criteria

- [x] Research completed and documented
- [x] `palace_project_summary` returns project context at brief/standard/deep depths
- [x] Project status tracked via frontmatter, queryable via existing tools
- [x] Work items parsed from markdown checklists with status/priority/due dates
- [x] Time tracking data (Phase 030) integrated into project summaries
- [x] Multi-project queries work (all active projects, client rollup)
- [x] Query service supports project/client filters
- [x] All tests passing (760 tests, 0 failures)
- [x] Documentation updated

## Risks & Mitigation

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| Project model doesn't fit diverse workflows | High | Low | Research validated against PMBOK, PRINCE2, Kanban, Linear, consultant use cases |
| Context loading returns too much data for AI context window | Medium | Low | Three depth levels with token budgets; default to Standard |
| Overlap with existing Palace features (hubs, sessions) | Medium | Low | Extend existing structures; no new DB tables or note types |
| Work item parsing is fragile | Medium | Medium | Simple checkbox + annotation format; graceful fallback for unparsed items |
| Scope creep into full PM tool | High | Medium | Strict scope -- Palace manages project knowledge, not workflows |

## Notes & Decisions

### 2026-02-18 - Phase Creation
- Context: User feedback requested project context summary and management to replace ClickUp
- Decision: Create as separate phase with mandatory research before implementation, dependent on Phase 030 (Time Tracking)
- Rationale: Project management is a broad domain; research ensures we build features that fit real consultancy workflows rather than reinventing a generic PM tool
- Key insight: The core value is "give me everything I need to know about project X to continue where I left off" -- this is an AI-first use case that existing PM tools don't handle well

### 2026-02-18 - Research Complete
- Researched: PMI PMBOK, PRINCE2, Kanban, GTD, Personal Kanban, ClickUp, Notion, Linear, Obsidian Tasks/Projects plugins, AIST Protocol, Cursor/Claude Code/Windsurf/Cody context patterns, Claude-Mem progressive disclosure
- Key findings: (1) Single tool with depth parameter beats multiple tools (2) Status is the most important field (3) 8 status states converge across all standards (4) Work items as checklists avoid note bloat (5) Progressive disclosure saves 10x tokens (6) Context rot means less is more
- Decision: One `palace_project_summary` tool with 3 depth levels, work items as markdown checklists, extend existing query/type infrastructure

### 2026-02-18 - Existing Workflow Template Review
- Reviewed: pc-standards templates (phase, sprint, change, skill), pw-docs phase structure, sprint-process standard, change-management standard, plan-sprint/review-phase skills
- Key patterns observed:
  - Three-tier hierarchy: Sprint (cross-repo coordination) > Phase (single deliverable) > Change (small modification)
  - Checklists organized by category (Setup, Development, Testing, Documentation) used universally
  - AI skill-driven lifecycle (`/plan-sprint`, `/implement-phase`, `/review-phase`, `/create-change`)
  - Rich linking between tiers: changes reference phases, phases reference sprints
  - Status lifecycle: Planning > In Progress > Testing > Completed (4 states for phases)
  - Acceptance criteria as checklists with measurable conditions
- What applies to Palace (generic):
  - Checklist work items with wiki-link drill-down to detail notes (confirmed D2 refinement)
  - Status tracking via frontmatter (already in D3/D5)
  - Progress measured by checklist completion counts (already in scope)
  - Categories for organizing work items within a project (Setup, Development, Testing, Docs)
- What stays out of scope (too workflow-specific):
  - Sprint coordination, velocity tracking, capacity planning (team-focused)
  - Change management process, rollback plans, hotfix workflow (process-heavy)
  - CI/CD integration, pipeline verification (tooling-specific)
  - Story points, sizing guidelines (estimation methodology)
