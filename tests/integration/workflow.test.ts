/**
 * Integration tests - Full workflow tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { join } from 'path';
import { mkdir, rm, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

// Set up test environment before importing services
const testDir = join(tmpdir(), `palace-integration-${randomUUID()}`);
const testVault = join(testDir, 'vault');
const testIndex = join(testDir, 'index.sqlite');

// Configure environment before imports
process.env.PALACE_VAULT_PATH = testVault;
process.env.PALACE_INDEX_PATH = testIndex;
process.env.PALACE_LOG_LEVEL = 'error';
process.env.PALACE_WATCH_ENABLED = 'false';

// Dynamic imports after env setup
import { resetConfig } from '../../src/config/index';

describe('Integration Tests', () => {
  beforeAll(async () => {
    // Create test vault directory with subdirectories
    await mkdir(join(testVault, 'research'), { recursive: true });
    await mkdir(join(testVault, 'commands'), { recursive: true });
    await mkdir(join(testVault, 'daily'), { recursive: true });
    resetConfig();
  });

  afterAll(async () => {
    // Clean up
    const { closeDatabase } = await import('../../src/services/index/index');
    closeDatabase();
    await rm(testDir, { recursive: true, force: true });
  });

  describe('CRUD Workflow', () => {
    beforeEach(async () => {
      const { clearIndex, getDatabase } = await import('../../src/services/index/index');
      await getDatabase();
      clearIndex();
      // Clean up vault directories
      await rm(join(testVault, 'research'), { recursive: true, force: true }).catch(() => {});
      await rm(join(testVault, 'commands'), { recursive: true, force: true }).catch(() => {});
      await mkdir(join(testVault, 'research'), { recursive: true });
      await mkdir(join(testVault, 'commands'), { recursive: true });
    });

    it('creates, reads, updates, and queries a note', async () => {
      const { rememberHandler } = await import('../../src/tools/remember');
      const { readHandler } = await import('../../src/tools/read');
      const { updateHandler } = await import('../../src/tools/update');
      const { recallHandler } = await import('../../src/tools/recall');
      const { indexNote } = await import('../../src/services/index/index');

      // Create a note
      const createResult = await rememberHandler({
        content: 'Kubernetes uses pods as the smallest deployable unit.',
        title: 'Kubernetes Pods',
        type: 'research',
        tags: ['kubernetes', 'containers'],
        confidence: 0.8,
        autolink: false,
      });

      expect(createResult.success).toBe(true);
      if (!createResult.success) return;
      expect(createResult.data.path).toContain('kubernetes-pods.md');

      // Read the note
      const readResult = await readHandler({ path: createResult.data.path });
      expect(readResult.success).toBe(true);
      if (!readResult.success) return;
      expect(readResult.data.content).toContain('smallest deployable unit');

      // Index the note for search
      indexNote({
        path: createResult.data.path,
        filename: 'kubernetes-pods.md',
        title: 'Kubernetes Pods',
        frontmatter: readResult.data.frontmatter,
        content: readResult.data.content,
        raw: '',
      });

      // Update the note
      const updateResult = await updateHandler({
        path: createResult.data.path,
        mode: 'append',
        content: '\n\nPods can contain multiple containers that share resources.',
        autolink: false,
      });
      expect(updateResult.success).toBe(true);

      // Search for the note
      const searchResult = await recallHandler({ query: 'kubernetes pods' });
      expect(searchResult.success).toBe(true);
      if (!searchResult.success) return;
      expect(searchResult.data.results.length).toBeGreaterThan(0);
      expect(searchResult.data.results[0].note.title).toBe('Kubernetes Pods');
    });

    it('handles frontmatter updates correctly', async () => {
      const { rememberHandler } = await import('../../src/tools/remember');
      const { updateHandler } = await import('../../src/tools/update');
      const { readHandler } = await import('../../src/tools/read');

      // Create a note with initial confidence
      const createResult = await rememberHandler({
        content: 'Test content for frontmatter updates',
        title: 'Frontmatter Test',
        type: 'research',
        confidence: 0.5,
        verified: false,
      });

      expect(createResult.success).toBe(true);
      if (!createResult.success) return;

      // Update frontmatter only
      const updateResult = await updateHandler({
        path: createResult.data.path,
        mode: 'frontmatter',
        frontmatter: {
          confidence: 0.9,
          verified: true,
          tags: ['updated', 'verified'],
        },
      });

      expect(updateResult.success).toBe(true);

      // Read and verify
      const readResult = await readHandler({ path: createResult.data.path });
      expect(readResult.success).toBe(true);
      if (!readResult.success) return;
      expect(readResult.data.frontmatter.confidence).toBe(0.9);
      expect(readResult.data.frontmatter.verified).toBe(true);
      expect(readResult.data.frontmatter.tags).toContain('verified');
    });
  });

  describe('Search and Query Workflow', () => {
    beforeEach(async () => {
      const { clearIndex, getDatabase, indexNote } = await import(
        '../../src/services/index/index'
      );
      await getDatabase();
      clearIndex();

      // Create test notes directly in index for search tests
      indexNote({
        path: 'research/docker-overview.md',
        filename: 'docker-overview.md',
        title: 'Docker Overview',
        frontmatter: {
          type: 'research' as const,
          created: new Date().toISOString(),
          modified: new Date().toISOString(),
          confidence: 0.9,
          tags: ['docker', 'containers'],
        },
        content: 'Docker is a containerization platform.',
        raw: '',
      });

      indexNote({
        path: 'commands/docker-compose-guide.md',
        filename: 'docker-compose-guide.md',
        title: 'Docker Compose Guide',
        frontmatter: {
          type: 'command' as const,
          created: new Date().toISOString(),
          modified: new Date().toISOString(),
          confidence: 0.8,
          tags: ['docker', 'compose'],
        },
        content: 'Docker Compose orchestrates multi-container applications.',
        raw: '',
      });

      indexNote({
        path: 'research/kubernetes-intro.md',
        filename: 'kubernetes-intro.md',
        title: 'Kubernetes Intro',
        frontmatter: {
          type: 'research' as const,
          created: new Date().toISOString(),
          modified: new Date().toISOString(),
          confidence: 0.7,
          tags: ['kubernetes', 'containers'],
        },
        content: 'Kubernetes manages containerized workloads.',
        raw: '',
      });
    });

    it('searches with full-text query', async () => {
      const { recallHandler } = await import('../../src/tools/recall');

      const result = await recallHandler({ query: 'containerization' });
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.results.length).toBeGreaterThan(0);
      expect(result.data.results[0].note.title).toBe('Docker Overview');
    });

    it('filters by type', async () => {
      const { queryHandler } = await import('../../src/tools/query');

      const result = await queryHandler({ type: 'command' });
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.results.length).toBe(1);
      expect(result.data.results[0].title).toBe('Docker Compose Guide');
    });

    it('filters by tags', async () => {
      const { queryHandler } = await import('../../src/tools/query');

      const result = await queryHandler({ tags: ['containers'] });
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.results.length).toBe(2);
    });

    it('filters by minimum confidence', async () => {
      const { queryHandler } = await import('../../src/tools/query');

      const result = await queryHandler({ min_confidence: 0.85 });
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.results.length).toBe(1);
      expect(result.data.results[0].title).toBe('Docker Overview');
    });

    it('executes dataview queries', async () => {
      const { dataviewHandler } = await import('../../src/tools/dataview');

      const result = await dataviewHandler({
        query: 'TABLE title, confidence WHERE type = "research"',
        format: 'json',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.total).toBe(2);
    });
  });

  describe('Graph Workflow', () => {
    beforeEach(async () => {
      const { clearIndex, getDatabase, indexNote } = await import(
        '../../src/services/index/index'
      );
      await getDatabase();
      clearIndex();

      // Create test notes directly in index for graph tests
      indexNote({
        path: 'research/main-topic.md',
        filename: 'main-topic.md',
        title: 'Main Topic',
        frontmatter: {
          type: 'research' as const,
          created: new Date().toISOString(),
          modified: new Date().toISOString(),
          tags: ['main'],
        },
        content: 'Main topic that links to [[Subtopic A]] and [[Subtopic B]].',
        raw: '',
      });

      indexNote({
        path: 'research/subtopic-a.md',
        filename: 'subtopic-a.md',
        title: 'Subtopic A',
        frontmatter: {
          type: 'research' as const,
          created: new Date().toISOString(),
          modified: new Date().toISOString(),
          tags: ['subtopic', 'category-a'],
        },
        content: 'This is subtopic A.',
        raw: '',
      });

      indexNote({
        path: 'research/subtopic-b.md',
        filename: 'subtopic-b.md',
        title: 'Subtopic B',
        frontmatter: {
          type: 'research' as const,
          created: new Date().toISOString(),
          modified: new Date().toISOString(),
          tags: ['subtopic', 'category-a'],
        },
        content: 'This is subtopic B.',
        raw: '',
      });

      indexNote({
        path: 'research/orphan-note.md',
        filename: 'orphan-note.md',
        title: 'Orphan Note',
        frontmatter: {
          type: 'research' as const,
          created: new Date().toISOString(),
          modified: new Date().toISOString(),
          tags: ['orphan'],
        },
        content: 'Orphan note with no links.',
        raw: '',
      });
    });

    it('finds outgoing links', async () => {
      const { linksHandler } = await import('../../src/tools/links');

      const result = await linksHandler({
        path: 'research/main-topic.md',
        direction: 'outgoing',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.outgoing.length).toBe(2);
    });

    it('finds orphan notes', async () => {
      const { orphansHandler } = await import('../../src/tools/orphans');

      const result = await orphansHandler({ type: 'isolated' });
      expect(result.success).toBe(true);
      if (!result.success) return;
      // Orphan note has no links in or out
      expect(result.data.orphans.length).toBeGreaterThan(0);
    });

    it('finds related notes by tags', async () => {
      const { relatedHandler } = await import('../../src/tools/related');

      const result = await relatedHandler({
        path: 'research/subtopic-a.md',
        method: 'tags',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      // subtopic-b shares 'subtopic' and 'category-a' tags
      expect(result.data.related.length).toBeGreaterThan(0);
    });
  });

  describe('Session Workflow', () => {
    beforeEach(async () => {
      const { clearSession } = await import('../../src/tools/session');
      clearSession();

      // Clean daily directory
      try {
        await rm(join(testVault, 'daily'), { recursive: true, force: true });
        await mkdir(join(testVault, 'daily'), { recursive: true });
      } catch {
        // Directory may not exist
      }
    });

    it('creates and logs session entries', async () => {
      const { sessionStartHandler, sessionLogHandler, getCurrentSession } = await import(
        '../../src/tools/session'
      );

      // Start session
      const startResult = await sessionStartHandler({
        topic: 'Integration testing',
        context: 'Test suite',
      });

      expect(startResult.success).toBe(true);
      if (!startResult.success) return;
      expect(startResult.data.sessionNumber).toBe(1);

      // Log entries
      await sessionLogHandler({ entry: 'Started testing workflow' });
      await sessionLogHandler({
        entry: 'Created test notes',
        notes_created: ['research/test.md'],
      });

      // Verify session state
      const session = getCurrentSession();
      expect(session).not.toBeNull();
      expect(session?.entries.length).toBe(2);

      // Verify file was created
      const logPath = join(testVault, startResult.data.logPath);
      const content = await readFile(logPath, 'utf-8');
      expect(content).toContain('Integration testing');
      expect(content).toContain('Started testing workflow');
    });
  });
});
