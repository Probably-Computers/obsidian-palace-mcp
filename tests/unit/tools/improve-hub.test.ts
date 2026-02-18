/**
 * Tests for hub reconciliation in palace_improve
 *
 * Verifies that improving a hub note reconciles orphaned children
 * into the Knowledge Map, and that createChildNote addToHub works.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { mkdir, rm, writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import Database from 'better-sqlite3';

// Set up test environment before importing services
const testDir = join(tmpdir(), `palace-improve-hub-test-${randomUUID()}`);
const testVault = join(testDir, 'vault');
const testPalace = join(testVault, '.palace');

// Configure environment before imports
process.env.PALACE_VAULTS = `${testVault}:test:rw`;
process.env.PALACE_LOG_LEVEL = 'error';
process.env.PALACE_WATCH_ENABLED = 'false';

import { resetConfig } from '../../../src/config/index';
import { stringifyFrontmatter } from '../../../src/utils/frontmatter';

/**
 * Build a note file using the project's frontmatter serializer
 * to ensure dates and types are handled correctly.
 */
function makeNote(
  title: string,
  type: string,
  content: string,
  extra: Record<string, unknown> = {}
): string {
  const fm: Record<string, unknown> = {
    title,
    type,
    created: '2025-01-01T00:00:00Z',
    modified: '2025-01-01T00:00:00Z',
    ...extra,
  };
  return stringifyFrontmatter(fm, content);
}

/**
 * Create a note object suitable for indexNote()
 */
function indexNoteObj(
  path: string,
  title: string,
  type: string,
  content: string,
  raw: string
) {
  return {
    path,
    filename: path.split('/').pop() ?? path,
    title,
    frontmatter: { title, type, created: '2025-01-01T00:00:00Z', modified: '2025-01-01T00:00:00Z' },
    content,
    raw,
    links: [] as Array<{ target: string; raw: string }>,
  };
}

