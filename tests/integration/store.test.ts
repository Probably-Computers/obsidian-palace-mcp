/**
 * Integration tests for palace_store tool
 *
 * Tests complex scenarios: stub creation from wiki-links,
 * retroactive linking, path conflict resolution, atomic splitting,
 * and operation tracking flows.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('fs/promises', () => ({
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock('../../src/services/vault/resolver.js', () => ({
  resolveStorage: vi.fn(),
  checkPathConflict: vi.fn(),
  generateAlternativePath: vi.fn(),
}));

vi.mock('../../src/services/vault/stub-manager.js', () => ({
  findStubByTitle: vi.fn(),
  expandStub: vi.fn(),
  createStubsForUnresolvedLinks: vi.fn(),
}));

vi.mock('../../src/services/graph/retroactive.js', () => ({
  findUnlinkedMentions: vi.fn(),
  addRetroactiveLinks: vi.fn(),
}));

vi.mock('../../src/services/autolink/index.js', () => ({
  buildCompleteIndex: vi.fn(),
  scanForMatches: vi.fn(),
  autolinkContent: vi.fn(),
}));

vi.mock('../../src/utils/markdown.js', () => ({
  processWikiLinks: vi.fn((content: string) =>
    content.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m: string, p1: string, p2: string) => p2 || p1)
  ),
}));

vi.mock('../../src/services/index/index.js', () => ({
  getIndexManager: vi.fn(),
}));

vi.mock('../../src/services/index/sync.js', () => ({
  getIndexedPaths: vi.fn(),
  indexNote: vi.fn(),
}));

vi.mock('../../src/services/vault/reader.js', () => ({
  readNote: vi.fn(),
}));

vi.mock('../../src/utils/vault-param.js', () => ({
  resolveVaultParam: vi.fn(),
  enforceWriteAccess: vi.fn(),
  getVaultResultInfo: vi.fn(),
  validateNotePath: vi.fn(),
}));

vi.mock('../../src/utils/frontmatter.js', () => ({
  stringifyFrontmatter: vi.fn(
    (fm: Record<string, unknown>, body: string) => `---\n${JSON.stringify(fm)}\n---\n\n${body}`
  ),
}));

vi.mock('../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../src/services/atomic/index.js', () => ({
  shouldSplit: vi.fn(),
  splitContent: vi.fn(),
  createHub: vi.fn(),
  createChildNote: vi.fn(),
}));

vi.mock('../../src/services/operations/index.js', () => ({
  startOperation: vi.fn(),
  trackFileCreated: vi.fn(),
  trackFileModified: vi.fn(),
}));

vi.mock('../../src/services/history/storage.js', () => ({
  saveVersion: vi.fn(),
}));

import { storeHandler } from '../../src/tools/store.js';
import { resolveStorage, checkPathConflict, generateAlternativePath } from '../../src/services/vault/resolver.js';
import { findStubByTitle, createStubsForUnresolvedLinks } from '../../src/services/vault/stub-manager.js';
import { findUnlinkedMentions, addRetroactiveLinks } from '../../src/services/graph/retroactive.js';
import { buildCompleteIndex, scanForMatches, autolinkContent } from '../../src/services/autolink/index.js';
import { getIndexManager } from '../../src/services/index/index.js';
import { getIndexedPaths, indexNote } from '../../src/services/index/sync.js';
import { readNote } from '../../src/services/vault/reader.js';
import { resolveVaultParam, enforceWriteAccess, getVaultResultInfo } from '../../src/utils/vault-param.js';
import { shouldSplit, splitContent, createHub, createChildNote } from '../../src/services/atomic/index.js';
import { startOperation, trackFileCreated, trackFileModified } from '../../src/services/operations/index.js';
import { mkdir, writeFile } from 'fs/promises';

const mockVault = {
  alias: 'test',
  path: '/tmp/vault',
  mode: 'rw' as const,
  config: {
    ignore: { patterns: [], marker_file: '.palace-ignore', frontmatter_key: 'palace_ignore' },
    atomic: {
      max_lines: 200,
      max_sections: 6,
      section_max_lines: 50,
      min_section_lines: 5,
      max_children: 10,
      auto_split: true,
    },
  },
  indexPath: '/tmp/vault/.palace/index.sqlite',
};

const mockDb = {};

const baseInput = {
  title: 'Docker Networking',
  content: 'Docker uses bridge networks by default.',
  intent: {
    capture_type: 'knowledge',
    domain: ['infrastructure', 'docker'],
  },
};

function setupDefaults() {
  (resolveVaultParam as ReturnType<typeof vi.fn>).mockReturnValue(mockVault);
  (getVaultResultInfo as ReturnType<typeof vi.fn>).mockReturnValue({
    vault: 'test',
    vault_path: '/tmp/vault',
    vault_mode: 'rw',
  });
  (getIndexManager as ReturnType<typeof vi.fn>).mockReturnValue({
    getIndex: vi.fn().mockResolvedValue(mockDb),
  });
  (startOperation as ReturnType<typeof vi.fn>).mockReturnValue({ id: 'op_test123' });
  (findStubByTitle as ReturnType<typeof vi.fn>).mockReturnValue(null);
  (resolveStorage as ReturnType<typeof vi.fn>).mockReturnValue({
    fullPath: '/tmp/vault/infrastructure/docker/Docker Networking.md',
    relativePath: 'infrastructure/docker/Docker Networking.md',
    parentDir: '/tmp/vault/infrastructure/docker',
    isNewTopLevelDomain: false,
  });
  (checkPathConflict as ReturnType<typeof vi.fn>).mockReturnValue(false);
  (getIndexedPaths as ReturnType<typeof vi.fn>).mockReturnValue([]);
  (buildCompleteIndex as ReturnType<typeof vi.fn>).mockResolvedValue({ index: new Map() });
  (scanForMatches as ReturnType<typeof vi.fn>).mockReturnValue([]);
  (shouldSplit as ReturnType<typeof vi.fn>).mockReturnValue({
    shouldSplit: false,
    reason: '',
    metrics: { lineCount: 5, sectionCount: 1 },
  });
  (findUnlinkedMentions as ReturnType<typeof vi.fn>).mockReturnValue([]);
  (createStubsForUnresolvedLinks as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (readNote as ReturnType<typeof vi.fn>).mockResolvedValue(null);
}

describe('palace_store Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaults();
  });

  describe('path conflict resolution', () => {
    it('generates alternative paths when conflict exists', async () => {
      // Indexed paths include the conflicting path
      (getIndexedPaths as ReturnType<typeof vi.fn>).mockReturnValue([
        'infrastructure/docker/Docker Networking.md',
      ]);
      // First call: initial conflict check (line 343), second: while loop entry (line 349),
      // third: while loop check after alternative generated
      (checkPathConflict as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(true)   // initial check
        .mockReturnValueOnce(true)   // while loop entry (same resolution still conflicts)
        .mockReturnValueOnce(false); // after generateAlternativePath

      (generateAlternativePath as ReturnType<typeof vi.fn>).mockReturnValue({
        fullPath: '/tmp/vault/infrastructure/docker/Docker Networking 2.md',
        relativePath: 'infrastructure/docker/Docker Networking 2.md',
        parentDir: '/tmp/vault/infrastructure/docker',
        isNewTopLevelDomain: false,
      });

      const result = await storeHandler(baseInput);
      expect(result.success).toBe(true);
      expect(generateAlternativePath).toHaveBeenCalledWith(expect.any(Object), 2);
    });

    it('fails after too many conflict attempts', async () => {
      (getIndexedPaths as ReturnType<typeof vi.fn>).mockReturnValue([
        'infrastructure/docker/Docker Networking.md',
      ]);
      (checkPathConflict as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (generateAlternativePath as ReturnType<typeof vi.fn>).mockImplementation((_res, suffix) => ({
        fullPath: `/tmp/vault/infrastructure/docker/Docker Networking ${suffix}.md`,
        relativePath: `infrastructure/docker/Docker Networking ${suffix}.md`,
        parentDir: '/tmp/vault/infrastructure/docker',
        isNewTopLevelDomain: false,
      }));

      const result = await storeHandler(baseInput);
      expect(result.success).toBe(false);
      expect(result.code).toBe('PATH_CONFLICT');
    });
  });

  describe('stub creation from wiki-links', () => {
    it('creates stubs for unresolved wiki-links in content', async () => {
      (createStubsForUnresolvedLinks as ReturnType<typeof vi.fn>).mockResolvedValue([
        'infrastructure/docker/containerd.md',
        'infrastructure/docker/overlay-network.md',
      ]);

      const result = await storeHandler({
        ...baseInput,
        content: 'Docker uses [[containerd]] and [[overlay-network]] for containers.',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(createStubsForUnresolvedLinks).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        mockDb,
        mockVault,
        ['infrastructure', 'docker']
      );
      expect(result.data.stubs_created).toEqual([
        'infrastructure/docker/containerd.md',
        'infrastructure/docker/overlay-network.md',
      ]);
    });

    it('tracks stub creation in operation', async () => {
      (createStubsForUnresolvedLinks as ReturnType<typeof vi.fn>).mockResolvedValue([
        'infrastructure/docker/containerd.md',
      ]);

      await storeHandler(baseInput);

      expect(trackFileCreated).toHaveBeenCalledWith('op_test123', 'infrastructure/docker/containerd.md');
    });

    it('skips stub creation when create_stubs is false', async () => {
      await storeHandler({
        ...baseInput,
        options: { create_stubs: false },
      });

      expect(createStubsForUnresolvedLinks).not.toHaveBeenCalled();
    });

    it('handles stub creation failure gracefully', async () => {
      (createStubsForUnresolvedLinks as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Stub creation failed')
      );

      const result = await storeHandler(baseInput);
      // Should still succeed, just log warning
      expect(result.success).toBe(true);
    });
  });

  describe('retroactive linking', () => {
    it('finds and creates retroactive links from existing notes', async () => {
      (findUnlinkedMentions as ReturnType<typeof vi.fn>).mockReturnValue([
        { path: 'infrastructure/overview.md', title: 'Overview', content: 'Docker Networking is important' },
      ]);
      (addRetroactiveLinks as ReturnType<typeof vi.fn>).mockResolvedValue({
        notesUpdated: ['infrastructure/overview.md'],
      });

      const result = await storeHandler(baseInput);
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(findUnlinkedMentions).toHaveBeenCalledWith(
        mockDb,
        'Docker Networking',
        'infrastructure/docker/Docker Networking.md',
        expect.any(Array)
      );
      expect(addRetroactiveLinks).toHaveBeenCalled();
      expect(result.data.links_added.from_existing).toEqual(['infrastructure/overview.md']);
    });

    it('skips retroactive linking when disabled', async () => {
      await storeHandler({
        ...baseInput,
        options: { retroactive_link: false },
      });

      expect(findUnlinkedMentions).not.toHaveBeenCalled();
    });

    it('skips retroactive linking in dry_run mode', async () => {
      await storeHandler({
        ...baseInput,
        options: { dry_run: true },
      });

      expect(findUnlinkedMentions).not.toHaveBeenCalled();
    });
  });

  describe('atomic splitting', () => {
    it('calls splitContent and createHub when content exceeds limits', async () => {
      (shouldSplit as ReturnType<typeof vi.fn>).mockReturnValue({
        shouldSplit: true,
        reason: 'too many lines (250)',
        metrics: { lineCount: 250, sectionCount: 4 },
      });

      (splitContent as ReturnType<typeof vi.fn>).mockReturnValue({
        hub: {
          content: '# Docker Networking\n\nOverview\n\n## Knowledge Map\n- [[Docker Networking - Architecture]]',
          relativePath: 'infrastructure/docker/Docker Networking.md',
        },
        children: [
          {
            title: 'Architecture',
            content: 'Architecture content',
            relativePath: 'infrastructure/docker/Docker Networking - Architecture.md',
            fromSection: 'Architecture',
          },
        ],
        strategy: 'by_sections',
      });
      (createHub as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        path: 'infrastructure/docker/Docker Networking.md',
      });
      (createChildNote as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        path: 'infrastructure/docker/Docker Networking - Architecture.md',
      });

      const result = await storeHandler({
        ...baseInput,
        content: 'A'.repeat(5000),
      });

      expect(splitContent).toHaveBeenCalled();
      expect(createHub).toHaveBeenCalled();
      // The split path returns a result (may differ from single-note path)
      expect(result.success).toBe(true);
    });
  });

  describe('operation tracking', () => {
    it('starts operation and tracks file creation', async () => {
      await storeHandler(baseInput);

      expect(startOperation).toHaveBeenCalledWith('store', 'test', {
        title: 'Docker Networking',
        intent: 'knowledge',
        domain: ['infrastructure', 'docker'],
      });
      expect(trackFileCreated).toHaveBeenCalledWith(
        'op_test123',
        'infrastructure/docker/Docker Networking.md'
      );
    });

    it('tracks file modification on stub expansion', async () => {
      (findStubByTitle as ReturnType<typeof vi.fn>).mockReturnValue({
        path: 'infrastructure/docker/Docker Networking.md',
        title: 'Docker Networking',
      });

      await storeHandler(baseInput);

      expect(trackFileModified).toHaveBeenCalledWith(
        'op_test123',
        'infrastructure/docker/Docker Networking.md'
      );
    });

    it('returns operation_id in response', async () => {
      const result = await storeHandler(baseInput);
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.operation_id).toBe('op_test123');
    });
  });

  describe('file I/O', () => {
    it('creates directory and writes file', async () => {
      await storeHandler(baseInput);

      expect(mkdir).toHaveBeenCalledWith(
        '/tmp/vault/infrastructure/docker',
        { recursive: true }
      );
      expect(writeFile).toHaveBeenCalledWith(
        '/tmp/vault/infrastructure/docker/Docker Networking.md',
        expect.any(String),
        'utf-8'
      );
    });

    it('indexes the new note after creation', async () => {
      const mockNote = {
        path: 'infrastructure/docker/Docker Networking.md',
        title: 'Docker Networking',
        content: 'test',
        frontmatter: {},
        raw: 'test',
      };
      (readNote as ReturnType<typeof vi.fn>).mockResolvedValue(mockNote);

      await storeHandler(baseInput);

      expect(indexNote).toHaveBeenCalledWith(mockDb, mockNote);
    });
  });

  describe('source capture metadata', () => {
    it('includes source metadata for source capture type', async () => {
      await storeHandler({
        title: 'API Docs',
        content: 'API documentation content.',
        intent: {
          capture_type: 'source',
          domain: ['api'],
          source: {
            type: 'documentation',
            title: 'REST API Guide',
            author: 'Author',
            url: 'https://example.com/api',
          },
        },
      });

      expect(writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('source_type'),
        'utf-8'
      );
    });
  });
});
