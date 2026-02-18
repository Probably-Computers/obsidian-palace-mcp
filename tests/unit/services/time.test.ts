/**
 * Tests for time tracking service (Phase 030)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { join } from 'path';
import { mkdir, rm, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import Database from 'better-sqlite3';

// Set up test environment before importing services
const testDir = join(tmpdir(), `palace-time-test-${randomUUID()}`);
const testVault = join(testDir, 'vault');
const testPalace = join(testVault, '.palace');

process.env.PALACE_VAULTS = `${testVault}:test:rw`;
process.env.PALACE_LOG_LEVEL = 'error';
process.env.PALACE_WATCH_ENABLED = 'false';

import { resetConfig } from '../../../src/config/index';

import {
  parseDuration,
  formatDuration,
  createTimeEntry,
} from '../../../src/services/time/storage.js';

import { aggregateTime } from '../../../src/services/time/aggregator.js';

describe('Time Tracking Service (Phase 030)', () => {
  let db: Database.Database;

  beforeAll(async () => {
    await mkdir(testVault, { recursive: true });
    await mkdir(testPalace, { recursive: true });
    resetConfig();

    const { createDatabase, initializeSchema } = await import(
      '../../../src/services/index/sqlite'
    );
    db = createDatabase(join(testPalace, 'index.sqlite'));
    initializeSchema(db);
  });

  afterAll(async () => {
    if (db && db.open) {
      db.close();
    }
    await rm(testDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    db.exec('DELETE FROM links');
    db.exec('DELETE FROM note_tags');
    db.exec('DELETE FROM notes');
    db.exec('DELETE FROM notes_fts');
  });

  describe('parseDuration', () => {
    it('should parse numeric minutes', () => {
      expect(parseDuration(120)).toBe(120);
      expect(parseDuration(30)).toBe(30);
      expect(parseDuration(0)).toBe(0);
    });

    it('should parse string minutes', () => {
      expect(parseDuration('120')).toBe(120);
      expect(parseDuration('30')).toBe(30);
    });

    it('should parse hours format', () => {
      expect(parseDuration('2h')).toBe(120);
      expect(parseDuration('1h')).toBe(60);
      expect(parseDuration('0.5h')).toBe(30);
      expect(parseDuration('2.5h')).toBe(150);
    });

    it('should parse minutes format', () => {
      expect(parseDuration('30m')).toBe(30);
      expect(parseDuration('45m')).toBe(45);
    });

    it('should parse hours and minutes format', () => {
      expect(parseDuration('2h 30m')).toBe(150);
      expect(parseDuration('1h 15m')).toBe(75);
      expect(parseDuration('2h30m')).toBe(150);
    });

    it('should be case-insensitive', () => {
      expect(parseDuration('2H')).toBe(120);
      expect(parseDuration('30M')).toBe(30);
      expect(parseDuration('2H 30M')).toBe(150);
    });

    it('should round decimal minutes', () => {
      expect(parseDuration(1.7)).toBe(2);
      expect(parseDuration('1.5')).toBe(2);
    });

    it('should throw for invalid input', () => {
      expect(() => parseDuration('')).toThrow();
      expect(() => parseDuration('abc')).toThrow();
      expect(() => parseDuration('2x')).toThrow();
      expect(() => parseDuration(-5)).toThrow();
      expect(() => parseDuration(Infinity)).toThrow();
    });
  });

  describe('formatDuration', () => {
    it('should format minutes only', () => {
      expect(formatDuration(30)).toBe('30m');
      expect(formatDuration(45)).toBe('45m');
    });

    it('should format hours only', () => {
      expect(formatDuration(60)).toBe('1h');
      expect(formatDuration(120)).toBe('2h');
    });

    it('should format hours and minutes', () => {
      expect(formatDuration(90)).toBe('1h 30m');
      expect(formatDuration(150)).toBe('2h 30m');
      expect(formatDuration(75)).toBe('1h 15m');
    });

    it('should handle zero', () => {
      expect(formatDuration(0)).toBe('0m');
    });

    it('should handle negative values', () => {
      expect(formatDuration(-10)).toBe('0m');
    });
  });

  describe('createTimeEntry', () => {
    it('should create a time entry note in the correct path', async () => {
      const result = await createTimeEntry(
        {
          project: 'Palace MCP',
          duration_minutes: 120,
          description: 'Implemented time tracking',
          date: '2026-02-18',
          category: 'development',
          billable: true,
          source: 'manual',
        },
        testVault,
        db
      );

      expect(result.path).toBe('time/2026/02/2026-02-18 - Palace MCP - development.md');
      expect(result.duration_minutes).toBe(120);
      expect(result.duration_formatted).toBe('2h');

      // Verify file content
      const content = await readFile(join(testVault, result.path), 'utf-8');
      expect(content).toContain('type: time_entry');
      expect(content).toContain('project: Palace MCP');
      expect(content).toContain('duration_minutes: 120');
      expect(content).toContain('category: development');
      expect(content).toContain('billable: true');
      expect(content).toContain('**Duration**: 2h');
      expect(content).toContain('Implemented time tracking');
    });

    it('should handle filename conflicts with numeric suffix', async () => {
      await createTimeEntry(
        {
          project: 'TestProject',
          duration_minutes: 60,
          description: 'First entry',
          date: '2026-01-15',
          category: 'development',
        },
        testVault,
        db
      );

      const result2 = await createTimeEntry(
        {
          project: 'TestProject',
          duration_minutes: 30,
          description: 'Second entry',
          date: '2026-01-15',
          category: 'development',
        },
        testVault,
        db
      );

      expect(result2.path).toContain('(2)');
    });

    it('should include optional fields when provided', async () => {
      const result = await createTimeEntry(
        {
          project: 'ClientProject',
          duration_minutes: 90,
          description: 'Client meeting',
          date: '2026-02-18',
          client: 'Acme Corp',
          category: 'meetings',
          session_id: 'session-123',
          work_items: ['Project Plan', 'Meeting Notes'],
        },
        testVault,
        db
      );

      const content = await readFile(join(testVault, result.path), 'utf-8');
      expect(content).toContain('client: Acme Corp');
      expect(content).toContain('session_id: session-123');
      expect(content).toContain('[[Project Plan]]');
      expect(content).toContain('[[Meeting Notes]]');
    });

    it('should index the created note', async () => {
      await createTimeEntry(
        {
          project: 'IndexTest',
          duration_minutes: 45,
          description: 'Testing indexing',
          date: '2026-02-18',
          category: 'research',
        },
        testVault,
        db
      );

      const row = db.prepare("SELECT * FROM notes WHERE type = 'time_entry'").get() as Record<string, unknown>;
      expect(row).toBeDefined();
      expect(row.type).toBe('time_entry');
    });
  });

  describe('aggregateTime', () => {
    beforeEach(async () => {
      // Create test time entries
      await createTimeEntry(
        { project: 'Alpha', duration_minutes: 120, description: 'Dev work', date: '2026-02-10', category: 'development', client: 'ClientA', billable: true },
        testVault, db
      );
      await createTimeEntry(
        { project: 'Alpha', duration_minutes: 60, description: 'Code review', date: '2026-02-11', category: 'review', client: 'ClientA', billable: true },
        testVault, db
      );
      await createTimeEntry(
        { project: 'Beta', duration_minutes: 90, description: 'Research', date: '2026-02-12', category: 'research', client: 'ClientB', billable: false },
        testVault, db
      );
    });

    it('should aggregate by project', async () => {
      const result = await aggregateTime(db, testVault, {}, 'project');

      expect(result.total_entries).toBe(3);
      expect(result.grand_total_minutes).toBe(270);
      expect(result.groups.length).toBe(2);

      const alpha = result.groups.find(g => g.key === 'Alpha');
      expect(alpha).toBeDefined();
      expect(alpha!.total_minutes).toBe(180);
      expect(alpha!.entry_count).toBe(2);
    });

    it('should aggregate by client', async () => {
      const result = await aggregateTime(db, testVault, {}, 'client');

      const clientA = result.groups.find(g => g.key === 'ClientA');
      expect(clientA).toBeDefined();
      expect(clientA!.total_minutes).toBe(180);
    });

    it('should aggregate by date', async () => {
      const result = await aggregateTime(db, testVault, {}, 'date');

      expect(result.groups.length).toBe(3);
    });

    it('should aggregate by category', async () => {
      const result = await aggregateTime(db, testVault, {}, 'category');

      const dev = result.groups.find(g => g.key === 'development');
      expect(dev).toBeDefined();
      expect(dev!.total_minutes).toBe(120);
    });

    it('should filter by project', async () => {
      const result = await aggregateTime(db, testVault, { project: 'Alpha' }, 'project');

      expect(result.total_entries).toBe(2);
      expect(result.grand_total_minutes).toBe(180);
    });

    it('should filter by date range', async () => {
      const result = await aggregateTime(
        db, testVault,
        { date_from: '2026-02-11', date_to: '2026-02-12' },
        'project'
      );

      expect(result.total_entries).toBe(2);
      expect(result.grand_total_minutes).toBe(150);
    });

    it('should filter by billable', async () => {
      const result = await aggregateTime(db, testVault, { billable: true }, 'project');

      expect(result.total_entries).toBe(2);
      expect(result.grand_total_minutes).toBe(180);
    });

    it('should include entries when requested', async () => {
      const result = await aggregateTime(db, testVault, {}, 'project', true);

      const alpha = result.groups.find(g => g.key === 'Alpha');
      expect(alpha!.entries).toBeDefined();
      expect(alpha!.entries!.length).toBe(2);
    });

    it('should format grand total', async () => {
      const result = await aggregateTime(db, testVault, {}, 'project');

      expect(result.grand_total_formatted).toBe('4h 30m');
    });
  });
});
