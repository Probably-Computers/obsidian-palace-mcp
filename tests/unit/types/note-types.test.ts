/**
 * Tests for note type validation (Phase 025)
 */

import { describe, it, expect } from 'vitest';
import {
  VALID_NOTE_TYPES,
  BASE_NOTE_TYPES,
  isValidNoteType,
  isHubType,
  getBaseType,
  getHubType,
  normalizeType,
  validateType,
  getValidTypes,
  getTypesGrouped,
} from '../../../src/types/note-types.js';

describe('Note Types (Phase 025)', () => {
  describe('VALID_NOTE_TYPES', () => {
    it('should include base types', () => {
      expect(VALID_NOTE_TYPES).toContain('research');
      expect(VALID_NOTE_TYPES).toContain('command');
      expect(VALID_NOTE_TYPES).toContain('infrastructure');
      expect(VALID_NOTE_TYPES).toContain('pattern');
      expect(VALID_NOTE_TYPES).toContain('troubleshooting');
    });

    it('should include hub types', () => {
      expect(VALID_NOTE_TYPES).toContain('research_hub');
      expect(VALID_NOTE_TYPES).toContain('command_hub');
      expect(VALID_NOTE_TYPES).toContain('infrastructure_hub');
    });

    it('should include special types', () => {
      expect(VALID_NOTE_TYPES).toContain('stub');
      expect(VALID_NOTE_TYPES).toContain('hub');
      expect(VALID_NOTE_TYPES).toContain('daily');
    });
  });

  describe('isValidNoteType', () => {
    it('should return true for valid types', () => {
      expect(isValidNoteType('research')).toBe(true);
      expect(isValidNoteType('research_hub')).toBe(true);
      expect(isValidNoteType('stub')).toBe(true);
    });

    it('should return false for invalid types', () => {
      expect(isValidNoteType('invalid')).toBe(false);
      expect(isValidNoteType('research_hub_hub')).toBe(false);
      expect(isValidNoteType('')).toBe(false);
      expect(isValidNoteType(null)).toBe(false);
      expect(isValidNoteType(undefined)).toBe(false);
    });
  });

  describe('isHubType', () => {
    it('should identify hub types', () => {
      expect(isHubType('research_hub')).toBe(true);
      expect(isHubType('command_hub')).toBe(true);
      expect(isHubType('hub')).toBe(true);
    });

    it('should return false for non-hub types', () => {
      expect(isHubType('research')).toBe(false);
      expect(isHubType('stub')).toBe(false);
      expect(isHubType('daily')).toBe(false);
    });
  });

  describe('getBaseType', () => {
    it('should return base type from hub type', () => {
      expect(getBaseType('research_hub')).toBe('research');
      expect(getBaseType('command_hub')).toBe('command');
      expect(getBaseType('infrastructure_hub')).toBe('infrastructure');
    });

    it('should return same type for non-hub types', () => {
      expect(getBaseType('research')).toBe('research');
      expect(getBaseType('stub')).toBe('stub');
    });

    it('should handle generic hub', () => {
      expect(getBaseType('hub')).toBe('research');
    });
  });

  describe('getHubType', () => {
    it('should return hub type from base type', () => {
      expect(getHubType('research')).toBe('research_hub');
      expect(getHubType('command')).toBe('command_hub');
      expect(getHubType('infrastructure')).toBe('infrastructure_hub');
    });

    it('should return same type if already hub', () => {
      expect(getHubType('research_hub')).toBe('research_hub');
      expect(getHubType('hub')).toBe('hub');
    });

    it('should return generic hub for unknown types', () => {
      expect(getHubType('unknown')).toBe('hub');
    });
  });

  describe('normalizeType', () => {
    it('should return valid types unchanged', () => {
      expect(normalizeType('research', false)).toBe('research');
      expect(normalizeType('research_hub', false)).toBe('research_hub');
    });

    it('should fix double suffixes', () => {
      expect(normalizeType('research_hub_hub', false)).toBe('research_hub');
      expect(normalizeType('command_hub_hub', false)).toBe('command_hub');
      expect(normalizeType('hub_hub', false)).toBe('hub');
      expect(normalizeType('stub_stub', false)).toBe('stub');
    });

    it('should map common aliases', () => {
      expect(normalizeType('note', false)).toBe('research');
      expect(normalizeType('knowledge', false)).toBe('research');
      expect(normalizeType('tech', false)).toBe('infrastructure');
      expect(normalizeType('bug', false)).toBe('troubleshooting');
      expect(normalizeType('log', false)).toBe('daily');
    });

    it('should default to research for unknown types', () => {
      expect(normalizeType('unknown_type', false)).toBe('research');
      expect(normalizeType('completely_invalid', false)).toBe('research');
    });

    it('should handle non-string values', () => {
      expect(normalizeType(null, false)).toBe('research');
      expect(normalizeType(undefined, false)).toBe('research');
      expect(normalizeType(123, false)).toBe('research');
      expect(normalizeType({}, false)).toBe('research');
    });

    it('should be case-insensitive', () => {
      expect(normalizeType('RESEARCH', false)).toBe('research');
      expect(normalizeType('Research_Hub', false)).toBe('research_hub');
    });
  });

  describe('validateType', () => {
    it('should validate correct types', () => {
      const result = validateType('research');
      expect(result.valid).toBe(true);
      expect(result.type).toBe('research');
      expect(result.corrected).toBe(false);
    });

    it('should correct invalid types', () => {
      const result = validateType('research_hub_hub');
      expect(result.valid).toBe(false);
      expect(result.type).toBe('research_hub');
      expect(result.corrected).toBe(true);
      expect(result.correction).toContain('research_hub_hub');
    });

    it('should include original value', () => {
      const result = validateType('invalid');
      expect(result.original).toBe('invalid');
    });
  });

  describe('getValidTypes', () => {
    it('should return all valid types', () => {
      const types = getValidTypes();
      expect(types).toContain('research');
      expect(types).toContain('research_hub');
      expect(types.length).toBe(VALID_NOTE_TYPES.length);
    });
  });

  describe('getTypesGrouped', () => {
    it('should return grouped types', () => {
      const grouped = getTypesGrouped();
      expect(grouped.content).toContain('research');
      expect(grouped.hub).toContain('research_hub');
      expect(grouped.special).toContain('stub');
    });

    it('should have correct categories', () => {
      const grouped = getTypesGrouped();
      expect(grouped.content.length).toBe(BASE_NOTE_TYPES.length);
      expect(grouped.hub.every((t) => t.endsWith('_hub'))).toBe(true);
    });
  });
});
