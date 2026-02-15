/**
 * Tests for version history storage service (Phase 028)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';

import {
  saveVersion,
  listVersions,
  getVersion,
  getVersionContent,
  cleanupOldVersions,
  deleteAllVersions,
  getHistoryStats,
  getPathHash,
  getHistoryDir,
  getNoteHistoryDir,
  DEFAULT_HISTORY_CONFIG,
} from '../../../src/services/history/storage.js';
import { stringifyFrontmatter } from '../../../src/utils/frontmatter.js';

describe('Version History Service', () => {
  let testDir: string;
  let palaceDir: string;

  beforeEach(async () => {
    // Create a unique test directory
    const uniqueId = randomBytes(8).toString('hex');
    testDir = join(tmpdir(), `palace-history-test-${uniqueId}`);
    palaceDir = join(testDir, '.palace');
    await mkdir(testDir, { recursive: true });
    await mkdir(palaceDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    if (existsSync(testDir)) {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  describe('getPathHash', () => {
    it('should generate consistent hashes for same paths', () => {
      const hash1 = getPathHash('test/note.md');
      const hash2 = getPathHash('test/note.md');
      expect(hash1).toBe(hash2);
    });

    it('should generate different hashes for different paths', () => {
      const hash1 = getPathHash('test/note1.md');
      const hash2 = getPathHash('test/note2.md');
      expect(hash1).not.toBe(hash2);
    });

    it('should be case-insensitive', () => {
      const hash1 = getPathHash('Test/Note.md');
      const hash2 = getPathHash('test/note.md');
      expect(hash1).toBe(hash2);
    });

    it('should return 16-character hash', () => {
      const hash = getPathHash('test/note.md');
      expect(hash).toHaveLength(16);
    });
  });

  describe('getHistoryDir', () => {
    it('should return correct history directory path', () => {
      const result = getHistoryDir('/path/to/.palace');
      expect(result).toBe('/path/to/.palace/history');
    });
  });

  describe('getNoteHistoryDir', () => {
    it('should return correct note history directory path', () => {
      const result = getNoteHistoryDir('/path/to/.palace', 'test/note.md');
      const expectedHash = getPathHash('test/note.md');
      expect(result).toBe(`/path/to/.palace/history/${expectedHash}`);
    });
  });

  describe('saveVersion', () => {
    it('should save a version of a note', async () => {
      const notePath = 'test/note.md';
      const content = stringifyFrontmatter(
        { type: 'research', title: 'Test Note', created: new Date().toISOString() },
        'Test content'
      );

      const version = await saveVersion(palaceDir, notePath, content, 'store');

      expect(version).toBe(1);

      // Verify version was saved
      const versions = await listVersions(palaceDir, notePath);
      expect(versions).toHaveLength(1);
      expect(versions[0]?.version).toBe(1);
    });

    it('should increment version numbers', async () => {
      const notePath = 'test/note.md';
      const content1 = stringifyFrontmatter(
        { type: 'research', title: 'Test Note', created: new Date().toISOString() },
        'Content v1'
      );
      const content2 = stringifyFrontmatter(
        { type: 'research', title: 'Test Note', created: new Date().toISOString() },
        'Content v2'
      );

      const version1 = await saveVersion(palaceDir, notePath, content1, 'store');
      const version2 = await saveVersion(palaceDir, notePath, content2, 'improve');

      expect(version1).toBe(1);
      expect(version2).toBe(2);
    });

    it('should skip version when history is disabled', async () => {
      const notePath = 'test/note.md';
      const content = stringifyFrontmatter(
        { type: 'research', title: 'Test Note' },
        'Test content'
      );

      const version = await saveVersion(palaceDir, notePath, content, 'store', undefined, {
        enabled: false,
      });

      expect(version).toBeNull();
    });

    it('should skip version for excluded patterns', async () => {
      const notePath = 'daily/2025-01-01.md';
      const content = stringifyFrontmatter(
        { type: 'daily', title: 'Daily Note' },
        'Daily content'
      );

      const version = await saveVersion(palaceDir, notePath, content, 'store');

      expect(version).toBeNull();
    });

    it('should include mode for improve operations', async () => {
      const notePath = 'test/note.md';
      const content = stringifyFrontmatter(
        { type: 'research', title: 'Test Note' },
        'Test content'
      );

      await saveVersion(palaceDir, notePath, content, 'improve', 'append');

      const versions = await listVersions(palaceDir, notePath);
      expect(versions[0]?.mode).toBe('append');
    });
  });

  describe('listVersions', () => {
    it('should list versions in descending order', async () => {
      const notePath = 'test/note.md';
      const content = stringifyFrontmatter({ type: 'research', title: 'Test' }, 'Content');

      await saveVersion(palaceDir, notePath, content, 'store');
      await saveVersion(palaceDir, notePath, content, 'improve');
      await saveVersion(palaceDir, notePath, content, 'improve');

      const versions = await listVersions(palaceDir, notePath);
      expect(versions).toHaveLength(3);
      expect(versions[0]?.version).toBe(3);
      expect(versions[1]?.version).toBe(2);
      expect(versions[2]?.version).toBe(1);
    });

    it('should return empty array for non-existent note', async () => {
      const versions = await listVersions(palaceDir, 'nonexistent/note.md');
      expect(versions).toHaveLength(0);
    });

    it('should respect limit parameter', async () => {
      const notePath = 'test/note.md';
      const content = stringifyFrontmatter({ type: 'research', title: 'Test' }, 'Content');

      await saveVersion(palaceDir, notePath, content, 'store');
      await saveVersion(palaceDir, notePath, content, 'improve');
      await saveVersion(palaceDir, notePath, content, 'improve');

      const versions = await listVersions(palaceDir, notePath, 2);
      expect(versions).toHaveLength(2);
      expect(versions[0]?.version).toBe(3);
      expect(versions[1]?.version).toBe(2);
    });
  });

  describe('getVersion', () => {
    it('should retrieve specific version', async () => {
      const notePath = 'test/note.md';
      const content = stringifyFrontmatter(
        { type: 'research', title: 'Test Note', tags: ['test'] },
        'Original content'
      );

      await saveVersion(palaceDir, notePath, content, 'store');

      const version = await getVersion(palaceDir, notePath, 1);
      expect(version).not.toBeNull();
      expect(version?.frontmatter.title).toBe('Test Note');
      expect(version?.body).toBe('Original content');
    });

    it('should return null for non-existent version', async () => {
      const version = await getVersion(palaceDir, 'test/note.md', 99);
      expect(version).toBeNull();
    });

    it('should strip palace_version metadata from returned frontmatter', async () => {
      const notePath = 'test/note.md';
      const content = stringifyFrontmatter(
        { type: 'research', title: 'Test Note' },
        'Content'
      );

      await saveVersion(palaceDir, notePath, content, 'store');

      const version = await getVersion(palaceDir, notePath, 1);
      expect(version?.frontmatter).not.toHaveProperty('palace_version');
    });
  });

  describe('getVersionContent', () => {
    it('should return reconstructed content without palace_version', async () => {
      const notePath = 'test/note.md';
      const originalContent = stringifyFrontmatter(
        { type: 'research', title: 'Test Note' },
        'Test content'
      );

      await saveVersion(palaceDir, notePath, originalContent, 'store');

      const content = await getVersionContent(palaceDir, notePath, 1);
      expect(content).not.toBeNull();
      expect(content).toContain('title: Test Note');
      expect(content).toContain('Test content');
      expect(content).not.toContain('palace_version');
    });
  });

  describe('cleanupOldVersions', () => {
    it('should remove versions exceeding maxVersionsPerNote', async () => {
      const notePath = 'test/note.md';
      const content = stringifyFrontmatter({ type: 'research', title: 'Test' }, 'Content');

      // Create 5 versions
      for (let i = 0; i < 5; i++) {
        await saveVersion(palaceDir, notePath, content, 'improve', undefined, {
          autoCleanup: false,
        });
      }

      // Cleanup with max 3 versions
      const deleted = await cleanupOldVersions(palaceDir, notePath, {
        maxVersionsPerNote: 3,
        maxAgeDays: 90,
      });

      expect(deleted).toBe(2);

      const remaining = await listVersions(palaceDir, notePath);
      expect(remaining).toHaveLength(3);
    });
  });

  describe('deleteAllVersions', () => {
    it('should delete all versions for a note', async () => {
      const notePath = 'test/note.md';
      const content = stringifyFrontmatter({ type: 'research', title: 'Test' }, 'Content');

      await saveVersion(palaceDir, notePath, content, 'store');
      await saveVersion(palaceDir, notePath, content, 'improve');

      const result = await deleteAllVersions(palaceDir, notePath);
      expect(result).toBe(true);

      const versions = await listVersions(palaceDir, notePath);
      expect(versions).toHaveLength(0);
    });

    it('should return true for non-existent note', async () => {
      const result = await deleteAllVersions(palaceDir, 'nonexistent/note.md');
      expect(result).toBe(true);
    });
  });

  describe('getHistoryStats', () => {
    it('should return correct statistics', async () => {
      const content = stringifyFrontmatter({ type: 'research', title: 'Test' }, 'Content');

      // Create versions for 2 notes
      await saveVersion(palaceDir, 'note1.md', content, 'store');
      await saveVersion(palaceDir, 'note1.md', content, 'improve');
      await saveVersion(palaceDir, 'note2.md', content, 'store');

      const stats = await getHistoryStats(palaceDir);
      expect(stats.totalNotes).toBe(2);
      expect(stats.totalVersions).toBe(3);
      expect(stats.totalSizeBytes).toBeGreaterThan(0);
    });

    it('should return zeros for empty history', async () => {
      const stats = await getHistoryStats(palaceDir);
      expect(stats.totalNotes).toBe(0);
      expect(stats.totalVersions).toBe(0);
      expect(stats.totalSizeBytes).toBe(0);
    });
  });

  describe('DEFAULT_HISTORY_CONFIG', () => {
    it('should have expected default values', () => {
      expect(DEFAULT_HISTORY_CONFIG.enabled).toBe(true);
      expect(DEFAULT_HISTORY_CONFIG.maxVersionsPerNote).toBe(50);
      expect(DEFAULT_HISTORY_CONFIG.maxAgeDays).toBe(90);
      expect(DEFAULT_HISTORY_CONFIG.autoCleanup).toBe(true);
      expect(DEFAULT_HISTORY_CONFIG.excludePatterns).toContain('daily/**');
    });
  });
});
