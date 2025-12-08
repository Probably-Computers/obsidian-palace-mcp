---
type: standard
title: Code Style Standard
domain: [code, style]
ai_binding: recommended
applies_to: [typescript, javascript]
status: active
created: 2025-12-06T10:00:00Z
modified: 2025-12-08T14:30:00Z
source: human
confidence: 1.0
verified: true
tags: [code, style, typescript, javascript, standard]
---

# Code Style Standard

This standard defines code style conventions for TypeScript and JavaScript projects.

## General Principles

1. **Readability over brevity** - Code is read more than written
2. **Consistency** - Follow established patterns in the codebase
3. **Self-documenting** - Prefer clear names over comments
4. **Single responsibility** - One function does one thing

## Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Variables | camelCase | `userName` |
| Functions | camelCase | `getUserById` |
| Classes | PascalCase | `UserService` |
| Interfaces | PascalCase | `UserData` |
| Constants | SCREAMING_SNAKE | `MAX_RETRIES` |
| Files | kebab-case | `user-service.ts` |

## Function Guidelines

### Keep Functions Small

- Max 20-30 lines
- Single responsibility
- One level of abstraction

### Parameter Guidelines

```typescript
// Good - few parameters
function createUser(name: string, email: string): User

// Better - object for many params
function createUser(options: CreateUserOptions): User

// Avoid - too many parameters
function createUser(name: string, email: string, age: number,
                   role: string, department: string): User
```

### Return Early

```typescript
// Good - early return
function processUser(user: User | null): void {
  if (!user) return;
  // process user
}

// Avoid - deep nesting
function processUser(user: User | null): void {
  if (user) {
    // process user
  }
}
```

## TypeScript Specific

### Use Strict Mode

```typescript
// tsconfig.json
{
  "compilerOptions": {
    "strict": true
  }
}
```

### Prefer Interfaces over Types

```typescript
// Preferred for object shapes
interface User {
  id: string;
  name: string;
}

// Use type for unions, intersections
type Status = 'active' | 'inactive';
```

### Avoid `any`

```typescript
// Bad
function process(data: any): any

// Good
function process(data: unknown): Result
function process<T>(data: T): ProcessedData<T>
```

## Comments

### When to Comment

- Complex algorithms
- Non-obvious business logic
- Public API documentation

### When NOT to Comment

```typescript
// Bad - obvious comment
// Increment counter
counter++;

// Good - no comment needed, code is clear
const activeUsers = users.filter(u => u.isActive);
```

## Error Handling

```typescript
// Good - specific error types
throw new ValidationError('Invalid email format');

// Avoid - generic errors
throw new Error('Something went wrong');
```

## AI Guidance

When AI writes or reviews code:

1. **Follow existing patterns** in the codebase
2. **Use TypeScript strict mode** when available
3. **Prefer clarity** over clever solutions
4. **Add types** to all function parameters and returns
5. **Write self-documenting code** - meaningful names, clear structure
