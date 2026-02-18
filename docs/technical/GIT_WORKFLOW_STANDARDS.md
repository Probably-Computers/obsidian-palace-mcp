# Git Workflow and Version Control Standards

## Overview

This document outlines Git workflow standards and version control best practices for collaborative software development. These guidelines ensure consistent, maintainable version history and effective team collaboration.

---

## Table of Contents

1. [Git Workflow Strategy](#git-workflow-strategy)
2. [Branching Standards](#branching-standards)
3. [Commit Message Conventions](#commit-message-conventions)
4. [Pull Request Guidelines](#pull-request-guidelines)
5. [Code Review Process](#code-review-process)
6. [Merge Strategies](#merge-strategies)
7. [Git Best Practices](#git-best-practices)
8. [Version Tagging](#version-tagging)

---

## Git Workflow Strategy

### Recommended: Trunk-Based Development

**For most Django projects:**
- Single main branch (trunk)
- Short-lived feature branches (< 2 days)
- Frequent integration
- Continuous deployment ready

**Benefits:**
- 28% faster delivery times
- Simpler workflow
- Better for CI/CD
- Fewer merge conflicts

**When to use:**
- Senior development teams
- Continuous deployment
- Fast-paced development

### Alternative: GitHub Flow

**Simple branch-based workflow:**
- Main branch always deployable
- Feature branches from main
- Pull requests for all changes
- Deploy after merge

### GitFlow (Legacy)

Use only when:
- Multiple production versions
- Scheduled releases
- Large teams with juniors

**Note:** GitFlow has fallen in popularity for modern continuous delivery.

---

## Branching Standards

### Branch Types

**Main branches:**
- `main` - Production-ready code
- `staging` - Pre-production testing
- `develop` - (optional) Integration branch

**Supporting branches:**
- `feature/*` - New features
- `bugfix/*` - Bug fixes
- `hotfix/*` - Urgent production fixes
- `release/*` - Release preparation

### Naming Convention

**Format:** `type/description` or `type/issue-number-description`

**Examples:**
```
feature/user-authentication
feature/123-add-payment
bugfix/fix-login-redirect
bugfix/456-resolve-cache
hotfix/critical-security-patch
release/v1.2.0
```

**Rules:**
- Lowercase
- Hyphens between words
- Descriptive but concise
- Include issue number when applicable

### Branch Lifecycle

**Limits:**
- Feature branches: < 2 days
- Bugfix branches: < 1 day
- Hotfix branches: < 4 hours

**Management:**
- Delete after merging
- Review weekly for stale branches
- Keep branches updated with main

---

## Commit Message Conventions

### Conventional Commits Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Commit Types

**Primary types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Code style (formatting)
- `refactor`: Code refactoring
- `perf`: Performance improvement
- `test`: Tests
- `build`: Build system
- `ci`: CI/CD changes
- `chore`: Maintenance

### Subject Line Rules

**Seven golden rules:**
1. Limit to 50 characters
2. Capitalize first letter
3. No period at end
4. Use imperative mood ("add" not "added")
5. Describe what and why, not how
6. Be specific and clear
7. Reference issues when applicable

**Good examples:**
```
feat(auth): add login endpoint
fix(api): resolve pagination bug
docs(readme): update installation
```

**Bad examples:**
```
updated stuff                    # Too vague
Added new feature for users      # Past tense
fix: fixed the bug that was...   # Too long
```

### Body and Footer

**Body (when needed):**
- Wrap at 72 characters
- Explain what and why, not how
- Use bullet points for multiple changes

**Footer:**
- Issue references: `Closes #123`
- Breaking changes: `BREAKING CHANGE:`
- Co-authors: `Co-authored-by: Name <email>`

**Example:**
```
feat(auth): implement OAuth2 social authentication

Add support for Google, GitHub, and Facebook OAuth2.
Includes automatic user creation and account linking.

BREAKING CHANGE: Session-based auth removed.
Clients must migrate to JWT.

Closes #456
Co-authored-by: Jane Doe <jane@example.com>
```

---

## Pull Request Guidelines

### PR Title Format

```
[Type] Brief description (#issue-number)
```

**Examples:**
```
[Feature] Add user profile API endpoints (#123)
[Bugfix] Fix article pagination issue (#456)
[Hotfix] Resolve critical authentication bug (#789)
```

### PR Description Template

```markdown
## Description
Brief summary of changes.

## Type of Change
- [ ] New feature
- [ ] Bug fix
- [ ] Breaking change
- [ ] Documentation

## Related Issues
Closes #123

## Changes Made
- Item 1
- Item 2
- Item 3

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests pass
- [ ] Manual testing completed

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] Tests pass locally
```

### PR Size Guidelines

**Keep PRs small:**
- **XS**: < 50 lines
- **S**: 50-200 lines
- **M**: 200-400 lines (max recommended)
- **L**: 400-800 lines (split if possible)
- **XL**: > 800 lines (must split)

---

## Code Review Process

### Review Principles

**Goals:**
- Ensure code quality
- Share knowledge
- Catch bugs early
- Maintain standards

**Guidelines:**
- Be respectful and constructive
- Explain reasoning
- Suggest improvements
- Approve quickly when ready

### Reviewer Checklist

- [ ] Code is clear and readable
- [ ] Logic is sound
- [ ] Tests cover new code
- [ ] No obvious bugs
- [ ] Security best practices followed
- [ ] Performance acceptable
- [ ] Documentation updated
- [ ] Follows project standards

### Comment Types

**Use clear labels:**
- **⛔ Blocking:** Must be fixed before merge
- **💡 Suggestion:** Consider this improvement
- **❓ Question:** Asking for clarification
- **✨ Nitpick:** Minor style preference
- **🎉 Praise:** Acknowledging good work

### Review Timeline

**Response times:**
- Small PRs (< 200 lines): Within 4 hours
- Medium PRs (200-400 lines): Within 8 hours
- Large PRs (> 400 lines): Within 24 hours

**Author responses:**
- Reply to comments within 24 hours
- Update PR within 48 hours
- Merge within 72 hours of approval

---

## Merge Strategies

### Squash and Merge (Recommended)

- Combines all commits into one
- Clean, linear history
- Easier to revert
- Good for feature branches

**Use for:** Feature branches → Main

### Rebase and Merge

- Replays commits on target branch
- Linear history preserved
- Individual commits maintained

**Use for:** Hotfix branches → Main

### Merge Commit

- Preserves all commits
- Shows branch history
- Can be messy

**Use for:** Release branches → Main (preserve history)

### Before Merging

**Checklist:**
- [ ] All required approvals received
- [ ] All CI checks passing
- [ ] Conflicts resolved
- [ ] Branch up to date with target
- [ ] Tests passing locally

---

## Git Best Practices

### Commit Frequency

**Commit often:**
- After each logical change
- When tests pass
- Before switching tasks
- At end of day

**Atomic commits:**
- One logical change per commit
- Complete and functional
- Can be reverted safely

### Keeping Branches Updated

**Sync with main regularly:**
```bash
git fetch origin
git rebase origin/main
# Or: git merge origin/main
```

**Frequency:**
- Daily for long-running branches
- Before creating PR
- After major main updates

### Avoiding Common Mistakes

**Don't commit:**
- Secrets or API keys
- Environment files (.env)
- IDE configurations
- Build artifacts (node_modules, venv)
- Temporary files
- Large binary files

**Use .gitignore properly:**
```
# Python
*.pyc
__pycache__/
.venv/
venv/

# Django
*.log
db.sqlite3
media/

# IDE
.vscode/
.idea/

# Environment
.env
.env.local
```

### Undoing Changes

**Common scenarios:**

```bash
# Undo last commit (keep changes)
git reset --soft HEAD~1

# Undo last commit (discard changes)
git reset --hard HEAD~1

# Amend last commit
git commit --amend

# Revert pushed commit
git revert <commit-hash>

# Discard local changes
git checkout -- <file>
```

---

## Version Tagging

### Semantic Versioning

**Format:** `MAJOR.MINOR.PATCH`

**Increment:**
- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes

**Examples:**
- `1.0.0` - Initial release
- `1.1.0` - New feature added
- `1.1.1` - Bug fix
- `2.0.0` - Breaking change

### Creating Tags

```bash
# Annotated tag
git tag -a v1.2.0 -m "Release version 1.2.0"
git push origin v1.2.0

# Create GitHub release
gh release create v1.2.0 \
  --title "Version 1.2.0" \
  --notes-file CHANGELOG.md
```

### Tag Naming

- Use `v` prefix: `v1.0.0`
- Pre-release: `v1.0.0-beta.1`
- Build metadata: `v1.0.0+20250101`

**When to tag:**
- Production releases
- Release candidates
- Major milestones

---

## Git Hooks

### Pre-commit (Husky + lint-staged)

Pre-commit hooks are managed by [Husky](https://typicode.github.io/husky/) and [lint-staged](https://github.com/lint-staged/lint-staged):

- **Automatic setup**: `npm install` sets up Husky via the `prepare` script
- **Hook**: `.husky/pre-commit` runs `npx lint-staged`
- **lint-staged config** (in `package.json`): runs `eslint --ext .ts` on staged `src/**/*.ts` files
- **Effect**: Commits are blocked if ESLint finds errors in staged TypeScript files

**Bypass (emergencies only):**
```bash
git commit --no-verify  # Skip hooks — CI will still catch issues
```

**Configuration (package.json):**
```json
{
  "lint-staged": {
    "src/**/*.ts": ["eslint --ext .ts"]
  }
}
```

---

## Branch Protection

### Protected Branches

Protect: `main`, `staging`, `develop`

**Required rules:**
- Require pull request before merging
- Require 1-2 approvals
- Dismiss stale reviews on new commits
- Require status checks to pass
- Require conversation resolution
- No force pushes
- No deletions

**Required status checks (GitHub Actions CI):**
- Linting passes (`npm run lint`)
- Type checking passes (`npm run typecheck`)
- Build succeeds (`npm run build`)
- All tests pass with coverage (`npm run test:coverage`)
- Coverage target: ≥ 80% (tracked via Codacy)

---

## Continuous Integration

### GitHub Actions CI Pipeline

Defined in `.github/workflows/ci.yml`.

**Triggers:**
- Push to `main`
- Pull requests targeting `main`

**Matrix:** Node 18, 20, 22 on Ubuntu

**Steps (all matrix entries):**
1. `npm ci` — install dependencies
2. `npm run lint` — ESLint
3. `npm run typecheck` — TypeScript type checking
4. `npm run build` — compile to dist/
5. `npm run test:coverage` — vitest with v8 coverage

**Coverage upload (Node 22 + push to main only):**
- LCOV report uploaded to [Codacy](https://app.codacy.com/gh/Probably-Computers/obsidian-palace-mcp/dashboard)
- Uses `codacy/codacy-coverage-reporter-action` with `CODACY_API_TOKEN` secret

**Required checks for merge:**
- All CI jobs pass (lint, typecheck, build, tests)
- Coverage target: ≥ 80%

---

## Summary Checklist

### Repository Setup
- [ ] Main branch protected
- [ ] Required status checks configured
- [ ] Pre-commit hooks installed
- [ ] .gitignore comprehensive
- [ ] README up to date

### Branching
- [ ] Using consistent naming
- [ ] Branches short-lived (< 2 days)
- [ ] Regular syncing with main
- [ ] Delete after merge

### Commits
- [ ] Following Conventional Commits
- [ ] Atomic and focused
- [ ] Clear, descriptive messages
- [ ] Frequent commits

### Pull Requests
- [ ] Small and focused (< 400 lines)
- [ ] Good description
- [ ] Tests included
- [ ] Timely reviews
- [ ] Quick merges after approval

### Code Review
- [ ] Constructive feedback
- [ ] Timely responses
- [ ] All comments addressed
- [ ] Approval before merge

---

## Additional Resources

- [Conventional Commits](https://www.conventionalcommits.org/)
- [Trunk-Based Development](https://trunkbaseddevelopment.com/)
- [GitHub Flow](https://guides.github.com/introduction/flow/)
- [Semantic Versioning](https://semver.org/)
- [Husky](https://typicode.github.io/husky/)
- [lint-staged](https://github.com/lint-staged/lint-staged)

---

**Document Version:** 1.1
**Last Updated:** February 2026
**Maintained By:** Development Team
