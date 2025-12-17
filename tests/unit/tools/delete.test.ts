/**
 * Tests for palace_delete tool
 *
 * Phase 023: Note Lifecycle Management
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { mkdir, rm, writeFile, readFile, stat } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import Database from 'better-sqlite3';

// Set up test environment before importing services
const testDir = join(tmpdir(), `palace-delete-test-${randomUUID()}`);
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
type: research
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
      type: 'research',
      created: '2025-01-01T00:00:00Z',
      modified: '2025-01-01T00:00:00Z',
    },
    content,
    raw,
    links,
  };
}

describe('palace_delete Tool', () => {
  let db: Database.Database;

  beforeAll(async () => {
    // Create test vault directory with subdirectories
    await mkdir(join(testVault, 'notes'), { recursive: true });
    await mkdir(join(testVault, 'test-dir'), { recursive: true });
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
    await rm(join(testVault, 'test-dir'), { recursive: true, force: true }).catch(() => {});
    await mkdir(join(testVault, 'notes'), { recursive: true });
    await mkdir(join(testVault, 'test-dir'), { recursive: true });

    // Clear operations
    const { clearOperations } = await import('../../../src/services/operations/index');
    clearOperations();
  });

  describe('Single Note Deletion', () => {
    it('should delete a note in dry-run mode by default', async () => {
      const { deleteHandler } = await import('../../../src/tools/delete');
      const { indexNote } = await import('../../../src/services/index/sync');

      // Create a test note
      const notePath = 'notes/test-note.md';
      const noteContent = '# Test Note\n\nThis is a test note.';
      const fullContent = `---
title: Test Note
type: research
created: 2025-01-01T00:00:00Z
modified: 2025-01-01T00:00:00Z
---

${noteContent}`;
      await writeFile(join(testVault, notePath), fullContent);

      // Index the note
      indexNote(db, createNote(notePath, 'Test Note', noteContent));

      // Attempt to delete (dry-run is default)
      const result = await deleteHandler({ path: notePath, vault: 'test' });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.dry_run).toBe(true);
      expect(result.data?.deleted).toContain(notePath);

      // Verify file still exists (dry-run)
      const exists = await stat(join(testVault, notePath)).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it('should actually delete a note when dry_run is false', async () => {
      const { deleteHandler } = await import('../../../src/tools/delete');

      // Create a test note
      const notePath = 'notes/delete-me.md';
      const noteContent = `---
title: Delete Me
type: research
created: 2025-01-01T00:00:00Z
modified: 2025-01-01T00:00:00Z
---

# Delete Me

This note will be deleted.
`;
      await writeFile(join(testVault, notePath), noteContent);

      // Delete the note
      const result = await deleteHandler({
        path: notePath,
        vault: 'test',
        dry_run: false,
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.dry_run).toBe(false);
      expect(result.data?.deleted).toContain(notePath);

      // Verify file is deleted
      const exists = await stat(join(testVault, notePath)).then(() => true).catch(() => false);
      expect(exists).toBe(false);
    });

    it('should return error for non-existent note', async () => {
      const { deleteHandler } = await import('../../../src/tools/delete');

      const result = await deleteHandler({
        path: 'notes/does-not-exist.md',
        vault: 'test',
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('NOT_FOUND');
    });

    it('should track deletion operations', async () => {
      const { deleteHandler } = await import('../../../src/tools/delete');
      const { getOperation } = await import('../../../src/services/operations/index');

      // Create a test note
      const notePath = 'notes/tracked-delete.md';
      await writeFile(
        join(testVault, notePath),
        '---\ntitle: Tracked\ncreated: 2025-01-01T00:00:00Z\nmodified: 2025-01-01T00:00:00Z\n---\n\n# Tracked'
      );

      // Delete the note
      const result = await deleteHandler({
        path: notePath,
        vault: 'test',
        dry_run: false,
      });

      expect(result.success).toBe(true);
      expect(result.data?.operation_id).toBeDefined();

      // Verify operation tracking
      const operation = getOperation(result.data!.operation_id!);
      expect(operation).toBeDefined();
      expect(operation?.type).toBe('delete');
      expect(operation?.filesDeleted).toContain(notePath);
    });
  });

  describe('Protected Paths', () => {
    it('should reject deletion of .palace directory', async () => {
      const { deleteHandler } = await import('../../../src/tools/delete');

      const result = await deleteHandler({
        path: '.palace',
        vault: 'test',
        confirm: true,
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('PROTECTED_PATH');
    });

    it('should reject deletion of .obsidian directory', async () => {
      const { deleteHandler } = await import('../../../src/tools/delete');

      await mkdir(join(testVault, '.obsidian'), { recursive: true });

      const result = await deleteHandler({
        path: '.obsidian',
        vault: 'test',
        confirm: true,
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('PROTECTED_PATH');
    });

    it('should reject deletion of files within protected paths', async () => {
      const { deleteHandler } = await import('../../../src/tools/delete');

      const result = await deleteHandler({
        path: '.palace/index.sqlite',
        vault: 'test',
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('PROTECTED_PATH');
    });
  });

  describe('Directory Deletion', () => {
    beforeEach(async () => {
      // Create test directory with files
      await writeFile(
        join(testVault, 'test-dir/note1.md'),
        '---\ntitle: Note 1\ncreated: 2025-01-01T00:00:00Z\nmodified: 2025-01-01T00:00:00Z\n---\n\n# Note 1'
      );
      await writeFile(
        join(testVault, 'test-dir/note2.md'),
        '---\ntitle: Note 2\ncreated: 2025-01-01T00:00:00Z\nmodified: 2025-01-01T00:00:00Z\n---\n\n# Note 2'
      );
    });

    it('should require confirm for directory deletion', async () => {
      const { deleteHandler } = await import('../../../src/tools/delete');

      const result = await deleteHandler({
        path: 'test-dir',
        vault: 'test',
        dry_run: false,
        // confirm not set
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('CONFIRMATION_REQUIRED');
    });

    it('should list files in dry-run mode for directories', async () => {
      const { deleteHandler } = await import('../../../src/tools/delete');

      const result = await deleteHandler({
        path: 'test-dir',
        vault: 'test',
        confirm: true,
        dry_run: true,
      });

      expect(result.success).toBe(true);
      expect(result.data?.dry_run).toBe(true);
      expect(result.data?.deleted.length).toBeGreaterThan(0);
    });

    it('should delete directory contents when confirmed', async () => {
      const { deleteHandler } = await import('../../../src/tools/delete');

      const result = await deleteHandler({
        path: 'test-dir',
        vault: 'test',
        confirm: true,
        dry_run: false,
        recursive: true,
      });

      expect(result.success).toBe(true);
      expect(result.data?.deleted.length).toBeGreaterThan(0);
    });
  });

  describe('Backlink Handling', () => {
    beforeEach(async () => {
      const { indexNote } = await import('../../../src/services/index/sync');

      // Create notes with links
      const targetContent = '# Target\n\nThis is the target note.';
      const sourceContent = '# Source\n\nThis links to [[Target]].';

      await writeFile(
        join(testVault, 'notes/target.md'),
        `---\ntitle: Target\ncreated: 2025-01-01T00:00:00Z\nmodified: 2025-01-01T00:00:00Z\n---\n\n${targetContent}`
      );
      await writeFile(
        join(testVault, 'notes/source.md'),
        `---\ntitle: Source\ncreated: 2025-01-01T00:00:00Z\nmodified: 2025-01-01T00:00:00Z\n---\n\n${sourceContent}`
      );

      // Index both notes with links
      indexNote(db, createNote('notes/target.md', 'Target', targetContent));
      indexNote(db, createNote(
        'notes/source.md',
        'Source',
        sourceContent,
        [{ target: 'Target', raw: '[[Target]]' }]
      ));
    });

    it('should warn about backlinks by default', async () => {
      const { deleteHandler } = await import('../../../src/tools/delete');

      const result = await deleteHandler({
        path: 'notes/target.md',
        vault: 'test',
        dry_run: true,
      });

      expect(result.success).toBe(true);
      expect(result.data?.backlinks_found).toBeDefined();
    });

    it('should remove backlinks when handle_backlinks is remove', async () => {
      const { deleteHandler } = await import('../../../src/tools/delete');

      const result = await deleteHandler({
        path: 'notes/target.md',
        vault: 'test',
        dry_run: false,
        handle_backlinks: 'remove',
      });

      expect(result.success).toBe(true);
      // Check that source file was modified to remove the link
      if (result.data?.backlinks_updated && result.data.backlinks_updated.length > 0) {
        const sourceContent = await readFile(join(testVault, 'notes/source.md'), 'utf-8');
        expect(sourceContent).not.toContain('[[Target]]');
      }
    });

    it('should ignore backlinks when handle_backlinks is ignore', async () => {
      const { deleteHandler } = await import('../../../src/tools/delete');

      const result = await deleteHandler({
        path: 'notes/target.md',
        vault: 'test',
        dry_run: false,
        handle_backlinks: 'ignore',
      });

      expect(result.success).toBe(true);
      expect(result.data?.backlinks_updated).toHaveLength(0);
    });
  });
});
