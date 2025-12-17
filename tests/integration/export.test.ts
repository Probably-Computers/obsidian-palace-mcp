/**
 * Integration tests for palace_export (Phase 026)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { join } from 'path';
import { mkdir, rm, writeFile, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import Database from 'better-sqlite3';

// Set up test environment before importing services
const testDir = join(tmpdir(), `palace-export-test-${randomUUID()}`);
const testVault = join(testDir, 'vault');
const testPalace = join(testVault, '.palace');

// Configure environment before imports
process.env.PALACE_VAULTS = `${testVault}:test:rw`;
process.env.PALACE_LOG_LEVEL = 'error';
process.env.PALACE_WATCH_ENABLED = 'false';

import { resetConfig } from '../../src/config/index';

describe('palace_export Integration Tests (Phase 026)', () => {
  let db: Database.Database;

  beforeAll(async () => {
    // Create test vault directory structure
    await mkdir(join(testVault, 'research'), { recursive: true });
    await mkdir(join(testVault, 'hub-test'), { recursive: true });
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
    await rm(join(testVault, 'hub-test'), { recursive: true, force: true }).catch(() => {});
    await mkdir(join(testVault, 'research'), { recursive: true });
    await mkdir(join(testVault, 'hub-test'), { recursive: true });
  });

  describe('Single Note Export', () => {
    it('should export a note as markdown (default)', async () => {
      const { exportHandler } = await import('../../src/tools/export');

      // Create a test note
      const notePath = 'research/test-note.md';
      const content = `---
type: research
title: Test Note
created: 2025-01-01T00:00:00Z
---

# Test Note

This is a [[Test Link]] to another note.
`;
      await writeFile(join(testVault, notePath), content);

      const result = await exportHandler({
        path: notePath,
        vault: 'test',
        format: 'markdown',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.format).toBe('markdown');
      expect(result.data.content).toContain('[[Test Link]]');
      expect(result.data.sources).toContain(notePath);
    });

    it('should export with wiki-links converted to plain text', async () => {
      const { exportHandler } = await import('../../src/tools/export');

      const notePath = 'research/clean-export.md';
      const content = `---
type: research
title: Clean Export Test
---

# Clean Export Test

See [[Other Note]] and [[Target|alias]] for details.
`;
      await writeFile(join(testVault, notePath), content);

      const result = await exportHandler({
        path: notePath,
        vault: 'test',
        format: 'clean_markdown',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.content).toContain('See Other Note and alias for details.');
      expect(result.data.content).not.toContain('[[');
    });

    it('should export with wiki-links converted to relative links', async () => {
      const { exportHandler } = await import('../../src/tools/export');

      const notePath = 'research/resolved-export.md';
      const content = `---
type: research
title: Resolved Export Test
---

# Resolved Export Test

Link to [[My Note]] here.
`;
      await writeFile(join(testVault, notePath), content);

      const result = await exportHandler({
        path: notePath,
        vault: 'test',
        format: 'resolved_markdown',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.content).toContain('[My Note](./My Note.md)');
      expect(result.data.content).not.toContain('[[My Note]]');
    });

    it('should export as HTML', async () => {
      const { exportHandler } = await import('../../src/tools/export');

      const notePath = 'research/html-export.md';
      const content = `---
type: research
title: HTML Export Test
---

# HTML Export Test

**Bold text** and *italic*.
`;
      await writeFile(join(testVault, notePath), content);

      const result = await exportHandler({
        path: notePath,
        vault: 'test',
        format: 'html',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.content).toContain('<!DOCTYPE html>');
      expect(result.data.content).toContain('<h1>HTML Export Test</h1>');
      expect(result.data.content).toContain('<strong>Bold text</strong>');
    });

    it('should include frontmatter when requested', async () => {
      const { exportHandler } = await import('../../src/tools/export');

      const notePath = 'research/fm-test.md';
      const content = `---
type: research
title: Frontmatter Test
tags:
  - test
---

# Frontmatter Test

Content here.
`;
      await writeFile(join(testVault, notePath), content);

      const result = await exportHandler({
        path: notePath,
        vault: 'test',
        format: 'markdown',
        include_frontmatter: true,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.content).toContain('---');
      expect(result.data.content).toContain('type: research');
    });

    it('should convert frontmatter to readable header', async () => {
      const { exportHandler } = await import('../../src/tools/export');

      const notePath = 'research/header-test.md';
      const content = `---
type: research
title: Header Test
created: 2025-01-01
tags:
  - one
  - two
---

# Header Test

Content here.
`;
      await writeFile(join(testVault, notePath), content);

      const result = await exportHandler({
        path: notePath,
        vault: 'test',
        format: 'markdown',
        include_frontmatter: true,
        frontmatter_as_header: true,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.content).toContain('**Title:** Header Test');
      expect(result.data.content).toContain('**Created:**'); // Date format may vary
      expect(result.data.content).toContain('2025');
      expect(result.data.content).toContain('**Tags:** one, two');
    });
  });

  describe('Hub Consolidation Export', () => {
    it('should consolidate hub with children', async () => {
      const { exportHandler } = await import('../../src/tools/export');

      // Create a hub note
      const hubContent = `---
type: research_hub
title: Test Hub
children_count: 2
---

# Test Hub

Overview of the hub.

## Knowledge Map

- [[Child One]]
- [[Child Two]]
`;
      await writeFile(join(testVault, 'hub-test/Test Hub.md'), hubContent);

      // Create child notes
      const child1Content = `---
type: research
title: Child One
---

# Child One

Content of child one.
`;
      await writeFile(join(testVault, 'hub-test/Child One.md'), child1Content);

      const child2Content = `---
type: research
title: Child Two
---

# Child Two

Content of child two.
`;
      await writeFile(join(testVault, 'hub-test/Child Two.md'), child2Content);

      const result = await exportHandler({
        path: 'hub-test/Test Hub.md',
        vault: 'test',
        format: 'markdown',
        include_children: true,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      // Should contain hub intro
      expect(result.data.content).toContain('Overview of the hub');

      // Should contain child content merged as sections
      expect(result.data.content).toContain('## Child One');
      expect(result.data.content).toContain('Content of child one');
      expect(result.data.content).toContain('## Child Two');
      expect(result.data.content).toContain('Content of child two');

      // Should list all sources
      expect(result.data.sources).toHaveLength(3);
      expect(result.data.sources).toContain('hub-test/Test Hub.md');
    });

    it('should not consolidate when include_children is false', async () => {
      const { exportHandler } = await import('../../src/tools/export');

      // Create a simple hub note
      const hubContent = `---
type: research_hub
title: Standalone Hub
children_count: 1
---

# Standalone Hub

Hub overview.

## Knowledge Map

- [[Some Child]]
`;
      await writeFile(join(testVault, 'hub-test/Standalone Hub.md'), hubContent);

      const result = await exportHandler({
        path: 'hub-test/Standalone Hub.md',
        vault: 'test',
        format: 'markdown',
        include_children: false,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      // Should only have one source (the hub itself)
      expect(result.data.sources).toHaveLength(1);
      expect(result.data.sources[0]).toBe('hub-test/Standalone Hub.md');
    });
  });

  describe('Output to File', () => {
    it('should write export to file inside vault', async () => {
      const { exportHandler } = await import('../../src/tools/export');

      const notePath = 'research/source.md';
      const content = `---
type: research
title: Source Note
---

# Source Note

Content to export.
`;
      await writeFile(join(testVault, notePath), content);

      const outputPath = 'exports/exported.md';

      const result = await exportHandler({
        path: notePath,
        vault: 'test',
        format: 'clean_markdown',
        output_path: outputPath,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.outputPath).toBeDefined();

      // Verify file was created
      const exportedPath = join(testVault, outputPath);
      expect(existsSync(exportedPath)).toBe(true);

      const exportedContent = await readFile(exportedPath, 'utf-8');
      expect(exportedContent).toContain('Source Note');
    });

    it('should reject writing outside vault without permission', async () => {
      const { exportHandler } = await import('../../src/tools/export');

      const notePath = 'research/test.md';
      const content = `---
type: research
title: Test
---

# Test

Content.
`;
      await writeFile(join(testVault, notePath), content);

      const outsidePath = '/tmp/outside-vault.md';

      const result = await exportHandler({
        path: notePath,
        vault: 'test',
        format: 'markdown',
        output_path: outsidePath,
        allow_outside_vault: false,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('outside vault');
    });
  });

  describe('Link Style Override', () => {
    it('should respect link_style override', async () => {
      const { exportHandler } = await import('../../src/tools/export');

      const notePath = 'research/link-override.md';
      const content = `---
type: research
title: Link Override Test
---

# Link Override Test

See [[Note]] here.
`;
      await writeFile(join(testVault, notePath), content);

      // Use markdown format but override link style to remove
      const result = await exportHandler({
        path: notePath,
        vault: 'test',
        format: 'markdown',
        link_style: 'remove',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.content).toContain('See  here');
      expect(result.data.content).not.toContain('[[');
    });
  });

  describe('Error Handling', () => {
    it('should return error for non-existent path', async () => {
      const { exportHandler } = await import('../../src/tools/export');

      const result = await exportHandler({
        path: 'nonexistent/path.md',
        vault: 'test',
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('NOT_FOUND');
    });

    it('should validate required parameters', async () => {
      const { exportHandler } = await import('../../src/tools/export');

      const result = await exportHandler({
        vault: 'test',
        // missing path
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('VALIDATION_ERROR');
    });
  });
});
