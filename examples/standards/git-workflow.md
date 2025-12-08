---
type: standard
title: Git Workflow Standard
domain: [git, version-control]
ai_binding: required
applies_to: [all]
status: active
created: 2025-12-06T10:00:00Z
modified: 2025-12-08T14:30:00Z
source: human
confidence: 1.0
verified: true
tags: [git, workflow, standard]
---

# Git Workflow Standard

This standard defines how git operations should be performed in all projects.

## Branch Naming

All branches must follow this naming convention:

- `feature/{name}` - New features
- `bugfix/{name}` - Bug fixes
- `hotfix/{name}` - Urgent production fixes
- `release/{version}` - Release preparation

**Examples:**
- `feature/user-authentication`
- `bugfix/login-validation`
- `hotfix/security-patch`

## Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types

| Type | When to Use |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Formatting, no code change |
| `refactor` | Code restructuring |
| `perf` | Performance improvement |
| `test` | Adding tests |
| `build` | Build system changes |
| `ci` | CI configuration |
| `chore` | Maintenance tasks |

### Examples

```
feat(auth): add OAuth2 login support

fix(api): resolve null pointer in user lookup

docs(readme): update installation instructions
```

## Merge Policy

- Never force push to `main` or `master`
- All merges to main require code review
- Squash commits when merging feature branches
- Keep commit history clean and meaningful

## Pre-commit Checks

All commits must pass:
- Linting
- Type checking
- Unit tests

## AI Guidance

When AI assists with git operations:

1. **Always use conventional commit format**
2. **Never suggest force push to protected branches**
3. **Include scope when applicable**
4. **Write meaningful commit messages explaining WHY, not just WHAT**
