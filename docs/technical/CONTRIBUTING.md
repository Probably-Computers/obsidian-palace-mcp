# Contributing to Obsidian Palace MCP

Thank you for your interest in contributing to Obsidian Palace MCP! This document provides guidelines and information for contributors.

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- npm or yarn
- An Obsidian vault for testing

### Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/Probably-Computers/obsidian-palace-mcp.git
   cd obsidian-palace-mcp
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .envrc.example .envrc
   # Edit .envrc with your vault path
   direnv allow
   ```

4. Run in development mode:
   ```bash
   npm run dev
   ```

## Development Workflow

### Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- tests/unit/services/index.test.ts
```

### Code Quality

```bash
# Run linter
npm run lint

# Fix linting issues
npm run lint:fix

# Type checking
npm run typecheck
```

### Building

```bash
# Build the project
npm run build

# Test with MCP Inspector
npm run inspect
```

## Code Style

### TypeScript Guidelines

- Use strict TypeScript (`strict: true` in tsconfig)
- Prefer `type` over `interface` for object types
- Use Zod for runtime validation of all tool inputs
- Export types from `types/index.ts`

### File Organization

- Keep files under 200 lines
- One tool per file in `src/tools/`
- One service per file in `src/services/`
- Shared utilities in `src/utils/`

### Naming Conventions

- Files: `kebab-case.ts`
- Functions: `camelCase`
- Types/Interfaces: `PascalCase`
- Constants: `SCREAMING_SNAKE_CASE`

## Git Workflow

### Branches

- `main` - Production-ready code
- `feature/{name}` - New features
- `bugfix/{name}` - Bug fixes
- `hotfix/{name}` - Urgent production fixes

### Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body>
```

**Types:**
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation
- `style` - Formatting
- `refactor` - Code restructuring
- `perf` - Performance improvement
- `test` - Adding tests
- `build` - Build system
- `ci` - CI configuration
- `chore` - Other changes

**Examples:**
```
feat(tools): add palace_session_start tool
fix(recall): improve search ranking accuracy
docs(readme): update installation instructions
```

### Pull Requests

1. Create a feature branch from `main`
2. Make your changes
3. Ensure tests pass: `npm test`
4. Ensure linting passes: `npm run lint`
5. Commit with conventional commit message
6. Push and create a Pull Request

## Adding New Tools

1. Create tool file in `src/tools/{name}.ts`
2. Define Zod input schema
3. Create `Tool` definition with JSON Schema
4. Implement handler function
5. Register in `src/tools/index.ts`
6. Add tests in `tests/unit/tools/{name}.test.ts`
7. Update documentation in `CLAUDE.md`

### Tool Template

```typescript
import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolResult } from '../types/index.js';

const inputSchema = z.object({
  // Define input validation
});

export const myTool: Tool = {
  name: 'palace_my_tool',
  description: 'Description of what this tool does',
  inputSchema: {
    type: 'object',
    properties: {
      // JSON Schema for MCP
    },
    required: [],
  },
};

export async function myToolHandler(
  args: Record<string, unknown>
): Promise<ToolResult> {
  const parseResult = inputSchema.safeParse(args);
  if (!parseResult.success) {
    return {
      success: false,
      error: parseResult.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; '),
      code: 'VALIDATION_ERROR',
    };
  }

  // Implement tool logic
  return {
    success: true,
    data: {
      // Return data
    },
  };
}
```

## Testing

### Unit Tests

- Test each function in isolation
- Mock external dependencies
- Cover success and error cases

### Integration Tests

- Test complete workflows
- Use temporary test vault
- Clean up after tests

### Test Naming

```typescript
describe('Component', () => {
  describe('method', () => {
    it('does something specific', () => {
      // test
    });
  });
});
```

## Documentation

- Update `CLAUDE.md` for project guidelines
- Update `README.md` for user documentation
- Document new tools with examples
- Update `CHANGELOG.md` for releases

## Reporting Issues

When reporting issues, please include:

1. Description of the problem
2. Steps to reproduce
3. Expected behavior
4. Actual behavior
5. Environment (Node version, OS)
6. Relevant error messages or logs

## Publishing to npm (Maintainers)

### Prerequisites

- npm account with publish access to `obsidian-palace-mcp`
- Granular access token (required due to 2FA)

### Creating a Granular Access Token

npm requires 2FA for publishing. Since biometric-only 2FA doesn't work with CLI, use a granular access token:

1. Go to https://www.npmjs.com/settings/YOUR_USERNAME/tokens
2. Click "Generate New Token" → "Granular Access Token"
3. Configure:
   - Name: `palace-publish` (or similar)
   - Expiration: 7 days (or as needed)
   - Packages: Select `obsidian-palace-mcp`
   - Permissions: "Read and write"
   - Organizations: None needed
   - **Enable "Bypass 2FA for automation"**
4. Copy the generated token

### Publishing Process

1. Ensure all tests pass:
   ```bash
   npm run test:fast
   npm run build
   ```

2. Update version in `package.json` if needed:
   ```bash
   npm version patch  # or minor/major
   ```

3. Set the auth token:
   ```bash
   npm config set //registry.npmjs.org/:_authToken YOUR_TOKEN
   ```

4. Publish:
   ```bash
   npm publish --access public
   ```

5. Verify:
   ```bash
   npm view obsidian-palace-mcp
   ```

6. Clean up token from config (optional but recommended):
   ```bash
   npm config delete //registry.npmjs.org/:_authToken
   ```

**Note:** Granular tokens expire (default 7 days). Create a new token for each release session.

## Questions?

Open an issue or reach out to the maintainers.

## License

By contributing, you agree that your contributions will be licensed under the AGPL-3.0 License.
