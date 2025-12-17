/**
 * Integration tests for palace_batch (Phase 027)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { join } from 'path';
import { mkdir, rm, writeFile, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import Database from 'better-sqlite3';

// Set up test environment before importing services
const testDir = join(tmpdir(), `palace-batch-test-${randomUUID()}`);
const testVault = join(testDir, 'vault');
const testPalace = join(testVault, '.palace');

// Configure environment before imports
process.env.PALACE_VAULTS = `${testVault}:test:rw`;
process.env.PALACE_LOG_LEVEL = 'error';
process.env.PALACE_WATCH_ENABLED = 'false';

import { resetConfig } from '../../src/config/index';

describe('palace_batch Integration Tests (Phase 027)', () => {
  let db: Database.Database;

  beforeAll(async () => {
    // Create test vault directory structure
    await mkdir(join(testVault, 'research'), { recursive: true });
    await mkdir(join(testVault, 'projects'), { recursive: true });
    await mkdir(join(testVault, 'archive'), { recursive: true });
    await mkdir(testPalace, { recursive: true });
    resetConfig();

    // Create database
    const { createDatabase, initializeSchema } = await import('../../src/services/index/sqlite');
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
    // Clear database
    db.exec('DELETE FROM links');
    db.exec('DELETE FROM note_tags');
    db.exec('DELETE FROM notes');
    db.exec('DELETE FROM notes_fts');

    // Reset directories
    await rm(join(testVault, 'research'), { recursive: true, force: true }).catch(() => {});
    await rm(join(testVault, 'projects'), { recursive: true, force: true }).catch(() => {});
    await rm(join(testVault, 'archive'), { recursive: true, force: true }).catch(() => {});
    await mkdir(join(testVault, 'research'), { recursive: true });
    await mkdir(join(testVault, 'projects'), { recursive: true });
    await mkdir(join(testVault, 'archive'), { recursive: true });
  });

  /**
   * Helper to create test notes (without indexing for simpler glob tests)
   */
  async function createNote(path: string, content: string) {
    const fullPath = join(testVault, path);
    const dir = fullPath.split('/').slice(0, -1).join('/');
    await mkdir(dir, { recursive: true }).catch(() => {});
    await writeFile(fullPath, content);
  }

  describe('Selection by Glob Pattern', () => {
    it('should select notes matching glob pattern', async () => {
      await createNote('research/note1.md', `---
type: research
---

# Note 1

Content 1`);
      await createNote('research/note2.md', `---
type: research
---

# Note 2

Content 2`);
      await createNote('projects/project1.md', `---
type: project
---

# Project 1

Project content`);

      const { batchHandler } = await import('../../src/tools/batch');
      const result = await batchHandler({
        select: { glob: 'research/*.md' },
        operation: { type: 'add_tags', tags: ['test'] },
        vault: 'test',
        dry_run: true,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.selected_count).toBe(2);
    });

    it('should handle ** wildcard for recursive matching', async () => {
      await createNote('research/topic/note1.md', `---
type: research
---

# Note 1

Content 1`);
      await createNote('research/topic/subtopic/note2.md', `---
type: research
---

# Note 2

Content 2`);

      const { batchHandler } = await import('../../src/tools/batch');
      const result = await batchHandler({
        select: { glob: 'research/**/*.md' },
        operation: { type: 'add_tags', tags: ['test'] },
        vault: 'test',
        dry_run: true,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.selected_count).toBe(2);
    });
  });

  describe('Exclusion Patterns', () => {
    it('should exclude notes matching exclusion patterns', async () => {
      await createNote('research/note1.md', `---
type: research
---

# Note 1

Content`);
      await createNote('research/templates/template1.md', `---
type: research
---

# Template

Template content`);

      const { batchHandler } = await import('../../src/tools/batch');
      const result = await batchHandler({
        select: { glob: 'research/**/*.md', exclude: ['**/templates/**'] },
        operation: { type: 'add_tags', tags: ['test'] },
        vault: 'test',
        dry_run: true,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.selected_count).toBe(1);
    });
  });

  describe('add_tags Operation', () => {
    it('should add tags to selected notes', async () => {
      await createNote('research/note1.md', `---
type: research
tags:
  - existing
---

# Note 1

Content`);

      const { batchHandler } = await import('../../src/tools/batch');
      const result = await batchHandler({
        select: { glob: 'research/note1.md' },
        operation: { type: 'add_tags', tags: ['new-tag', 'another-tag'] },
        vault: 'test',
        dry_run: false,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.processed_count).toBe(1);

      // Verify the file was updated
      const content = await readFile(join(testVault, 'research/note1.md'), 'utf-8');
      expect(content).toContain('new-tag');
      expect(content).toContain('another-tag');
      expect(content).toContain('existing');
    });
  });

  describe('remove_tags Operation', () => {
    it('should remove tags from selected notes', async () => {
      await createNote('research/note1.md', `---
type: research
tags:
  - keep
  - remove
---

# Note 1

Content`);

      const { batchHandler } = await import('../../src/tools/batch');
      const result = await batchHandler({
        select: { glob: 'research/note1.md' },
        operation: { type: 'remove_tags', tags: ['remove'] },
        vault: 'test',
        dry_run: false,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      const content = await readFile(join(testVault, 'research/note1.md'), 'utf-8');
      expect(content).toContain('keep');
      expect(content).not.toMatch(/^\s+-\s*remove\s*$/m);
    });
  });

  describe('update_frontmatter Operation', () => {
    it('should update frontmatter fields', async () => {
      await createNote('research/note1.md', `---
type: research
---

# Note 1

Content`);

      const { batchHandler } = await import('../../src/tools/batch');
      const result = await batchHandler({
        select: { glob: 'research/note1.md' },
        operation: {
          type: 'update_frontmatter',
          updates: { verified: true, confidence: 0.9 },
          merge: true,
        },
        vault: 'test',
        dry_run: false,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      const content = await readFile(join(testVault, 'research/note1.md'), 'utf-8');
      expect(content).toContain('verified: true');
      expect(content).toContain('confidence: 0.9');
    });
  });

  describe('move Operation', () => {
    it('should move notes to destination', async () => {
      await createNote('research/old-note.md', `---
type: research
---

# Old Note

Content to move`);

      const { batchHandler } = await import('../../src/tools/batch');
      const result = await batchHandler({
        select: { glob: 'research/old-note.md' },
        operation: { type: 'move', destination: 'archive', update_backlinks: false },
        vault: 'test',
        dry_run: false,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.processed_count).toBe(1);
      expect(existsSync(join(testVault, 'research/old-note.md'))).toBe(false);
      expect(existsSync(join(testVault, 'archive/old-note.md'))).toBe(true);
    });

    it('should reject moving to protected paths', async () => {
      await createNote('research/note.md', `---
type: research
---

# Note

Content`);

      const { batchHandler } = await import('../../src/tools/batch');
      const result = await batchHandler({
        select: { glob: 'research/note.md' },
        operation: { type: 'move', destination: '.palace', update_backlinks: false },
        vault: 'test',
        dry_run: false,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      // The operation returns success but with errors for protected paths
      expect(result.data.errors.length).toBeGreaterThan(0);
    });
  });

  describe('rename Operation', () => {
    it('should rename notes using pattern', async () => {
      await createNote('research/Overview.md', `---
type: research
---

# Overview

Overview content`);

      const { batchHandler } = await import('../../src/tools/batch');
      const result = await batchHandler({
        select: { glob: 'research/Overview.md' },
        operation: {
          type: 'rename',
          match: '^(.+)/Overview\\.md$',
          pattern: '$1/Research Overview.md',
          update_backlinks: false,
        },
        vault: 'test',
        dry_run: false,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.processed_count).toBe(1);
      expect(existsSync(join(testVault, 'research/Overview.md'))).toBe(false);
      expect(existsSync(join(testVault, 'research/Research Overview.md'))).toBe(true);
    });

    it('should skip notes not matching pattern', async () => {
      await createNote('research/other-note.md', `---
type: research
---

# Other Note

Content`);

      const { batchHandler } = await import('../../src/tools/batch');
      const result = await batchHandler({
        select: { glob: 'research/other-note.md' },
        operation: {
          type: 'rename',
          match: '^(.+)/Overview\\.md$',
          pattern: '$1/Research Overview.md',
          update_backlinks: false,
        },
        vault: 'test',
        dry_run: false,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      // Should be skipped, not processed
      expect(result.data.processed_count).toBe(0);
      expect(result.data.affected_files.some((f) => f.action === 'skipped')).toBe(true);
    });
  });

  describe('delete Operation', () => {
    it('should require confirmation for delete', async () => {
      await createNote('research/to-delete.md', `---
type: research
---

# To Delete

Content`);

      const { batchHandler } = await import('../../src/tools/batch');
      const result = await batchHandler({
        select: { glob: 'research/to-delete.md' },
        operation: { type: 'delete', handle_backlinks: 'ignore' },
        vault: 'test',
        dry_run: false,
        confirm: false,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('confirm: true');
    });

    it('should delete notes with confirmation', async () => {
      await createNote('research/to-delete.md', `---
type: research
---

# To Delete

Content`);

      const { batchHandler } = await import('../../src/tools/batch');
      const result = await batchHandler({
        select: { glob: 'research/to-delete.md' },
        operation: { type: 'delete', handle_backlinks: 'ignore' },
        vault: 'test',
        dry_run: false,
        confirm: true,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.processed_count).toBe(1);
      expect(existsSync(join(testVault, 'research/to-delete.md'))).toBe(false);
    });
  });

  describe('Dry Run Mode', () => {
    it('should not make changes in dry_run mode', async () => {
      await createNote('research/note.md', `---
type: research
---

# Note

Original content`);
      const originalContent = await readFile(join(testVault, 'research/note.md'), 'utf-8');

      const { batchHandler } = await import('../../src/tools/batch');
      const result = await batchHandler({
        select: { glob: 'research/note.md' },
        operation: { type: 'add_tags', tags: ['new-tag'] },
        vault: 'test',
        dry_run: true,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.dry_run).toBe(true);

      // Content should be unchanged
      const currentContent = await readFile(join(testVault, 'research/note.md'), 'utf-8');
      expect(currentContent).toBe(originalContent);
    });

    it('should include dry_run warning in response', async () => {
      await createNote('research/note.md', `---
type: research
---

# Note

Content`);

      const { batchHandler } = await import('../../src/tools/batch');
      const result = await batchHandler({
        select: { glob: 'research/note.md' },
        operation: { type: 'add_tags', tags: ['new-tag'] },
        vault: 'test',
        dry_run: true,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.warnings.some((w) => w.includes('DRY RUN'))).toBe(true);
    });
  });

  describe('Limit Option', () => {
    it('should limit number of notes processed', async () => {
      await createNote('research/note1.md', `---
type: research
---

# Note 1

Content 1`);
      await createNote('research/note2.md', `---
type: research
---

# Note 2

Content 2`);
      await createNote('research/note3.md', `---
type: research
---

# Note 3

Content 3`);

      const { batchHandler } = await import('../../src/tools/batch');
      const result = await batchHandler({
        select: { glob: 'research/*.md' },
        operation: { type: 'add_tags', tags: ['test'] },
        vault: 'test',
        limit: 2,
        dry_run: true,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.selected_count).toBe(3); // All selected
      expect(result.data.processed_count).toBeLessThanOrEqual(2); // But only 2 processed
    });
  });

  describe('Error Handling', () => {
    it('should return error for invalid selection criteria', async () => {
      const { batchHandler } = await import('../../src/tools/batch');
      const result = await batchHandler({
        select: {}, // No criteria
        operation: { type: 'add_tags', tags: ['test'] },
        vault: 'test',
        dry_run: true,
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('VALIDATION_ERROR');
    });

    it('should handle non-existent notes gracefully', async () => {
      const { batchHandler } = await import('../../src/tools/batch');
      const result = await batchHandler({
        select: { glob: 'nonexistent/*.md' },
        operation: { type: 'add_tags', tags: ['test'] },
        vault: 'test',
        dry_run: true,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.selected_count).toBe(0);
      expect(result.data.warnings.some((w) => w.includes('No notes matched'))).toBe(true);
    });
  });
});
