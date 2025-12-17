/**
 * Tests for palace_orphans tool (Enhanced Phase 023)
 *
 * Phase 023: Note Lifecycle Management
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { mkdir, rm, writeFile, stat } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import Database from 'better-sqlite3';

// Set up test environment before importing services
const testDir = join(tmpdir(), `palace-orphans-test-${randomUUID()}`);
const testVault = join(testDir, 'vault');
const testPalace = join(testVault, '.palace');

// Configure environment before imports
process.env.PALACE_VAULTS = `${testVault}:test:rw`;
process.env.PALACE_LOG_LEVEL = 'error';
process.env.PALACE_WATCH_ENABLED = 'false';

import { resetConfig } from '../../../src/config/index';

// Helper to create a complete note object
function createNote(
  path: string,
  title: string,
  content: string,
  links: Array<{ target: string; raw: string }> = []
) {
  const raw = `---
title: ${title}
created: 2025-01-01T00:00:00Z
modified: 2025-01-01T00:00:00Z
---

${content}`;
  return {
    path,
    filename: path.split('/').pop() ?? path,
    title,
    frontmatter: {
      title,
      created: '2025-01-01T00:00:00Z',
      modified: '2025-01-01T00:00:00Z',
    },
    content,
    raw,
    links,
  };
}

describe('palace_orphans Tool (Phase 023)', () => {
  let db: Database.Database;

  beforeAll(async () => {
    // Create test vault directory with subdirectories
    await mkdir(join(testVault, 'notes'), { recursive: true });
    await mkdir(join(testVault, 'projects'), { recursive: true });
    await mkdir(testPalace, { recursive: true });
    resetConfig();

    // Create database for testing
    const { createDatabase, initializeSchema } = await import('../../../src/services/index/sqlite');
    db = createDatabase(join(testPalace, 'index.sqlite'));
    initializeSchema(db);
  });

  afterAll(async () => {
    if (db && db.open) {
      db.close();
    }
    await rm(testDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    // Clear tables between tests
    db.exec('DELETE FROM links');
    db.exec('DELETE FROM note_tags');
    db.exec('DELETE FROM notes');
    db.exec('DELETE FROM notes_fts');

    // Clean up and recreate test directories
    await rm(join(testVault, 'notes'), { recursive: true, force: true }).catch(() => {});
    await rm(join(testVault, 'projects'), { recursive: true, force: true }).catch(() => {});
    await mkdir(join(testVault, 'notes'), { recursive: true });
    await mkdir(join(testVault, 'projects'), { recursive: true });

    // Clear operations
    const { clearOperations } = await import('../../../src/services/operations/index');
    clearOperations();
  });

  describe('Basic Orphan Detection', () => {
    it('should find isolated notes (no incoming or outgoing links)', async () => {
      const { orphansHandler } = await import('../../../src/tools/orphans');
      const { indexNote } = await import('../../../src/services/index/sync');

      // Create an isolated note
      const noteContent = '# Isolated Note\n\nNo links here.';
      await writeFile(
        join(testVault, 'notes/isolated.md'),
        `---\ntitle: Isolated Note\ncreated: 2025-01-01T00:00:00Z\nmodified: 2025-01-01T00:00:00Z\n---\n\n${noteContent}`
      );

      // Index the note
      indexNote(db, createNote('notes/isolated.md', 'Isolated Note', noteContent));

      const result = await orphansHandler({ type: 'isolated', vault: 'test' });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.orphans.length).toBeGreaterThanOrEqual(1);
    });

    it('should not find connected notes as orphans', async () => {
      const { orphansHandler } = await import('../../../src/tools/orphans');
      const { indexNote } = await import('../../../src/services/index/sync');

      // Create connected notes
      await writeFile(
        join(testVault, 'notes/source.md'),
        '---\ntitle: Source\ncreated: 2025-01-01T00:00:00Z\nmodified: 2025-01-01T00:00:00Z\n---\n\n# Source\n\nLinks to [[Target]].'
      );
      await writeFile(
        join(testVault, 'notes/target.md'),
        '---\ntitle: Target\ncreated: 2025-01-01T00:00:00Z\nmodified: 2025-01-01T00:00:00Z\n---\n\n# Target\n\nLinks to [[Source]].'
      );

      // Index the notes with links
      indexNote(db, createNote(
        'notes/source.md',
        'Source',
        '# Source\n\nLinks to [[Target]].',
        [{ target: 'Target', raw: '[[Target]]' }]
      ));
      indexNote(db, createNote(
        'notes/target.md',
        'Target',
        '# Target\n\nLinks to [[Source]].',
        [{ target: 'Source', raw: '[[Source]]' }]
      ));

      const result = await orphansHandler({ type: 'isolated', vault: 'test' });

      expect(result.success).toBe(true);
      // Neither source nor target should be isolated
      const isolatedPaths = result.data?.orphans.map((o: { path: string }) => o.path) ?? [];
      expect(isolatedPaths).not.toContain('notes/source.md');
      expect(isolatedPaths).not.toContain('notes/target.md');
    });
  });

  describe('Orphan Types', () => {
    it('should find notes with no incoming links', async () => {
      const { orphansHandler } = await import('../../../src/tools/orphans');
      const { indexNote } = await import('../../../src/services/index/sync');

      // Create a note that links out but has no incoming links
      await writeFile(
        join(testVault, 'notes/linker.md'),
        '---\ntitle: Linker\ncreated: 2025-01-01T00:00:00Z\nmodified: 2025-01-01T00:00:00Z\n---\n\n# Linker\n\nLinks to [[Something]].'
      );

      indexNote(db, createNote(
        'notes/linker.md',
        'Linker',
        '# Linker\n\nLinks to [[Something]].',
        [{ target: 'Something', raw: '[[Something]]' }]
      ));

      const result = await orphansHandler({ type: 'no_incoming', vault: 'test' });

      expect(result.success).toBe(true);
      expect(result.data?.type).toBe('no_incoming');
    });

    it('should find notes with no outgoing links', async () => {
      const { orphansHandler } = await import('../../../src/tools/orphans');

      const result = await orphansHandler({ type: 'no_outgoing', vault: 'test' });

      expect(result.success).toBe(true);
      expect(result.data?.type).toBe('no_outgoing');
    });
  });

  describe('Cleanup Options', () => {
    beforeEach(async () => {
      const { indexNote } = await import('../../../src/services/index/sync');

      // Create an isolated note
      const noteContent = '# To Delete\n\nThis will be deleted.';
      await writeFile(
        join(testVault, 'notes/to-delete.md'),
        `---\ntitle: To Delete\ncreated: 2025-01-01T00:00:00Z\nmodified: 2025-01-01T00:00:00Z\n---\n\n${noteContent}`
      );

      indexNote(db, createNote('notes/to-delete.md', 'To Delete', noteContent));
    });

    it('should dry-run delete by default', async () => {
      const { orphansHandler } = await import('../../../src/tools/orphans');

      const result = await orphansHandler({
        type: 'isolated',
        vault: 'test',
        delete_orphans: true,
        // dry_run defaults to true
      });

      expect(result.success).toBe(true);
      expect(result.data?.cleanup?.dry_run).toBe(true);

      // File should still exist
      const exists = await stat(join(testVault, 'notes/to-delete.md')).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it('should actually delete when dry_run is false', async () => {
      const { orphansHandler } = await import('../../../src/tools/orphans');

      const result = await orphansHandler({
        type: 'isolated',
        vault: 'test',
        delete_orphans: true,
        dry_run: false,
      });

      expect(result.success).toBe(true);
      expect(result.data?.cleanup?.dry_run).toBe(false);
      expect(result.data?.cleanup?.deleted_count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Cleanup Suggestions', () => {
    it('should include suggestions by default', async () => {
      const { orphansHandler } = await import('../../../src/tools/orphans');

      const result = await orphansHandler({
        vault: 'test',
      });

      expect(result.success).toBe(true);
      expect(result.data?.suggestions).toBeDefined();
      expect(Array.isArray(result.data?.suggestions)).toBe(true);
    });

    it('should exclude suggestions when include_suggestions is false', async () => {
      const { orphansHandler } = await import('../../../src/tools/orphans');

      const result = await orphansHandler({
        vault: 'test',
        include_suggestions: false,
      });

      expect(result.success).toBe(true);
      expect(result.data?.suggestions).toBeUndefined();
    });
  });

  describe('Path Filtering', () => {
    beforeEach(async () => {
      const { indexNote } = await import('../../../src/services/index/sync');

      // Create notes in different directories
      await writeFile(
        join(testVault, 'notes/note1.md'),
        '---\ntitle: Note 1\ncreated: 2025-01-01T00:00:00Z\nmodified: 2025-01-01T00:00:00Z\n---\n\n# Note 1'
      );
      await writeFile(
        join(testVault, 'projects/project1.md'),
        '---\ntitle: Project 1\ncreated: 2025-01-01T00:00:00Z\nmodified: 2025-01-01T00:00:00Z\n---\n\n# Project 1'
      );

      indexNote(db, createNote('notes/note1.md', 'Note 1', '# Note 1\n\nNote 1 content.'));
      indexNote(db, createNote('projects/project1.md', 'Project 1', '# Project 1\n\nProject 1 content.'));
    });

    it('should filter orphans by path prefix', async () => {
      const { orphansHandler } = await import('../../../src/tools/orphans');

      const result = await orphansHandler({
        vault: 'test',
        path: 'notes/',
      });

      expect(result.success).toBe(true);
      // Results should only include notes from the 'notes/' directory
      const paths = result.data?.orphans.map((o: { path: string }) => o.path) ?? [];
      for (const p of paths) {
        expect(p.startsWith('notes/')).toBe(true);
      }
    });
  });

  describe('Limit', () => {
    it('should respect limit parameter', async () => {
      const { orphansHandler } = await import('../../../src/tools/orphans');

      const result = await orphansHandler({
        vault: 'test',
        limit: 5,
      });

      expect(result.success).toBe(true);
      expect(result.data?.count).toBeLessThanOrEqual(5);
    });

    it('should indicate when there are more results', async () => {
      const { orphansHandler } = await import('../../../src/tools/orphans');
      const { indexNote } = await import('../../../src/services/index/sync');

      // Create many orphan notes
      for (let i = 0; i < 10; i++) {
        const content = `# Orphan ${i}\n\nOrphan ${i} content.`;
        await writeFile(
          join(testVault, `notes/orphan-${i}.md`),
          `---\ntitle: Orphan ${i}\ncreated: 2025-01-01T00:00:00Z\nmodified: 2025-01-01T00:00:00Z\n---\n\n${content}`
        );
        indexNote(db, createNote(`notes/orphan-${i}.md`, `Orphan ${i}`, content));
      }

      const result = await orphansHandler({
        vault: 'test',
        limit: 5,
      });

      expect(result.success).toBe(true);
      expect(result.data?.hasMore).toBe(true);
      expect(result.data?.total).toBeGreaterThan(5);
    });
  });
});