describe('Hub Reconciliation in palace_improve', () => {
  let db: Database.Database;

  beforeAll(async () => {
    await mkdir(join(testVault, 'research'), { recursive: true });
    await mkdir(testPalace, { recursive: true });
    resetConfig();

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
    db.exec('DELETE FROM links');
    db.exec('DELETE FROM note_tags');
    db.exec('DELETE FROM notes');
    db.exec('DELETE FROM notes_fts');

    await rm(join(testVault, 'research'), { recursive: true, force: true }).catch(() => {});
    await mkdir(join(testVault, 'research'), { recursive: true });
  });

  describe('reconcileHubChildren via improve handler', () => {
    it('should reconcile orphaned children when improving a hub with append_section', async () => {
      const { improveHandler } = await import('../../../src/tools/improve');
      const { indexNote } = await import('../../../src/services/index/sync');

      // Create hub with one child in Knowledge Map
      const hubContent = `# Kubernetes

Overview of Kubernetes.

## Knowledge Map

- [[Kubernetes - Architecture]] - Control plane components
`;
      const hubRaw = makeNote('Kubernetes', 'research_hub', hubContent, {
        children_count: 1,
        domain: ['infrastructure'],
      });
      await writeFile(join(testVault, 'research/Kubernetes.md'), hubRaw);

      // Create linked child
      const child1Content = '# Architecture\n\nControl plane details.';
      const child1Raw = makeNote('Architecture', 'research', child1Content, {
        domain: ['infrastructure'],
      });
      await writeFile(join(testVault, 'research/Kubernetes - Architecture.md'), child1Raw);

      // Create ORPHANED child (exists on disk, NOT in Knowledge Map)
      const child2Content = '# Networking\n\nService mesh and CNI plugins.';
      const child2Raw = makeNote('Networking', 'research', child2Content, {
        domain: ['infrastructure'],
      });
      await writeFile(join(testVault, 'research/Kubernetes - Networking.md'), child2Raw);

      // Index all notes
      indexNote(db, indexNoteObj(
        'research/Kubernetes.md', 'Kubernetes', 'research_hub', hubContent, hubRaw
      ));
      indexNote(db, indexNoteObj(
        'research/Kubernetes - Architecture.md', 'Architecture', 'research', child1Content, child1Raw
      ));
      indexNote(db, indexNoteObj(
        'research/Kubernetes - Networking.md', 'Networking', 'research', child2Content, child2Raw
      ));

      // Improve the hub with append_section
      const result = await improveHandler({
        path: 'research/Kubernetes.md',
        mode: 'append_section',
        content: '## Notes\n\nSee also container runtimes.',
        vault: 'test',
        autolink: false,
        auto_split: false,
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      // Verify reconciliation occurred
      expect(result.data?.changes.children_reconciled).toBeGreaterThanOrEqual(1);

      // Verify the orphaned child was added to Knowledge Map
      const updatedHub = await readFile(join(testVault, 'research/Kubernetes.md'), 'utf-8');
      expect(updatedHub).toContain('Kubernetes - Networking');
    });

    it('should NOT trigger reconciliation on non-hub notes', async () => {
      const { improveHandler } = await import('../../../src/tools/improve');
      const { indexNote } = await import('../../../src/services/index/sync');

      const content = '# Regular Note\n\nSome content.';
      const raw = makeNote('Regular', 'research', content);
      await writeFile(join(testVault, 'research/Regular.md'), raw);
      indexNote(db, indexNoteObj('research/Regular.md', 'Regular', 'research', content, raw));

      const result = await improveHandler({
        path: 'research/Regular.md',
        mode: 'append',
        content: 'More content.',
        vault: 'test',
        autolink: false,
        auto_split: false,
      });

      expect(result.success).toBe(true);
      // No reconciliation should occur
      expect(result.data?.changes.children_reconciled).toBeUndefined();
    });

    it('should NOT trigger reconciliation for consolidate mode', async () => {
      const { improveHandler } = await import('../../../src/tools/improve');
      const { indexNote } = await import('../../../src/services/index/sync');

      const hubContent = `# TestHub

## Knowledge Map

- [[TestHub - Part1]] - Section 1
`;
      const hubRaw = makeNote('TestHub', 'research_hub', hubContent, { children_count: 1 });
      await writeFile(join(testVault, 'research/TestHub.md'), hubRaw);

      const childContent = '# Part1\n\nChild content.';
      const childRaw = makeNote('Part1', 'research', childContent);
      await writeFile(join(testVault, 'research/TestHub - Part1.md'), childRaw);

      indexNote(db, indexNoteObj('research/TestHub.md', 'TestHub', 'research_hub', hubContent, hubRaw));
      indexNote(db, indexNoteObj('research/TestHub - Part1.md', 'Part1', 'research', childContent, childRaw));

      const result = await improveHandler({
        path: 'research/TestHub.md',
        mode: 'consolidate',
        vault: 'test',
      });

      expect(result.success).toBe(true);
      // Consolidate returns early with its own result - no reconciliation field
      expect(result.data?.changes.children_reconciled).toBeUndefined();
    });

    it('should NOT trigger reconciliation for frontmatter mode', async () => {
      const { improveHandler } = await import('../../../src/tools/improve');
      const { indexNote } = await import('../../../src/services/index/sync');

      const hubContent = `# FmHub

## Knowledge Map

- [[FmHub - Child]] - A child
`;
      const hubRaw = makeNote('FmHub', 'research_hub', hubContent, { children_count: 1 });
      await writeFile(join(testVault, 'research/FmHub.md'), hubRaw);

      const childContent = '# Child\n\nSome content.';
      const childRaw = makeNote('Child', 'research', childContent);
      await writeFile(join(testVault, 'research/FmHub - Child.md'), childRaw);

      indexNote(db, indexNoteObj('research/FmHub.md', 'FmHub', 'research_hub', hubContent, hubRaw));
      indexNote(db, indexNoteObj('research/FmHub - Child.md', 'Child', 'research', childContent, childRaw));

      const result = await improveHandler({
        path: 'research/FmHub.md',
        mode: 'frontmatter',
        frontmatter: { verified: true },
        vault: 'test',
      });

      expect(result.success).toBe(true);
      expect(result.data?.changes.children_reconciled).toBeUndefined();
    });
  });
});

describe('createChildNote with addToHub', () => {
  beforeAll(async () => {
    await mkdir(join(testVault, 'addtohub'), { recursive: true });
    await mkdir(testPalace, { recursive: true });
    resetConfig();
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await rm(join(testVault, 'addtohub'), { recursive: true, force: true }).catch(() => {});
    await mkdir(join(testVault, 'addtohub'), { recursive: true });
  });

  it('should add child to hub Knowledge Map when addToHub is true', async () => {
    const { createChildNote, createHub } = await import('../../../src/services/atomic/hub-manager');

    // Create a hub first
    await createHub(testVault, 'addtohub', 'MyHub', [
      { path: 'addtohub/MyHub - Existing.md', title: 'MyHub - Existing' },
    ]);

    // Create child with addToHub: true
    const result = await createChildNote(
      testVault,
      'addtohub/MyHub - NewChild.md',
      'NewChild',
      '# NewChild\n\nNew child content.',
      'addtohub/MyHub.md',
      { addToHub: true }
    );

    expect(result.success).toBe(true);

    // Read hub and verify Knowledge Map was updated
    const hubContent = await readFile(join(testVault, 'addtohub/MyHub.md'), 'utf-8');
    expect(hubContent).toContain('[[NewChild]]');
  });

  it('should NOT modify hub when addToHub is false (default)', async () => {
    const { createChildNote, createHub } = await import('../../../src/services/atomic/hub-manager');

    // Create a hub
    await createHub(testVault, 'addtohub', 'NoAdd', [
      { path: 'addtohub/NoAdd - Existing.md', title: 'NoAdd - Existing' },
    ]);

    // Read hub content before creating child
    const hubBefore = await readFile(join(testVault, 'addtohub/NoAdd.md'), 'utf-8');

    // Create child without addToHub
    const result = await createChildNote(
      testVault,
      'addtohub/NoAdd - Orphan.md',
      'Orphan',
      '# Orphan\n\nOrphan content.',
      'addtohub/NoAdd.md'
    );

    expect(result.success).toBe(true);

    // Hub should not have changed
    const hubAfter = await readFile(join(testVault, 'addtohub/NoAdd.md'), 'utf-8');
    expect(hubAfter).toBe(hubBefore);
    expect(hubAfter).not.toContain('Orphan');
  });
});
