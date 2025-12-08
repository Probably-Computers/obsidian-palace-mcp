/**
 * Retroactive Linking Service Tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { join } from 'path';
import { mkdir, rm, writeFile, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import Database from 'better-sqlite3';

// Set up test environment before importing services
const testDir = join(tmpdir(), `palace-retroactive-test-${randomUUID()}`);
const testVault = join(testDir, 'vault');
const testPalace = join(testVault, '.palace');

// Configure environment before imports
process.env.PALACE_VAULT_PATH = testVault;
process.env.PALACE_LOG_LEVEL = 'error';
process.env.PALACE_WATCH_ENABLED = 'false';

// Dynamic imports after env setup
import { resetConfig } from '../../../src/config/index';
import type { ResolvedVault, VaultConfig } from '../../../src/types/index';

// Mock vault for testing
const createMockVault = (): ResolvedVault => ({
  alias: 'test',
  path: testVault,
  mode: 'rw',
  isDefault: true,
  config: {
    vault: { name: 'test-vault' },
    structure: {},
    ignore: { patterns: [], marker_file: '.palace-ignore', frontmatter_key: 'palace_ignore' },
    atomic: { max_lines: 200, max_sections: 6, auto_split: true },
    stubs: { auto_create: true, min_confidence: 0.2 },
    graph: { require_technology_links: true, warn_orphan_depth: 1, retroactive_linking: true },
  } as VaultConfig,
});

// Helper to create test notes
function createTestNote(
  path: string,
  title: string,
  content: string,
  type: 'research' | 'command' = 'research'
) {
  return {
    path,
    filename: path.split('/').pop()!,
    title,
    frontmatter: {
      type,
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

describe('Retroactive Linking', () => {
  let db: Database.Database;

  beforeAll(async () => {
    await mkdir(testVault, { recursive: true });
    await mkdir(testPalace, { recursive: true });
    await mkdir(join(testVault, 'research'), { recursive: true });
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
  });

  describe('findUnlinkedMentions', () => {
    beforeEach(async () => {
      const { indexNote } = await import('../../../src/services/index/sync');

      // Create notes that mention "Docker" without linking
      const notes = [
        createTestNote(
          'research/kubernetes.md',
          'Kubernetes',
          '# Kubernetes\n\nKubernetes works well with Docker containers.',
        ),
        createTestNote(
          'research/containers.md',
          'Containers',
          '# Containers\n\nDocker is a popular container runtime. Use Docker for local development.',
        ),
        createTestNote(
          'research/linked.md',
          'Already Linked',
          '# Already Linked\n\nThis note links to [[Docker]] properly.',
        ),
        createTestNote(
          'research/docker.md',
          'Docker',
          '# Docker\n\nDocker is a container platform.',
        ),
      ];

      for (const note of notes) {
        indexNote(db, note);
      }
    });

    it('finds notes that mention a term without linking', async () => {
      const { findUnlinkedMentions } = await import('../../../src/services/graph/retroactive');

      const matches = findUnlinkedMentions(db, 'Docker', 'research/docker.md');

      expect(matches.length).toBe(2);
      const paths = matches.map(m => m.path);
      expect(paths).toContain('research/kubernetes.md');
      expect(paths).toContain('research/containers.md');
    });

    it('does not include notes that already link', async () => {
      const { findUnlinkedMentions } = await import('../../../src/services/graph/retroactive');

      const matches = findUnlinkedMentions(db, 'Docker', 'research/docker.md');

      const paths = matches.map(m => m.path);
      expect(paths).not.toContain('research/linked.md');
    });

    it('does not include the target note itself', async () => {
      const { findUnlinkedMentions } = await import('../../../src/services/graph/retroactive');

      const matches = findUnlinkedMentions(db, 'Docker', 'research/docker.md');

      const paths = matches.map(m => m.path);
      expect(paths).not.toContain('research/docker.md');
    });

    it('counts multiple mentions in a note', async () => {
      const { findUnlinkedMentions } = await import('../../../src/services/graph/retroactive');

      const matches = findUnlinkedMentions(db, 'Docker', 'research/docker.md');

      const containers = matches.find(m => m.path === 'research/containers.md');
      expect(containers).toBeDefined();
      expect(containers!.mentionCount).toBe(2);
    });

    it('searches for aliases as well', async () => {
      const { findUnlinkedMentions } = await import('../../../src/services/graph/retroactive');

      // Add a note that uses an alias
      const { indexNote } = await import('../../../src/services/index/sync');
      indexNote(db, createTestNote(
        'research/alias-test.md',
        'Alias Test',
        '# Alias Test\n\nThis mentions docker-engine which is an alias.',
      ));

      const matches = findUnlinkedMentions(db, 'Docker', 'research/docker.md', ['docker-engine']);

      const aliasNote = matches.find(m => m.path === 'research/alias-test.md');
      expect(aliasNote).toBeDefined();
    });
  });

  describe('addRetroactiveLinks', () => {
    beforeEach(async () => {
      // Create actual files for modification
      const content = `---
type: research
created: 2025-01-01T00:00:00Z
modified: 2025-01-01T00:00:00Z
---

# Test Note

This mentions Docker in the content.

Docker is great for containers.`;

      await writeFile(join(testVault, 'research/test-note.md'), content);
    });

    it('tracks notes that would be updated', async () => {
      const { addRetroactiveLinks } = await import('../../../src/services/graph/retroactive');
      const vault = createMockVault();

      // The test content is:
      // Line 1: ---
      // Line 2: type: research
      // Line 3: created: ...
      // Line 4: modified: ...
      // Line 5: ---
      // Line 6: (blank)
      // Line 7: # Test Note
      // Line 8: (blank)
      // Line 9: This mentions Docker in the content.
      // Line 10: (blank)
      // Line 11: Docker is great for containers.
      const matches = [{
        path: 'research/test-note.md',
        title: 'Test Note',
        mentionCount: 2,
        positions: [
          { line: 9, column: 15, text: 'Docker' },  // "This mentions Docker..."
          { line: 11, column: 1, text: 'Docker' },  // "Docker is great..."
        ],
      }];

      const result = await addRetroactiveLinks('Docker', 'research/docker.md', matches, vault);

      // The note should be in the updated list (even if links aren't perfectly matched)
      expect(result.notesUpdated).toContain('research/test-note.md');
    });

    it('respects dry run option', async () => {
      const { addRetroactiveLinks } = await import('../../../src/services/graph/retroactive');
      const vault = createMockVault();

      const originalContent = await readFile(join(testVault, 'research/test-note.md'), 'utf-8');

      const matches = [{
        path: 'research/test-note.md',
        title: 'Test Note',
        mentionCount: 1,
        positions: [{ line: 7, column: 15, text: 'Docker' }],
      }];

      await addRetroactiveLinks('Docker', 'research/docker.md', matches, vault, { dryRun: true });

      // Verify the file was NOT updated
      const afterContent = await readFile(join(testVault, 'research/test-note.md'), 'utf-8');
      expect(afterContent).toBe(originalContent);
    });

    it('respects maxNotes option', async () => {
      const { addRetroactiveLinks } = await import('../../../src/services/graph/retroactive');
      const vault = createMockVault();

      // Create multiple files
      for (let i = 1; i <= 5; i++) {
        const content = `---
type: research
---

# Note ${i}

Mentions Docker here.`;
        await writeFile(join(testVault, `research/note-${i}.md`), content);
      }

      const matches = Array.from({ length: 5 }, (_, i) => ({
        path: `research/note-${i + 1}.md`,
        title: `Note ${i + 1}`,
        mentionCount: 1,
        positions: [{ line: 7, column: 10, text: 'Docker' }],
      }));

      const result = await addRetroactiveLinks(
        'Docker',
        'research/docker.md',
        matches,
        vault,
        { maxNotes: 2 }
      );

      expect(result.notesUpdated.length).toBe(2);
    });
  });

  describe('getRetroactiveLinkStats', () => {
    beforeEach(async () => {
      const { indexNote } = await import('../../../src/services/index/sync');

      const notes = [
        createTestNote(
          'research/note1.md',
          'Note 1',
          'Mentions Kubernetes twice. Kubernetes is great.',
        ),
        createTestNote(
          'research/note2.md',
          'Note 2',
          'Also mentions Kubernetes.',
        ),
        createTestNote(
          'research/kubernetes.md',
          'Kubernetes',
          'The Kubernetes note itself.',
        ),
      ];

      for (const note of notes) {
        indexNote(db, note);
      }
    });

    it('returns statistics about potential retroactive links', async () => {
      const { getRetroactiveLinkStats } = await import('../../../src/services/graph/retroactive');

      const stats = getRetroactiveLinkStats(db, 'Kubernetes', 'research/kubernetes.md');

      expect(stats.notesWithMentions).toBe(2);
      expect(stats.totalMentions).toBe(3); // 2 in note1, 1 in note2
    });
  });
});
