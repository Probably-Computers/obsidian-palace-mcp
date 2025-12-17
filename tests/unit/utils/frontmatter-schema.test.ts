/**
 * Tests for frontmatter schema validation (Phase 025)
 */

import { describe, it, expect } from 'vitest';
import {
  validateFrontmatter,
  repairFrontmatter,
  getRequiredFields,
  FRONTMATTER_DEFAULTS,
} from '../../../src/utils/frontmatter-schema.js';

describe('Frontmatter Schema Validation (Phase 025)', () => {
  describe('validateFrontmatter', () => {
    it('should validate correct frontmatter', () => {
      const fm = {
        type: 'research',
        created: '2025-01-01T00:00:00Z',
        modified: '2025-01-02T00:00:00Z',
        confidence: 0.8,
        verified: false,
        tags: ['test'],
        domain: ['tech'],
      };

      const result = validateFrontmatter(fm);
      expect(result.valid).toBe(true);
      expect(result.issues.length).toBe(0);
    });

    it('should detect invalid type and normalize', () => {
      const fm = {
        type: 'research_hub_hub',
        created: '2025-01-01T00:00:00Z',
      };

      const result = validateFrontmatter(fm);
      expect(result.issues.some((i) => i.field === 'type')).toBe(true);
      expect(result.normalized.type).toBe('research_hub');
    });

    it('should detect invalid date format', () => {
      const fm = {
        type: 'research',
        created: 'invalid-date',
        modified: 'also-invalid',
      };

      const result = validateFrontmatter(fm);
      expect(result.valid).toBe(false);
      expect(result.issues.filter((i) => i.field === 'created').length).toBe(1);
      expect(result.issues.filter((i) => i.field === 'modified').length).toBe(1);
    });

    it('should detect invalid confidence range', () => {
      const fm = {
        type: 'research',
        confidence: 1.5,
      };

      const result = validateFrontmatter(fm);
      expect(result.issues.some((i) => i.field === 'confidence')).toBe(true);
    });

    it('should detect non-array domain', () => {
      const fm = {
        type: 'research',
        domain: 'single-domain',
      };

      const result = validateFrontmatter(fm);
      expect(result.issues.some((i) => i.field === 'domain')).toBe(true);
      expect(result.normalized.domain).toEqual(['single-domain']);
    });

    it('should detect non-array tags', () => {
      const fm = {
        type: 'research',
        tags: 'single-tag',
      };

      const result = validateFrontmatter(fm);
      expect(result.issues.some((i) => i.field === 'tags')).toBe(true);
      expect(result.normalized.tags).toEqual(['single-tag']);
    });

    it('should detect missing children_count for hub types', () => {
      const fm = {
        type: 'research_hub',
        created: '2025-01-01T00:00:00Z',
      };

      const result = validateFrontmatter(fm);
      expect(result.issues.some((i) => i.field === 'children_count')).toBe(true);
    });

    it('should detect invalid status value', () => {
      const fm = {
        type: 'research',
        status: 'invalid-status',
      };

      const result = validateFrontmatter(fm);
      expect(result.issues.some((i) => i.field === 'status')).toBe(true);
    });

    it('should detect invalid capture_type value', () => {
      const fm = {
        type: 'research',
        capture_type: 'invalid',
      };

      const result = validateFrontmatter(fm);
      expect(result.issues.some((i) => i.field === 'capture_type')).toBe(true);
    });

    it('should warn about missing source_type for source captures', () => {
      const fm = {
        type: 'research',
        capture_type: 'source',
      };

      const result = validateFrontmatter(fm);
      expect(result.issues.some((i) => i.field === 'source_type')).toBe(true);
    });

    it('should warn about missing project for project captures', () => {
      const fm = {
        type: 'research',
        capture_type: 'project',
      };

      const result = validateFrontmatter(fm);
      expect(result.issues.some((i) => i.field === 'project')).toBe(true);
    });
  });

  describe('repairFrontmatter', () => {
    it('should apply suggestions from validation', () => {
      const fm = {
        type: 'research_hub_hub',
        confidence: 1.5,
      };

      const validation = validateFrontmatter(fm);
      const repaired = repairFrontmatter(fm, validation.issues);

      expect(repaired.type).toBe('research_hub');
    });

    it('should not modify valid frontmatter', () => {
      const fm = {
        type: 'research',
        confidence: 0.8,
      };

      const validation = validateFrontmatter(fm);
      const repaired = repairFrontmatter(fm, validation.issues);

      expect(repaired.type).toBe('research');
      expect(repaired.confidence).toBe(0.8);
    });
  });

  describe('getRequiredFields', () => {
    it('should return required fields for stub type', () => {
      const required = getRequiredFields('stub');
      expect(required).toContain('status');
    });

    it('should return required fields for hub types', () => {
      const required = getRequiredFields('research_hub');
      expect(required).toContain('children_count');
    });

    it('should return empty array for types with no special requirements', () => {
      const required = getRequiredFields('research');
      expect(required.length).toBe(0);
    });

    it('should normalize type before checking', () => {
      const required = getRequiredFields('RESEARCH_HUB');
      expect(required).toContain('children_count');
    });
  });

  describe('FRONTMATTER_DEFAULTS', () => {
    it('should have default values', () => {
      expect(FRONTMATTER_DEFAULTS.verified).toBe(false);
      expect(FRONTMATTER_DEFAULTS.confidence).toBe(0.5);
      expect(FRONTMATTER_DEFAULTS.status).toBe('active');
      expect(FRONTMATTER_DEFAULTS.tags).toEqual([]);
    });
  });
});
