# Phase Management Guide

## Overview

This guide provides standards and best practices for creating and managing development phases. Phase files serve as engineering guides and tracking tools for specific development milestones.

## Purpose of Phase Files

Phase files are living documents that:
- Define clear objectives and scope for a development milestone
- Break down complex work into manageable tasks
- Track progress and completion status
- Reference applicable standards and documentation
- Provide context and guidance for engineers
- Serve as historical documentation of project evolution

## Phase File Lifecycle

### Active Phases
- Location: `docs/phases/`
- Status: Currently in progress or planned
- Actively updated as work progresses

### Completed Phases
- Location: `docs/phases/completed/`
- Status: All acceptance criteria met and verified
- Retained for historical reference and onboarding

## Phase File Structure

Each phase file should follow this standard structure:

### 1. Header Section
```markdown
# Phase [Number]: [Descriptive Title]

**Status**: [Planning | In Progress | Testing | Completed]
**Start Date**: YYYY-MM-DD
**Target Completion**: YYYY-MM-DD
**Actual Completion**: YYYY-MM-DD (if completed)
**Owner**: [Primary responsible party]
```

### 2. Objectives
Clear, measurable goals for this phase. Answer "What are we trying to achieve?"

```markdown
## Objectives

- Primary objective 1
- Primary objective 2
- Expected outcome/deliverable
```

### 3. Prerequisites
Dependencies that must be met before starting this phase.

```markdown
## Prerequisites

- [ ] Prerequisite 1
- [ ] Prerequisite 2
- [ ] Required access/permissions
- [ ] Required tools installed
```

### 4. Scope
Define what is included and excluded from this phase.

```markdown
## Scope

### In Scope
- Feature/component 1
- Feature/component 2

### Out of Scope
- Items deferred to future phases
- Items explicitly not included
```

### 5. Tasks
Detailed, actionable items with status tracking.

```markdown
## Tasks

### Setup
- [ ] Task 1 - Description
- [ ] Task 2 - Description

### Development
- [ ] Task 3 - Description
- [ ] Task 4 - Description

### Testing & Validation
- [ ] Task 5 - Description
- [ ] Task 6 - Description

### Documentation
- [ ] Task 7 - Description
- [ ] Task 8 - Description
```

### 6. Standards & References
Links to applicable coding standards, architecture decisions, and related documentation.

```markdown
## Standards & References

- [Coding Standards](../CODING_STANDARDS.md)
- [API Design Guide](../API_DESIGN.md)
- [Security Guidelines](../SECURITY.md)
- Related documentation or ADRs
```

### 7. Technical Details
Environment configurations, dependencies, technical decisions specific to this phase.

```markdown
## Technical Details

### Environment Configuration
- Environment variables required
- Service endpoints
- Database connections

### Dependencies
- Framework/library versions
- External services
- Internal dependencies
```

### 8. Testing & Quality Assurance
Criteria and methods for validating the work.

```markdown
## Testing & Quality Assurance

### Test Coverage Requirements
- Unit tests: [target %]
- Integration tests: [scope]
- Manual testing checklist

### Quality Checks
- [ ] Code review completed
- [ ] Security review completed
- [ ] Performance benchmarks met
- [ ] Documentation updated
```

### 9. Acceptance Criteria
Specific, measurable criteria that must be met for phase completion.

```markdown
## Acceptance Criteria

- [ ] All tasks completed and verified
- [ ] All tests passing
- [ ] Code merged to main branch
- [ ] Documentation updated
- [ ] Deployed to [environment]
- [ ] Stakeholder sign-off received
```

### 10. Risks & Mitigation
Identified risks and strategies to address them.

```markdown
## Risks & Mitigation

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| Risk 1 | High/Medium/Low | High/Medium/Low | Strategy to address |
```

### 11. Notes & Decisions
Important decisions, context, or learnings captured during the phase.

```markdown
## Notes & Decisions

### [Date] - Decision Title
- Context: Why this decision was needed
- Decision: What was decided
- Rationale: Why this approach was chosen
- Alternatives considered: What else was evaluated
```

## Best Practices

### Creating a New Phase

1. **Number Sequentially**: Use sequential numbering (001, 002, etc.) - never skip or reuse numbers
2. **Descriptive Titles**: Use clear, concise titles that describe the phase goal in UPPERCASE_WITH_UNDERSCORES
3. **Right-Size Scope**: Phases should be completable in 1-4 weeks
4. **Clear Dependencies**: Explicitly state prerequisites and dependencies
5. **Measurable Criteria**: Define concrete acceptance criteria
6. **Review Standards**: Reference all applicable documentation standards

