/**
 * Migration service tests (Phase 029)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { join } from 'path';
import { mkdir, rm, writeFile, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import Database from 'better-sqlite3';

// Set up test environment before importing services
const testDir = join(tmpdir(), `palace-migrate-test-${randomUUID()}`);
const testVault = join(testDir, 'vault');
const testPalace = join(testVault, '.palace');

// Configure environment before imports
process.env.PALACE_VAULTS = `${testVault}:test:rw`;
process.env.PALACE_LOG_LEVEL = 'error';
process.env.PALACE_WATCH_ENABLED = 'false';

import { resetConfig } from '../../../src/config/index';

// Helper to create and index a note
function createTestNote(
  path: string,
  title: string,
  content: string,
  type: string = 'research'
) {
  return {
    path,
    filename: path.split('/').pop()!,
    title,
    frontmatter: {
      type: type as 'research',
      created: '2025-01-01T00:00:00Z',
      modified: '2025-01-01T00:00:00Z',
      verified: false,
      tags: [],
      related: [],
      aliases: [],
    },
    content,
    raw: `---\ntype: ${type}\n---\n\n${content}`,
  };
}

describe('Migration Inspector', () => {
  let db: Database.Database;

  beforeAll(async () => {
    await mkdir(testVault, { recursive: true });
    await mkdir(testPalace, { recursive: true });
    await mkdir(join(testVault, 'research'), { recursive: true });
    await mkdir(join(testVault, 'infrastructure', 'kubernetes'), { recursive: true });
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

  describe('Unprefixed child detection', () => {
    it('detects children without parent prefix', async () => {
      const { indexNote } = await import('../../../src/services/index/sync');
      const { inspectVault } = await import('../../../src/services/migrate/inspector');

      // Hub note
      indexNote(
        db,
        createTestNote(
          'infrastructure/kubernetes/Kubernetes.md',
          'Kubernetes',
          '# Kubernetes\n\n## Knowledge Map\n\n- [[Overview]]\n- [[Architecture]]',
          'research_hub'
        )
      );

      // Unprefixed child
      indexNote(
        db,
        createTestNote(
          'infrastructure/kubernetes/Overview.md',
          'Overview',
          '# Overview\n\nKubernetes overview.',
          'research'
        )
      );

      // Correctly prefixed child
      indexNote(
        db,
        createTestNote(
          'infrastructure/kubernetes/Kubernetes - Architecture.md',
          'Kubernetes - Architecture',
          '# Architecture\n\nKubernetes architecture.',
          'research'
        )
      );

      const result = await inspectVault(db, testVault, ['unprefixed_children']);

      expect(result.summary.unprefixed_children).toBe(1);
      const issue = result.issues[0]!;
      expect(issue.path).toBe('infrastructure/kubernetes/Overview.md');
      expect(issue.suggestion).toContain('Kubernetes - Overview.md');
    });

    it('ignores notes not in hub directories', async () => {
      const { indexNote } = await import('../../../src/services/index/sync');
      const { inspectVault } = await import('../../../src/services/migrate/inspector');

      // Standalone note — no hub in directory
      indexNote(
        db,
        createTestNote(
          'research/my-note.md',
          'My Note',
          '# My Note\n\nContent.',
          'research'
        )
      );

      const result = await inspectVault(db, testVault, ['unprefixed_children']);
      expect(result.summary.unprefixed_children).toBe(0);
    });
  });

  describe('Corrupted heading detection', () => {
    it('detects wiki-links in H1 headings', async () => {
      const { indexNote } = await import('../../../src/services/index/sync');
      const { inspectVault } = await import('../../../src/services/migrate/inspector');

      indexNote(
        db,
        createTestNote(
          'research/corrupted.md',
          'Corrupted',
          '# [[Docker]] Overview\n\nContent here.',
          'research'
        )
      );

      const result = await inspectVault(db, testVault, ['corrupted_headings']);

      expect(result.summary.corrupted_headings).toBe(1);
      expect(result.issues[0]!.suggestion).toContain('# Docker Overview');
    });

    it('ignores clean headings', async () => {
      const { indexNote } = await import('../../../src/services/index/sync');
      const { inspectVault } = await import('../../../src/services/migrate/inspector');

      indexNote(
        db,
        createTestNote(
          'research/clean.md',
          'Clean',
          '# Docker Overview\n\nContent.',
          'research'
        )
      );

      const result = await inspectVault(db, testVault, ['corrupted_headings']);
      expect(result.summary.corrupted_headings).toBe(0);
    });
  });

  describe('Naming inconsistency detection', () => {
    it('detects duplicate filenames across directories', async () => {
      const { indexNote } = await import('../../../src/services/index/sync');
      const { inspectVault } = await import('../../../src/services/migrate/inspector');

      indexNote(
        db,
        createTestNote(
          'research/Overview.md',
          'Overview',
          '# Overview\n\nResearch overview.',
          'research'
        )
      );

      indexNote(
        db,
        createTestNote(
          'infrastructure/kubernetes/Overview.md',
          'Overview',
          '# Overview\n\nK8s overview.',
          'research'
        )
      );

      const result = await inspectVault(db, testVault, ['naming_inconsistencies']);

      expect(result.summary.naming_inconsistencies).toBe(2); // Both get flagged
    });
  });

  describe('Broken wiki-link detection', () => {
    it('detects malformed [[X]]trailing]] patterns', async () => {
      const { indexNote } = await import('../../../src/services/index/sync');
      const { inspectVault } = await import('../../../src/services/migrate/inspector');

      indexNote(
        db,
        createTestNote(
          'research/broken.md',
          'Broken',
          '# Broken\n\n[[Kubernetes]]es]] uses a declarative model.',
          'research'
        )
      );

      const result = await inspectVault(db, testVault, ['broken_wiki_links']);

      expect(result.summary.broken_wiki_links).toBe(1);
      const issue = result.issues[0]!;
      expect(issue.path).toBe('research/broken.md');
      expect(issue.description).toContain('Malformed wiki-link');
      expect(issue.suggestion).toContain('[[Kubernetes]]');
    });

    it('ignores valid wiki-links', async () => {
      const { indexNote } = await import('../../../src/services/index/sync');
      const { inspectVault } = await import('../../../src/services/migrate/inspector');

      indexNote(
        db,
        createTestNote(
          'research/valid.md',
          'Valid',
          '# Valid\n\n[[Kubernetes]] is a container orchestrator.',
          'research'
        )
      );

      const result = await inspectVault(db, testVault, ['broken_wiki_links']);
      expect(result.summary.broken_wiki_links).toBe(0);
    });
  });

  describe('Code block link detection', () => {
    it('detects wiki-links inside fenced code blocks', async () => {
      const { indexNote } = await import('../../../src/services/index/sync');
      const { inspectVault } = await import('../../../src/services/migrate/inspector');

      indexNote(
        db,
        createTestNote(
          'research/codelinks.md',
          'Code Links',
          '# Code Links\n\n```bash\nkubectl [[Port Forward Workflow]] pod 8080:80\n```',
          'research'
        )
      );

      const result = await inspectVault(db, testVault, ['code_block_links']);

      expect(result.summary.code_block_links).toBe(1);
      const issue = result.issues[0]!;
      expect(issue.path).toBe('research/codelinks.md');
      expect(issue.description).toContain('inside code block');
      expect(issue.suggestion).toContain('plain text');
    });

    it('ignores wiki-links outside code blocks', async () => {
      const { indexNote } = await import('../../../src/services/index/sync');
      const { inspectVault } = await import('../../../src/services/migrate/inspector');

      indexNote(
        db,
        createTestNote(
          'research/normal.md',
          'Normal',
          '# Normal\n\nSee [[Kubernetes]] for details.\n\n```bash\necho hello\n```',
          'research'
        )
      );

      const result = await inspectVault(db, testVault, ['code_block_links']);
      expect(result.summary.code_block_links).toBe(0);
    });
  });

  describe('Orphaned fragment detection', () => {
    it('detects notes in hub directories not linked from hub', async () => {
      const { indexNote } = await import('../../../src/services/index/sync');
      const { inspectVault } = await import('../../../src/services/migrate/inspector');

      // Hub that only links to Architecture
      indexNote(
        db,
        createTestNote(
          'infrastructure/kubernetes/Kubernetes.md',
          'Kubernetes',
          '# Kubernetes\n\n## Knowledge Map\n\n- [[Architecture]]',
          'research_hub'
        )
      );

      // Linked child
      indexNote(
        db,
        createTestNote(
          'infrastructure/kubernetes/Architecture.md',
          'Architecture',
          '# Architecture\n\nArch details.',
          'research'
        )
      );

      // Orphaned fragment — in hub directory but not linked
      indexNote(
        db,
        createTestNote(
          'infrastructure/kubernetes/Legacy Notes.md',
          'Legacy Notes',
          '# Legacy Notes\n\nOld content.',
          'research'
        )
      );

      const result = await inspectVault(db, testVault, ['orphaned_fragments']);

      expect(result.summary.orphaned_fragments).toBe(1);
      expect(result.issues[0]!.path).toBe('infrastructure/kubernetes/Legacy Notes.md');
    });
  });
});
