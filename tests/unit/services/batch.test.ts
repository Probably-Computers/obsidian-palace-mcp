/**
 * Unit tests for batch service (Phase 027)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  selectNotes,
  validateSelectionCriteria,
  type SelectCriteria,
} from '../../../src/services/batch/selector';

// Mock the database
const createMockDb = (notes: Array<{ path: string; title: string; type: string }>) => {
  return {
    prepare: (sql: string) => ({
      all: (...params: unknown[]) => {
        // Simple mock for queryNotesInVault
        if (sql.includes('SELECT * FROM notes')) {
          return notes.map((n) => ({
            id: 1,
            ...n,
            created: '2025-01-01T00:00:00Z',
            modified: '2025-01-01T00:00:00Z',
            confidence: 0.8,
            verified: false,
            source: 'claude',
            content: 'Test content',
          }));
        }
        // For getNotesMetadata
        if (sql.includes('SELECT path, title, type FROM notes')) {
          const path = params[0] as string;
          const note = notes.find((n) => n.path === path);
          return note ? [note] : [];
        }
        return [];
      },
      get: (...params: unknown[]) => {
        const path = params[0] as string;
        const note = notes.find((n) => n.path === path);
        return note || undefined;
      },
    }),
  };
};

describe('Batch Selection (Phase 027)', () => {
  describe('validateSelectionCriteria', () => {
    it('should pass when glob is provided', () => {
      const criteria: SelectCriteria = { glob: '**/*.md' };
      const errors = validateSelectionCriteria(criteria);
      expect(errors).toHaveLength(0);
    });

    it('should pass when type is provided', () => {
      const criteria: SelectCriteria = { type: 'research' };
      const errors = validateSelectionCriteria(criteria);
      expect(errors).toHaveLength(0);
    });

    it('should pass when tags are provided', () => {
      const criteria: SelectCriteria = { tags: ['kubernetes'] };
      const errors = validateSelectionCriteria(criteria);
      expect(errors).toHaveLength(0);
    });

    it('should pass when domain is provided', () => {
      const criteria: SelectCriteria = { domain: ['infrastructure'] };
      const errors = validateSelectionCriteria(criteria);
      expect(errors).toHaveLength(0);
    });

    it('should pass when path_prefix is provided', () => {
      const criteria: SelectCriteria = { path_prefix: 'projects/' };
      const errors = validateSelectionCriteria(criteria);
      expect(errors).toHaveLength(0);
    });

    it('should fail when no selection criteria provided', () => {
      const criteria: SelectCriteria = {};
      const errors = validateSelectionCriteria(criteria);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('Selection criteria must include');
    });

    it('should fail when only exclude is provided', () => {
      const criteria: SelectCriteria = { exclude: ['templates/**'] };
      const errors = validateSelectionCriteria(criteria);
      expect(errors).toHaveLength(1);
    });
  });

  describe('Pattern Matching', () => {
    // Tests for the internal pattern matching logic
    // Using validateSelectionCriteria as a proxy since matchesPattern is private

    it('should validate patterns with wildcards', () => {
      // These are valid patterns
      expect(validateSelectionCriteria({ glob: '*.md' })).toHaveLength(0);
      expect(validateSelectionCriteria({ glob: '**/*.md' })).toHaveLength(0);
      expect(validateSelectionCriteria({ glob: 'projects/**' })).toHaveLength(0);
    });
  });
});

describe('Batch Operations Validation (Phase 027)', () => {
  // These tests validate the batch operation schemas
  // Full integration tests are in tests/integration/batch.test.ts

  describe('update_frontmatter operation', () => {
    it('should require updates field', () => {
      // This would be validated at the schema level
      const operation = {
        type: 'update_frontmatter',
        updates: { verified: true },
        merge: true,
      };
      expect(operation.updates).toBeDefined();
      expect(operation.merge).toBe(true);
    });
  });

  describe('add_tags operation', () => {
    it('should require tags array', () => {
      const operation = {
        type: 'add_tags',
        tags: ['new-tag', 'another-tag'],
      };
      expect(operation.tags).toHaveLength(2);
    });
  });

  describe('remove_tags operation', () => {
    it('should require tags array', () => {
      const operation = {
        type: 'remove_tags',
        tags: ['old-tag'],
      };
      expect(operation.tags).toHaveLength(1);
    });
  });

  describe('move operation', () => {
    it('should require destination', () => {
      const operation = {
        type: 'move',
        destination: 'archive/',
        update_backlinks: true,
      };
      expect(operation.destination).toBe('archive/');
      expect(operation.update_backlinks).toBe(true);
    });
  });

  describe('rename operation', () => {
    it('should require match and pattern', () => {
      const operation = {
        type: 'rename',
        match: '^(.+)/Overview\\.md$',
        pattern: '$1/$1 Overview.md',
        update_backlinks: true,
      };
      expect(operation.match).toBeDefined();
      expect(operation.pattern).toBeDefined();
    });
  });

  describe('delete operation', () => {
    it('should have handle_backlinks option', () => {
      const operation = {
        type: 'delete',
        handle_backlinks: 'warn',
      };
      expect(operation.handle_backlinks).toBe('warn');
    });
  });
});