### During Phase Execution

1. **Update Regularly**: Keep task status current (daily or as changes occur)
2. **Document Decisions**: Capture important decisions in the Notes section
3. **Track Blockers**: Add notes about impediments and their resolution
4. **Communicate Progress**: Use task completion rate to communicate status
5. **Quality First**: Don't skip testing or documentation tasks

### Completing a Phase

1. **Verify All Criteria**: Ensure all acceptance criteria are met
2. **Update Status**: Change status to "Completed" and add completion date
3. **Final Review**: Conduct a phase retrospective
4. **Archive Properly**: Move file to `docs/phases/completed/`
5. **Update Links**: Ensure all cross-references are maintained

### Phase Naming Convention

**Required Format:**
```
PHASE_[###]_[DESCRIPTIVE_NAME].md
```

**Components:**
- `[###]`: Three-digit sequential number (001, 002, 003, etc.)
- `[DESCRIPTIVE_NAME]`: Short, clear description using UPPERCASE_WITH_UNDERSCORES

**Sequential Numbering Rules:**
- **Always sequential**: Start at 001 and increment by 1
- **Never skip numbers**: Ensures chronological order is maintained
- **Never reuse numbers**: Even if a phase is deleted
- **Tracks project timeline**: Higher numbers = more recent work
- **Identifies latest phase**: Quickly see what's current vs historical

**Examples:**
- `PHASE_001_DJANGO_API_SETUP.md`
- `PHASE_002_USER_AUTHENTICATION.md`
- `PHASE_003_DATABASE_MIGRATION.md`
- `PHASE_004_API_ENDPOINTS.md`

**Purpose of Sequential Numbering:**
The sequence provides a clear chronological history of project development, making it easy to:
- Identify the most recent work
- Understand the order of implementation
- Track project evolution over time
- Onboard new team members by reviewing phases in order

## Quality Checklist for Phase Files

Before marking a phase file as ready:

- [ ] All sections of the structure are present
- [ ] Objectives are clear and measurable
- [ ] Prerequisites are identified
- [ ] Tasks are specific and actionable
- [ ] Acceptance criteria are measurable
- [ ] References to standards are included
- [ ] Technical details are documented
- [ ] Risks are identified with mitigation strategies

## Common Pitfalls to Avoid

1. **Too Broad**: Phases that try to accomplish too much
2. **Vague Tasks**: Tasks that aren't specific or actionable
3. **Missing Prerequisites**: Not identifying dependencies upfront
4. **No Acceptance Criteria**: Unclear completion definition
5. **Ignoring Standards**: Not referencing applicable documentation
6. **Stale Status**: Not updating task completion regularly
7. **Skipping Documentation**: Leaving documentation tasks incomplete

## Integration with Development Workflow

### Version Control Integration
- Reference phase file in merge/pull request descriptions
- Link commits to specific phase tasks where appropriate
- Use phase completion as milestone markers

### Daily Workflow
1. Check current phase file for today's tasks
2. Update task status as work progresses
3. Document any decisions or blockers
4. Review acceptance criteria regularly

### Code Reviews
- Verify work aligns with phase objectives
- Check that referenced standards are followed
- Ensure phase documentation is updated

### Testing During Phase Work

**Test Efficiently**: Full test suites can take significant time. Use targeted testing strategies for faster feedback during development:

1. **During active development**: Run only tests for the component you're modifying
2. **Before committing**: Run unit tests for quick validation
3. **Before marking phase complete**: Run the full test suite
4. **For CI/CD pipelines**: Full test suite with coverage reports

**Testing Workflow Best Practices:**
- Configure test runners to support running individual files or directories
- Use minimal/quiet reporters during development for faster output
- Reserve comprehensive test runs for phase completion verification
- Document project-specific test commands in CLAUDE.md or README

**Important**: Avoid waiting for full test suites when quick feedback is needed. Target specific test files or use fast reporters for rapid iteration. This prevents long wait times that interrupt development flow.

## Templates

A blank phase template is available at `docs/templates/PHASE_TEMPLATE.md` for quick phase creation.

## Questions?

For questions about phase management or to suggest improvements to this guide:
- Create an issue in your version control system
- Discuss in team meetings
- Update this guide via merge/pull request

---

**Version**: 1.0
**Last Updated**: 2025-11-16
