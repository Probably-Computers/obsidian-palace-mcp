/**
 * Tests for domain analyzer service (Phase 025)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { analyzeDomains, suggestDomainConsolidation, getDomainStats } from '../../../src/services/metadata/domain-analyzer.js';

vi.mock('../../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe('domain analyzer', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT NOT NULL UNIQUE,
        title TEXT,
        type TEXT,
        domain TEXT,
        created TEXT,
        modified TEXT,
        source TEXT,
        confidence REAL,
        verified INTEGER DEFAULT 0
      )
    `);
  });

  afterEach(() => {
    db.close();
  });

  function insertNote(path: string, domain: string) {
    db.prepare('INSERT INTO notes (path, title, domain) VALUES (?, ?, ?)').run(path, path, domain);
  }

  describe('analyzeDomains', () => {
    it('returns empty results for empty vault', () => {
      const result = analyzeDomains(db);
      expect(result.totalDomains).toBe(0);
      expect(result.totalNotes).toBe(0);
      expect(result.orphanedDomains).toHaveLength(0);
    });

    it('counts domain usage across notes', () => {
      insertNote('note1.md', '["kubernetes"]');
      insertNote('note2.md', '["kubernetes"]');
      insertNote('note3.md', '["docker"]');

      const result = analyzeDomains(db);
      expect(result.totalDomains).toBe(2);
      expect(result.domainUsage.get('kubernetes')?.noteCount).toBe(2);
      expect(result.domainUsage.get('docker')?.noteCount).toBe(1);
    });

    it('finds orphaned domains (single note)', () => {
      insertNote('note1.md', '["kubernetes"]');
      insertNote('note2.md', '["kubernetes"]');
      insertNote('note3.md', '["rare-topic"]');

      const result = analyzeDomains(db);
      expect(result.orphanedDomains).toHaveLength(1);
      expect(result.orphanedDomains[0].domain).toBe('rare-topic');
    });

    it('finds similar domains', () => {
      insertNote('note1.md', '["kubernetes"]');
      insertNote('note2.md', '["kubernetes"]');
      insertNote('note3.md', '["kubernete"]'); // typo - very similar
      insertNote('note4.md', '["kubernete"]');

      const result = analyzeDomains(db);
      expect(result.similarDomains.length).toBeGreaterThan(0);
      expect(result.similarDomains[0].similarity).toBeGreaterThanOrEqual(0.8);
    });

    it('returns top domains sorted by usage', () => {
      insertNote('note1.md', '["a"]');
      insertNote('note2.md', '["a"]');
      insertNote('note3.md', '["a"]');
      insertNote('note4.md', '["b"]');
      insertNote('note5.md', '["b"]');
      insertNote('note6.md', '["c"]');

      const result = analyzeDomains(db);
      expect(result.topDomains[0].domain).toBe('a');
      expect(result.topDomains[0].noteCount).toBe(3);
    });

    it('handles comma-separated domain format', () => {
      insertNote('note1.md', 'kubernetes,docker');

      const result = analyzeDomains(db);
      expect(result.totalDomains).toBe(2);
      expect(result.domainUsage.has('kubernetes')).toBe(true);
      expect(result.domainUsage.has('docker')).toBe(true);
    });

    it('handles plain string domain', () => {
      insertNote('note1.md', 'single-domain');

      const result = analyzeDomains(db);
      expect(result.totalDomains).toBe(1);
      expect(result.domainUsage.has('single-domain')).toBe(true);
    });

    it('normalizes domains to lowercase', () => {
      insertNote('note1.md', '["Kubernetes"]');
      insertNote('note2.md', '["kubernetes"]');

      const result = analyzeDomains(db);
      expect(result.domainUsage.get('kubernetes')?.noteCount).toBe(2);
    });
  });

  describe('suggestDomainConsolidation', () => {
    it('suggests merging orphaned domains into similar non-orphaned ones', () => {
      insertNote('note1.md', '["kubernetes"]');
      insertNote('note2.md', '["kubernetes"]');
      insertNote('note3.md', '["kubernete"]'); // orphan with typo

      const analysis = analyzeDomains(db);
      const suggestions = suggestDomainConsolidation(analysis);

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].suggestedDomain).toBe('kubernetes');
    });

    it('respects custom threshold', () => {
      insertNote('note1.md', '["docker"]');
      insertNote('note2.md', '["docker"]');
      insertNote('note3.md', '["dock"]'); // orphan

      const analysis = analyzeDomains(db);
      // Very high threshold should reject suggestions
      const strict = suggestDomainConsolidation(analysis, 0.99);
      expect(strict).toHaveLength(0);
    });
  });

  describe('getDomainStats', () => {
    it('calculates domain statistics', () => {
      insertNote('note1.md', '["kubernetes"]');
      insertNote('note2.md', '["kubernetes"]');
      insertNote('note3.md', '["docker"]');
      insertNote('note4.md', '["rare"]');

      const analysis = analyzeDomains(db);
      const stats = getDomainStats(analysis);

      expect(stats.totalDomains).toBe(3);
      expect(stats.totalNotes).toBe(4);
      expect(stats.orphanedCount).toBe(2); // docker and rare (1 each)
      expect(stats.maxNotesPerDomain).toBe(2);
      expect(stats.topDomain).toBe('kubernetes');
      expect(stats.averageNotesPerDomain).toBeCloseTo(4 / 3);
    });

    it('handles empty analysis', () => {
      const analysis = analyzeDomains(db);
      const stats = getDomainStats(analysis);

      expect(stats.totalDomains).toBe(0);
      expect(stats.orphanedPercent).toBe(0);
      expect(stats.averageNotesPerDomain).toBe(0);
      expect(stats.topDomain).toBeNull();
    });
  });
});
