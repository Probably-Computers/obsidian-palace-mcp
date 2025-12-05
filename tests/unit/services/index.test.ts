/**
 * Index service tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { join } from 'path';
import { mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

// Set up test environment before importing services
const testDir = join(tmpdir(), `palace-test-${randomUUID()}`);
const testVault = join(testDir, 'vault');
const testIndex = join(testDir, 'index.sqlite');

// Configure environment before imports
process.env.PALACE_VAULT_PATH = testVault;
process.env.PALACE_INDEX_PATH = testIndex;
process.env.PALACE_LOG_LEVEL = 'error';
process.env.PALACE_WATCH_ENABLED = 'false';

// Dynamic imports after env setup
import { resetConfig } from '../../../src/config/index';

describe('Index Service', () => {
  beforeAll(async () => {
    // Create test vault directory
    await mkdir(testVault, { recursive: true });
    resetConfig();
  });

  afterAll(async () => {
    // Clean up test directory
    const { closeDatabase } = await import('../../../src/services/index/index');
    closeDatabase();
    await rm(testDir, { recursive: true, force: true });
  });

  describe('SQLite Database', () => {
    it('creates database on first access', async () => {
      const { getDatabase, closeDatabase } = await import('../../../src/services/index/index');

      const db = await getDatabase();
      expect(db).toBeDefined();

      // Verify schema was created
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all() as { name: string }[];

      const tableNames = tables.map((t) => t.name);
      expect(tableNames).toContain('notes');
      expect(tableNames).toContain('note_tags');
      expect(tableNames).toContain('links');
      expect(tableNames).toContain('schema_version');
    });

    it('returns same instance on subsequent calls', async () => {
      const { getDatabase } = await import('../../../src/services/index/index');

      const db1 = await getDatabase();
      const db2 = await getDatabase();
      expect(db1).toBe(db2);
    });
  });

  describe('Index Sync', () => {
    beforeEach(async () => {
      const { clearIndex, getDatabase } = await import('../../../src/services/index/index');
      await getDatabase();
      clearIndex();
    });

    it('indexes a note', async () => {
      const { indexNote, getNoteByPath, getDatabase } = await import(
        '../../../src/services/index/index'
      );

      await getDatabase();

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

      indexNote(testNote);

      const indexed = getNoteByPath('research/test-note.md');
      expect(indexed).not.toBeNull();
      expect(indexed?.title).toBe('Test Note');
      expect(indexed?.frontmatter.type).toBe('research');
    });

    it('extracts and stores tags', async () => {
      const { indexNote, getNoteTags, getDatabase, getDatabaseSync } = await import(
        '../../../src/services/index/index'
      );

      await getDatabase();

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

      indexNote(testNote);

      // Get note ID
      const db = getDatabaseSync();
      const row = db.prepare('SELECT id FROM notes WHERE path = ?').get('research/tagged-note.md') as { id: number };

      const tags = getNoteTags(row.id);
      expect(tags).toContain('kubernetes');
      expect(tags).toContain('docker');
    });

    it('removes note from index', async () => {
      const { indexNote, removeFromIndex, getNoteByPath, getDatabase } = await import(
        '../../../src/services/index/index'
      );

      await getDatabase();

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

      indexNote(testNote);
      expect(getNoteByPath('research/to-remove.md')).not.toBeNull();

      removeFromIndex('research/to-remove.md');
      expect(getNoteByPath('research/to-remove.md')).toBeNull();
    });
  });

  describe('Query Builder', () => {
    beforeEach(async () => {
      const { clearIndex, getDatabase, indexNote } = await import(
        '../../../src/services/index/index'
      );

      await getDatabase();
      clearIndex();

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
        indexNote(note);
      }
    });

    it('searches notes with FTS5', async () => {
      const { searchNotes } = await import('../../../src/services/index/index');

      const results = searchNotes({ query: 'kubernetes' });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]?.note.title).toBe('Kubernetes Basics');
    });

    it('filters by type', async () => {
      const { queryNotes } = await import('../../../src/services/index/index');

      const commands = queryNotes({ type: 'command' });
      expect(commands.length).toBe(1);
      expect(commands[0]?.frontmatter.type).toBe('command');
    });

    it('filters by tags', async () => {
      const { queryNotes } = await import('../../../src/services/index/index');

      const devops = queryNotes({ tags: ['devops'] });
      expect(devops.length).toBe(2);

      const k8s = queryNotes({ tags: ['kubernetes'] });
      expect(k8s.length).toBe(1);
    });

    it('filters by confidence', async () => {
      const { queryNotes } = await import('../../../src/services/index/index');

      const highConfidence = queryNotes({ minConfidence: 0.8 });
      expect(highConfidence.length).toBe(1);
      expect(highConfidence[0]?.title).toBe('Kubernetes Basics');
    });

    it('filters by verified status', async () => {
      const { queryNotes } = await import('../../../src/services/index/index');

      const verified = queryNotes({ verified: true });
      expect(verified.length).toBe(1);

      const unverified = queryNotes({ verified: false });
      expect(unverified.length).toBe(1);
    });

    it('counts notes', async () => {
      const { countNotes } = await import('../../../src/services/index/index');

      expect(countNotes({})).toBe(2);
      expect(countNotes({ type: 'research' })).toBe(1);
      expect(countNotes({ tags: ['devops'] })).toBe(2);
    });
  });
});
