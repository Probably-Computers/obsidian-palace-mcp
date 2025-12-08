import { describe, it, expect } from 'vitest';
import { buildSemanticDomainPath, buildDomainPathFromVault } from '../../../src/tools/check.js';

describe('buildSemanticDomainPath (legacy - no vault context)', () => {
  describe('stop word filtering', () => {
    it('should filter out common stop words', () => {
      const result = buildSemanticDomainPath(['the', 'quick', 'brown', 'fox']);
      expect(result).not.toContain('the');
      expect(result).toContain('quick');
      expect(result).toContain('brown');
    });

    it('should filter out prepositions', () => {
      const result = buildSemanticDomainPath(['running', 'in', 'the', 'park']);
      expect(result).not.toContain('in');
      expect(result).not.toContain('the');
      expect(result).toContain('running');
      expect(result).toContain('park');
    });

    it('should filter out pronouns', () => {
      const result = buildSemanticDomainPath(['my', 'awesome', 'project']);
      expect(result).not.toContain('my');
      expect(result).toContain('awesome');
      expect(result).toContain('project');
    });
  });

  describe('word length filtering', () => {
    it('should filter out very short words', () => {
      const result = buildSemanticDomainPath(['a', 'go', 'run', 'sprint']);
      expect(result).not.toContain('a');
      expect(result).not.toContain('go');
      expect(result).toContain('run');
      expect(result).toContain('sprint');
    });
  });

  describe('sorting by significance', () => {
    it('should prioritize longer words as more specific', () => {
      const result = buildSemanticDomainPath(['cat', 'elephant', 'dog']);
      // Longer words come first
      expect(result[0]).toBe('elephant');
    });

    it('should limit to 3 path segments', () => {
      const result = buildSemanticDomainPath([
        'gardening', 'vegetables', 'tomatoes', 'cherry', 'organic'
      ]);
      expect(result.length).toBeLessThanOrEqual(3);
    });
  });

  describe('real queries', () => {
    it('should handle "green peppers growing"', () => {
      const result = buildSemanticDomainPath(['green', 'peppers', 'growing']);
      // Should return meaningful words sorted by length
      expect(result).toContain('peppers');
      expect(result).toContain('growing');
      expect(result).toContain('green');
    });

    it('should handle query with stop words', () => {
      const result = buildSemanticDomainPath([
        'how', 'to', 'grow', 'tomatoes', 'in', 'containers'
      ]);
      expect(result).not.toContain('how');
      expect(result).not.toContain('to');
      expect(result).not.toContain('in');
      expect(result).toContain('containers');
      expect(result).toContain('tomatoes');
    });
  });
});

describe('buildDomainPathFromVault (dynamic - with vault context)', () => {
  // Simulate a vault with existing domains
  const mockVaultDomains = new Map([
    ['gardening', { noteCount: 15, level: 1 }],
    ['gardening/vegetables', { noteCount: 10, level: 2 }],
    ['gardening/vegetables/peppers', { noteCount: 5, level: 3 }],
    ['infrastructure', { noteCount: 20, level: 1 }],
    ['infrastructure/containers', { noteCount: 12, level: 2 }],
    ['infrastructure/networking', { noteCount: 8, level: 2 }],
    ['programming', { noteCount: 25, level: 1 }],
    ['programming/languages', { noteCount: 15, level: 2 }],
  ]);

  describe('exact domain matching', () => {
    it('should match query word to existing domain', () => {
      const result = buildDomainPathFromVault(
        ['gardening', 'tips'],
        mockVaultDomains
      );
      expect(result[0]).toBe('gardening');
    });

    it('should match to deeper domain when word matches', () => {
      const result = buildDomainPathFromVault(
        ['vegetables', 'growing'],
        mockVaultDomains
      );
      // Should match gardening/vegetables
      expect(result).toContain('gardening');
      expect(result).toContain('vegetables');
    });

    it('should match peppers to gardening/vegetables/peppers', () => {
      const result = buildDomainPathFromVault(
        ['peppers', 'seeds', 'starting'],
        mockVaultDomains
      );
      expect(result).toContain('gardening');
      expect(result).toContain('vegetables');
      expect(result).toContain('peppers');
    });
  });

  describe('partial matching', () => {
    it('should match partial word to domain', () => {
      const result = buildDomainPathFromVault(
        ['container', 'orchestration'],
        mockVaultDomains
      );
      // 'container' should match 'containers' domain
      expect(result).toContain('infrastructure');
      expect(result).toContain('containers');
    });

    it('should match networking-related queries', () => {
      const result = buildDomainPathFromVault(
        ['network', 'protocols'],
        mockVaultDomains
      );
      expect(result).toContain('infrastructure');
      expect(result).toContain('networking');
    });
  });

  describe('no match fallback', () => {
    it('should return meaningful words when no domain match', () => {
      const result = buildDomainPathFromVault(
        ['astronomy', 'telescope', 'stars'],
        mockVaultDomains
      );
      // No matching domain, should return query words sorted by length
      expect(result.length).toBeGreaterThan(0);
      // Should contain all meaningful words (astronomy and telescope are same length)
      expect(result).toContain('astronomy');
      expect(result).toContain('telescope');
    });
  });

  describe('stop word filtering', () => {
    it('should filter stop words even with vault context', () => {
      const result = buildDomainPathFromVault(
        ['the', 'gardening', 'is', 'fun'],
        mockVaultDomains
      );
      expect(result).not.toContain('the');
      expect(result).not.toContain('is');
      expect(result).toContain('gardening');
    });
  });

  describe('adding specificity', () => {
    it('should add remaining words as sub-path', () => {
      const result = buildDomainPathFromVault(
        ['gardening', 'tomatoes'],
        mockVaultDomains
      );
      // Should match gardening and add tomatoes
      expect(result[0]).toBe('gardening');
      expect(result).toContain('tomatoes');
    });
  });

  describe('empty vault', () => {
    it('should work with empty vault', () => {
      const emptyVault = new Map<string, { noteCount: number; level: number }>();
      const result = buildDomainPathFromVault(
        ['kubernetes', 'deployment'],
        emptyVault
      );
      // Should return meaningful words
      expect(result.length).toBeGreaterThan(0);
      expect(result).toContain('kubernetes');
      expect(result).toContain('deployment');
    });
  });
});
