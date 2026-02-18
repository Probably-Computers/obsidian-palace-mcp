/**
 * Index service tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { join } from 'path';
import { mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import Database from 'better-sqlite3';

// Set up test environment before importing services
const testDir = join(tmpdir(), `palace-test-${randomUUID()}`);
const testVault = join(testDir, 'vault');
const testPalace = join(testVault, '.palace');

// Configure environment before imports (use PALACE_VAULTS instead of PALACE_VAULT_PATH)
process.env.PALACE_VAULTS = `${testVault}:test:rw`;
process.env.PALACE_LOG_LEVEL = 'error';
process.env.PALACE_WATCH_ENABLED = 'false';

// Dynamic imports after env setup
import { resetConfig } from '../../../src/config/index';

describe('Index Service', () => {
  let db: Database.Database;

  beforeAll(async () => {
    // Create test vault directory
    await mkdir(testVault, { recursive: true });
    await mkdir(testPalace, { recursive: true });
    resetConfig();

    // Create database for testing
    const { createDatabase, initializeSchema } = await import('../../../src/services/index/sqlite');
    db = createDatabase(join(testPalace, 'index.sqlite'));
    initializeSchema(db);
  });

  afterAll(async () => {
    // Close database
    if (db && db.open) {
      db.close();
    }
    await rm(testDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    // Clear tables between tests
    db.exec('DELETE FROM links');
    db.exec('DELETE FROM note_tags');
    db.exec('DELETE FROM notes');
    db.exec('DELETE FROM notes_fts');
  });

  describe('SQLite Database', () => {
    it('creates database with proper schema', async () => {
      // Verify schema was created
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all() as { name: string }[];

      const tableNames = tables.map((t) => t.name);
      expect(tableNames).toContain('notes');
      expect(tableNames).toContain('note_tags');
      expect(tableNames).toContain('links');
      // Schema version table removed in v2.0 (no migrations needed for initial release)
      expect(tableNames).toContain('technology_mentions');
    });

    it('has FTS5 virtual table', async () => {
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='notes_fts'")
        .all() as { name: string }[];

      expect(tables.length).toBe(1);
    });
  });

  describe('Index Sync', () => {
    it('indexes a note', async () => {
      const { indexNote } = await import('../../../src/services/index/sync');

      const testNote = {
        path: 'research/test-note.md',
        filename: 'test-note.md',
        title: 'Test Note',
        frontmatter: {
          type: 'research' as const,
          created: '2025-01-01T00:00:00Z',
          modified: '2025-01-01T00:00:00Z',
          verified: false,
          tags: ['test', 'example'],
          related: [],
          aliases: [],
        },
        content: '# Test Note\n\nThis is test content with [[Another Note]] link.',
        raw: '---\ntype: research\n---\n\n# Test Note\n\nThis is test content.',
      };

      indexNote(db, testNote);

      const indexed = db.prepare('SELECT * FROM notes WHERE path = ?').get('research/test-note.md') as { title: string; type: string } | undefined;
      expect(indexed).not.toBeNull();
      expect(indexed?.title).toBe('Test Note');
      expect(indexed?.type).toBe('research');
    });

    it('extracts and stores tags', async () => {
      const { indexNote } = await import('../../../src/services/index/sync');

      const testNote = {
        path: 'research/tagged-note.md',
        filename: 'tagged-note.md',
        title: 'Tagged Note',
        frontmatter: {
          type: 'research' as const,
          created: '2025-01-01T00:00:00Z',
          modified: '2025-01-01T00:00:00Z',
          verified: false,
          tags: ['kubernetes', 'docker'],
          related: [],
          aliases: [],
        },
        content: '# Tagged Note\n\nContent here.',
        raw: '---\ntype: research\ntags: [kubernetes, docker]\n---\n\n# Tagged Note',
      };

      indexNote(db, testNote);

      // Get note ID
      const row = db.prepare('SELECT id FROM notes WHERE path = ?').get('research/tagged-note.md') as { id: number };

      const tags = db.prepare('SELECT tag FROM note_tags WHERE note_id = ?').all(row.id) as { tag: string }[];
      const tagNames = tags.map(t => t.tag);
      expect(tagNames).toContain('kubernetes');
      expect(tagNames).toContain('docker');
    });

    it('removes note from index', async () => {
      const { indexNote, removeFromIndex } = await import('../../../src/services/index/sync');

      const testNote = {
        path: 'research/to-remove.md',
        filename: 'to-remove.md',
        title: 'To Remove',
        frontmatter: {
          type: 'research' as const,
          created: '2025-01-01T00:00:00Z',
          modified: '2025-01-01T00:00:00Z',
          verified: false,
          tags: [],
          related: [],
          aliases: [],
        },
        content: '# To Remove',
        raw: '---\ntype: research\n---\n\n# To Remove',
      };

      indexNote(db, testNote);
      expect(db.prepare('SELECT * FROM notes WHERE path = ?').get('research/to-remove.md')).not.toBeNull();

      removeFromIndex(db, 'research/to-remove.md');
      expect(db.prepare('SELECT * FROM notes WHERE path = ?').get('research/to-remove.md')).toBeUndefined();
    });
  });

  describe('Query Builder', () => {
    beforeEach(async () => {
      const { indexNote } = await import('../../../src/services/index/sync');

      // Index test notes
      const notes = [
        {
          path: 'research/kubernetes-basics.md',
          filename: 'kubernetes-basics.md',
          title: 'Kubernetes Basics',
          frontmatter: {
            type: 'research' as const,
            created: '2025-01-01T00:00:00Z',
            modified: '2025-01-01T00:00:00Z',
            verified: true,
            confidence: 0.9,
            tags: ['kubernetes', 'devops'],
            related: [],
            aliases: [],
          },
          content: '# Kubernetes Basics\n\nKubernetes is a container orchestration platform.',
          raw: '---\ntype: research\n---\n\n# Kubernetes Basics',
        },
        {
          path: 'command/docker-build.md',
          filename: 'docker-build.md',
          title: 'Docker Build Command',
          frontmatter: {
            type: 'command' as const,
            created: '2025-01-02T00:00:00Z',
            modified: '2025-01-02T00:00:00Z',
            verified: false,
            confidence: 0.7,
            tags: ['docker', 'devops'],
            related: [],
            aliases: [],
          },
          content: '# Docker Build Command\n\nBuild images with docker build.',
          raw: '---\ntype: command\n---\n\n# Docker Build Command',
        },
      ];

      for (const note of notes) {
        indexNote(db, note);
      }
    });

    it('searches notes with FTS5', async () => {
      const { searchNotesInVault } = await import('../../../src/services/index/query');

      const results = searchNotesInVault(db, { query: 'kubernetes' });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]?.note.title).toBe('Kubernetes Basics');
    });

    it('ranks title matches above content-only matches', async () => {
      const { indexNote } = await import('../../../src/services/index/sync');
      const { searchNotesInVault } = await import('../../../src/services/index/query');

      // Clear existing data
      db.exec('DELETE FROM links');
      db.exec('DELETE FROM note_tags');
      db.exec('DELETE FROM notes');
      db.exec('DELETE FROM notes_fts');

      // Note with "time tracking" in title
      indexNote(db, {
        path: 'research/time-tracking.md',
        filename: 'time-tracking.md',
        title: 'Time Tracking',
        frontmatter: {
          type: 'research' as const,
          created: '2025-01-01T00:00:00Z',
          modified: '2025-01-01T00:00:00Z',
          verified: false,
          tags: [],
          related: [],
          aliases: [],
        },
        content: '# Time Tracking\n\nA guide to tracking time.',
        raw: '---\ntype: research\n---\n\n# Time Tracking\n\nA guide to tracking time.',
      });

      // Note that mentions "time tracking" only in body
      indexNote(db, {
        path: 'research/project-management.md',
        filename: 'project-management.md',
        title: 'Project Management Hub',
        frontmatter: {
          type: 'research' as const,
          created: '2025-01-02T00:00:00Z',
          modified: '2025-01-02T00:00:00Z',
          verified: false,
          tags: [],
          related: [],
          aliases: [],
        },
        content: '# Project Management Hub\n\nThis hub covers project management. Time tracking is one aspect of project management.',
        raw: '---\ntype: research\n---\n\n# Project Management Hub\n\nThis hub covers project management. Time tracking is one aspect.',
      });

      const results = searchNotesInVault(db, { query: 'time tracking' });
      expect(results.length).toBe(2);
      // Title match should rank first
      expect(results[0]?.note.title).toBe('Time Tracking');
    });

    it('filters by type', async () => {
      const { queryNotesInVault } = await import('../../../src/services/index/query');

      const commands = queryNotesInVault(db, { type: 'command' });
      expect(commands.length).toBe(1);
      expect(commands[0]?.frontmatter.type).toBe('command');
    });

    it('filters by tags', async () => {
      const { queryNotesInVault } = await import('../../../src/services/index/query');

      const devops = queryNotesInVault(db, { tags: ['devops'] });
      expect(devops.length).toBe(2);

      const k8s = queryNotesInVault(db, { tags: ['kubernetes'] });
      expect(k8s.length).toBe(1);
    });

    it('filters by confidence', async () => {
      const { queryNotesInVault } = await import('../../../src/services/index/query');

      const highConfidence = queryNotesInVault(db, { minConfidence: 0.8 });
      expect(highConfidence.length).toBe(1);
      expect(highConfidence[0]?.title).toBe('Kubernetes Basics');
    });

    it('filters by verified status', async () => {
      const { queryNotesInVault } = await import('../../../src/services/index/query');

      const verified = queryNotesInVault(db, { verified: true });
      expect(verified.length).toBe(1);

      const unverified = queryNotesInVault(db, { verified: false });
      expect(unverified.length).toBe(1);
    });

    it('counts notes', async () => {
      const { countNotesInVault } = await import('../../../src/services/index/query');

      expect(countNotesInVault(db, {})).toBe(2);
      expect(countNotesInVault(db, { type: 'research' })).toBe(1);
      expect(countNotesInVault(db, { tags: ['devops'] })).toBe(2);
    });
  });
});
