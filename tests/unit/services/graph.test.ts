/**
 * Graph service tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { join } from 'path';
import { mkdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

// Set up test environment before importing services
const testDir = join(tmpdir(), `palace-graph-test-${randomUUID()}`);
const testVault = join(testDir, 'vault');
const testIndex = join(testDir, 'index.sqlite');

// Configure environment before imports
process.env.PALACE_VAULT_PATH = testVault;
process.env.PALACE_INDEX_PATH = testIndex;
process.env.PALACE_LOG_LEVEL = 'error';
process.env.PALACE_WATCH_ENABLED = 'false';

// Dynamic imports after env setup
import { resetConfig } from '../../../src/config/index';

// Helper to create test notes with links
function createTestNote(
  path: string,
  title: string,
  content: string,
  tags: string[] = [],
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
      tags,
      related: [],
      aliases: [],
    },
    content,
    raw: `---\ntype: ${type}\n---\n\n${content}`,
  };
}

describe('Graph Service', () => {
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

  describe('Link Extraction', () => {
    beforeEach(async () => {
      const { clearIndex, getDatabase, indexNote } = await import(
        '../../../src/services/index/index'
      );

      await getDatabase();
      clearIndex();

      // Create a graph structure:
      // NoteA -> NoteB, NoteC
      // NoteB -> NoteC
      // NoteC (no outgoing links)
      // NoteD (isolated)

      const notes = [
        createTestNote(
          'research/note-a.md',
          'Note A',
          '# Note A\n\nThis links to [[Note B]] and [[Note C]].',
          ['tag1', 'shared']
        ),
        createTestNote(
          'research/note-b.md',
          'Note B',
          '# Note B\n\nThis links to [[Note C]].',
          ['tag2', 'shared']
        ),
        createTestNote(
          'research/note-c.md',
          'Note C',
          '# Note C\n\nThis has no outgoing links.',
          ['tag3']
        ),
        createTestNote(
          'research/note-d.md',
          'Note D',
          '# Note D\n\nThis is completely isolated.',
          ['tag4']
        ),
      ];

      for (const note of notes) {
        indexNote(note);
      }
    });

    it('gets outgoing links from a note', async () => {
      const { getOutgoingLinks } = await import('../../../src/services/graph/index');

      const links = getOutgoingLinks('research/note-a.md');
      expect(links.length).toBe(2);

      const targets = links.map((l) => l.target);
      expect(targets).toContain('Note B');
      expect(targets).toContain('Note C');
    });

    it('gets incoming links (backlinks) to a note', async () => {
      const { getIncomingLinks } = await import('../../../src/services/graph/index');

      const backlinks = getIncomingLinks('research/note-c.md');
      expect(backlinks.length).toBe(2);

      const sources = backlinks.map((l) => l.source);
      expect(sources).toContain('research/note-a.md');
      expect(sources).toContain('research/note-b.md');
    });

    it('returns empty for notes with no outgoing links', async () => {
      const { getOutgoingLinks } = await import('../../../src/services/graph/index');

      const links = getOutgoingLinks('research/note-c.md');
      expect(links.length).toBe(0);
    });

    it('returns empty for notes with no incoming links', async () => {
      const { getIncomingLinks } = await import('../../../src/services/graph/index');

      const backlinks = getIncomingLinks('research/note-a.md');
      expect(backlinks.length).toBe(0);
    });

    it('resolves link targets to actual notes', async () => {
      const { isLinkResolved } = await import('../../../src/services/graph/index');

      expect(isLinkResolved('Note B')).toBe(true);
      expect(isLinkResolved('Note C')).toBe(true);
      expect(isLinkResolved('Non Existent Note')).toBe(false);
    });
  });

  describe('Graph Traversal', () => {
    beforeEach(async () => {
      const { clearIndex, getDatabase, indexNote } = await import(
        '../../../src/services/index/index'
      );

      await getDatabase();
      clearIndex();

      // Create a deeper graph for traversal testing:
      // Root -> Level1A, Level1B
      // Level1A -> Level2A
      // Level1B -> Level2A, Level2B
      // Level2A -> Level3A

      const notes = [
        createTestNote(
          'research/root.md',
          'Root',
          '# Root\n\nLinks to [[Level1A]] and [[Level1B]].',
          ['root']
        ),
        createTestNote(
          'research/level1a.md',
          'Level1A',
          '# Level1A\n\nLinks to [[Level2A]].',
          ['level1']
        ),
        createTestNote(
          'research/level1b.md',
          'Level1B',
          '# Level1B\n\nLinks to [[Level2A]] and [[Level2B]].',
          ['level1']
        ),
        createTestNote(
          'research/level2a.md',
          'Level2A',
          '# Level2A\n\nLinks to [[Level3A]].',
          ['level2']
        ),
        createTestNote(
          'research/level2b.md',
          'Level2B',
          '# Level2B\n\nNo outgoing links.',
          ['level2']
        ),
        createTestNote(
          'research/level3a.md',
          'Level3A',
          '# Level3A\n\nDeepest level.',
          ['level3']
        ),
      ];

      for (const note of notes) {
        indexNote(note);
      }
    });

    it('traverses outgoing links at depth 1', async () => {
      const { traverseGraph } = await import('../../../src/services/graph/index');

      const results = traverseGraph('research/root.md', 'outgoing', 1);
      expect(results.length).toBe(2);

      const titles = results.map((r) => r.note.title);
      expect(titles).toContain('Level1A');
      expect(titles).toContain('Level1B');
    });

    it('traverses outgoing links at depth 2', async () => {
      const { traverseGraph } = await import('../../../src/services/graph/index');

      const results = traverseGraph('research/root.md', 'outgoing', 2);

      // Should include Level1A, Level1B (depth 1) + Level2A, Level2B (depth 2)
      expect(results.length).toBe(4);

      const depth1 = results.filter((r) => r.depth === 1);
      const depth2 = results.filter((r) => r.depth === 2);

      expect(depth1.length).toBe(2);
      expect(depth2.length).toBe(2);
    });

    it('traverses incoming links (backlinks)', async () => {
      const { traverseGraph } = await import('../../../src/services/graph/index');

      const results = traverseGraph('research/level2a.md', 'incoming', 1);
      expect(results.length).toBe(2);

      const titles = results.map((r) => r.note.title);
      expect(titles).toContain('Level1A');
      expect(titles).toContain('Level1B');
    });

    it('tracks traversal path', async () => {
      const { traverseGraph } = await import('../../../src/services/graph/index');

      const results = traverseGraph('research/root.md', 'outgoing', 3);

      // Find Level3A in results
      const level3 = results.find((r) => r.note.title === 'Level3A');
      expect(level3).toBeDefined();
      expect(level3!.depth).toBe(3);
      expect(level3!.path.length).toBe(4); // root -> level1a -> level2a -> level3a
    });
  });

  describe('Orphan Detection', () => {
    beforeEach(async () => {
      const { clearIndex, getDatabase, indexNote } = await import(
        '../../../src/services/index/index'
      );

      await getDatabase();
      clearIndex();

      const notes = [
        createTestNote(
          'research/connected.md',
          'Connected',
          '# Connected\n\nLinks to [[Target]].',
          []
        ),
        createTestNote(
          'research/target.md',
          'Target',
          '# Target\n\nLinks to [[Connected]].',
          []
        ),
        createTestNote(
          'research/no-incoming.md',
          'No Incoming',
          '# No Incoming\n\nLinks to [[Target]] but no one links here.',
          []
        ),
        createTestNote(
          'research/no-outgoing.md',
          'No Outgoing',
          '# No Outgoing\n\nNo outgoing links.',
          []
        ),
        createTestNote(
          'research/isolated.md',
          'Isolated',
          '# Isolated\n\nCompletely alone.',
          []
        ),
      ];

      // Add a link from Connected to No Outgoing
      notes[0].content = '# Connected\n\nLinks to [[Target]] and [[No Outgoing]].';

      for (const note of notes) {
        indexNote(note);
      }
    });

    it('finds notes with no incoming links', async () => {
      const { findOrphans } = await import('../../../src/services/graph/index');

      const orphans = findOrphans('no_incoming');
      const titles = orphans.map((o) => o.title);

      // No Incoming, No Outgoing, Isolated should have no backlinks
      expect(titles).toContain('No Incoming');
      expect(titles).toContain('Isolated');
    });

    it('finds notes with no outgoing links', async () => {
      const { findOrphans } = await import('../../../src/services/graph/index');

      const orphans = findOrphans('no_outgoing');
      const titles = orphans.map((o) => o.title);

      expect(titles).toContain('No Outgoing');
      expect(titles).toContain('Isolated');
    });

    it('finds completely isolated notes', async () => {
      const { findOrphans } = await import('../../../src/services/graph/index');

      const orphans = findOrphans('isolated');
      const titles = orphans.map((o) => o.title);

      expect(titles).toContain('Isolated');
      expect(titles.length).toBeLessThan(5); // Not all notes should be isolated
    });
  });

  describe('Related Notes', () => {
    beforeEach(async () => {
      const { clearIndex, getDatabase, indexNote } = await import(
        '../../../src/services/index/index'
      );

      await getDatabase();
      clearIndex();

      // Create notes with shared links and tags
      const notes = [
        createTestNote(
          'research/main.md',
          'Main',
          '# Main\n\nLinks to [[SharedTarget]] and [[AnotherTarget]].',
          ['javascript', 'web']
        ),
        createTestNote(
          'research/similar.md',
          'Similar',
          '# Similar\n\nAlso links to [[SharedTarget]] and [[DifferentTarget]].',
          ['javascript', 'frontend']
        ),
        createTestNote(
          'research/also-similar.md',
          'Also Similar',
          '# Also Similar\n\nLinks to [[AnotherTarget]].',
          ['web', 'backend']
        ),
        createTestNote(
          'research/unrelated.md',
          'Unrelated',
          '# Unrelated\n\nLinks to [[CompletelyDifferent]].',
          ['python', 'ml']
        ),
        createTestNote(
          'research/shared-target.md',
          'SharedTarget',
          '# SharedTarget\n\nI am a shared target.',
          []
        ),
        createTestNote(
          'research/another-target.md',
          'AnotherTarget',
          '# AnotherTarget\n\nAnother target.',
          []
        ),
      ];

      for (const note of notes) {
        indexNote(note);
      }
    });

    it('finds related notes by shared links', async () => {
      const { findRelatedNotes } = await import('../../../src/services/graph/index');

      const related = findRelatedNotes('research/main.md', 'links', 10);

      // Similar should be related (shares SharedTarget link)
      const titles = related.map((r) => r.note.title);
      expect(titles).toContain('Similar');
    });

    it('finds related notes by shared tags', async () => {
      const { findRelatedNotes } = await import('../../../src/services/graph/index');

      const related = findRelatedNotes('research/main.md', 'tags', 10);

      // Similar (shares javascript) and Also Similar (shares web) should be related
      const titles = related.map((r) => r.note.title);
      expect(titles).toContain('Similar');
      expect(titles).toContain('Also Similar');
    });

    it('ranks related notes by score', async () => {
      const { findRelatedNotes } = await import('../../../src/services/graph/index');

      const related = findRelatedNotes('research/main.md', 'tags', 10);

      // Results should be sorted by score descending
      for (let i = 1; i < related.length; i++) {
        expect(related[i - 1]!.score).toBeGreaterThanOrEqual(related[i]!.score);
      }
    });

    it('includes shared links in results', async () => {
      const { findRelatedNotes } = await import('../../../src/services/graph/index');

      const related = findRelatedNotes('research/main.md', 'links', 10);
      const similar = related.find((r) => r.note.title === 'Similar');

      expect(similar?.sharedLinks).toBeDefined();
      expect(similar?.sharedLinks).toContain('SharedTarget');
    });

    it('includes shared tags in results', async () => {
      const { findRelatedNotes } = await import('../../../src/services/graph/index');

      const related = findRelatedNotes('research/main.md', 'tags', 10);
      const similar = related.find((r) => r.note.title === 'Similar');

      expect(similar?.sharedTags).toBeDefined();
      expect(similar?.sharedTags).toContain('javascript');
    });
  });

  describe('Graph Node', () => {
    beforeEach(async () => {
      const { clearIndex, getDatabase, indexNote } = await import(
        '../../../src/services/index/index'
      );

      await getDatabase();
      clearIndex();

      const notes = [
        createTestNote(
          'research/hub.md',
          'Hub',
          '# Hub\n\nLinks to [[Spoke1]], [[Spoke2]], [[Spoke3]].',
          []
        ),
        createTestNote(
          'research/spoke1.md',
          'Spoke1',
          '# Spoke1\n\nLinks back to [[Hub]].',
          []
        ),
        createTestNote(
          'research/spoke2.md',
          'Spoke2',
          '# Spoke2\n\nLinks back to [[Hub]].',
          []
        ),
        createTestNote(
          'research/spoke3.md',
          'Spoke3',
          '# Spoke3\n\nNo links.',
          []
        ),
      ];

      for (const note of notes) {
        indexNote(note);
      }
    });

    it('gets graph node with link counts', async () => {
      const { getGraphNode } = await import('../../../src/services/graph/index');

      const hub = getGraphNode('research/hub.md');
      expect(hub).not.toBeNull();
      expect(hub!.title).toBe('Hub');
      expect(hub!.outgoingCount).toBe(3);
      expect(hub!.incomingCount).toBe(2); // Spoke1 and Spoke2 link back
    });

    it('returns null for non-existent note', async () => {
      const { getGraphNode } = await import('../../../src/services/graph/index');

      const node = getGraphNode('research/non-existent.md');
      expect(node).toBeNull();
    });
  });
});
