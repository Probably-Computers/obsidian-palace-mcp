/**
 * Integration tests for palace_recall tool
 *
 * Tests vault filtering (vaults/exclude_vaults), cross-vault search
 * mode detection, type/tag/path/confidence filtering, and FTS scoring.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/services/index/index.js', () => ({
  searchAllVaults: vi.fn(),
  searchNotesInVault: vi.fn(),
  getIndexManager: vi.fn(),
}));

vi.mock('../../src/services/vault/index.js', () => ({
  readNote: vi.fn(),
}));

vi.mock('../../src/utils/vault-param.js', () => ({
  resolveVaultParam: vi.fn(),
}));

vi.mock('../../src/services/vault/registry.js', () => ({
  getVaultRegistry: vi.fn(),
}));

import { recallHandler } from '../../src/tools/recall.js';
import { searchAllVaults, searchNotesInVault, getIndexManager } from '../../src/services/index/index.js';
import { readNote } from '../../src/services/vault/index.js';
import { resolveVaultParam } from '../../src/utils/vault-param.js';
import { getVaultRegistry } from '../../src/services/vault/registry.js';

const mockVault = {
  alias: 'work',
  path: '/tmp/work',
  mode: 'rw' as const,
};

const mockDb = {};

describe('palace_recall Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (resolveVaultParam as ReturnType<typeof vi.fn>).mockReturnValue(mockVault);
    (getIndexManager as ReturnType<typeof vi.fn>).mockReturnValue({
      getIndex: vi.fn().mockResolvedValue(mockDb),
    });
    (getVaultRegistry as ReturnType<typeof vi.fn>).mockReturnValue({
      getVault: vi.fn().mockReturnValue(mockVault),
      isCrossVaultSearchEnabled: vi.fn().mockReturnValue(true),
    });
  });

  describe('vault filtering', () => {
    it('passes vaults filter to cross-vault search', async () => {
      (searchAllVaults as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await recallHandler({
        query: 'kubernetes',
        vaults: ['work', 'personal'],
      });

      expect(searchAllVaults).toHaveBeenCalledWith(
        expect.objectContaining({
          vaults: ['work', 'personal'],
        })
      );
    });

    it('passes exclude_vaults filter to cross-vault search', async () => {
      (searchAllVaults as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await recallHandler({
        query: 'kubernetes',
        exclude_vaults: ['personal'],
      });

      expect(searchAllVaults).toHaveBeenCalledWith(
        expect.objectContaining({
          excludeVaults: ['personal'],
        })
      );
    });
  });

  describe('search mode detection', () => {
    it('uses single vault search when vault param is provided', async () => {
      (searchNotesInVault as ReturnType<typeof vi.fn>).mockReturnValue([]);

      const result = await recallHandler({ query: 'docker', vault: 'work' });
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(searchNotesInVault).toHaveBeenCalledWith(
        mockDb,
        expect.objectContaining({ query: 'docker' })
      );
      expect(result.data.search_mode).toBe('single');
    });

    it('uses cross-vault search when no vault param', async () => {
      (searchAllVaults as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await recallHandler({ query: 'docker' });
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(searchAllVaults).toHaveBeenCalled();
      expect(searchNotesInVault).not.toHaveBeenCalled();
    });
  });

  describe('filter options', () => {
    it('passes type filter correctly', async () => {
      (searchAllVaults as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await recallHandler({ query: 'docker', type: 'command' });

      expect(searchAllVaults).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'command' })
      );
    });

    it('passes tags filter correctly', async () => {
      (searchAllVaults as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await recallHandler({ query: 'docker', tags: ['devops', 'containers'] });

      expect(searchAllVaults).toHaveBeenCalledWith(
        expect.objectContaining({ tags: ['devops', 'containers'] })
      );
    });

    it('passes path prefix filter correctly', async () => {
      (searchAllVaults as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await recallHandler({ query: 'docker', path: 'infrastructure' });

      expect(searchAllVaults).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'infrastructure' })
      );
    });

    it('passes min_confidence filter correctly', async () => {
      (searchAllVaults as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await recallHandler({ query: 'docker', min_confidence: 0.8 });

      expect(searchAllVaults).toHaveBeenCalledWith(
        expect.objectContaining({ minConfidence: 0.8 })
      );
    });

    it('respects limit parameter', async () => {
      (searchAllVaults as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await recallHandler({ query: 'docker', limit: 3 });

      expect(searchAllVaults).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 3 })
      );
    });
  });

  describe('FTS scoring', () => {
    it('preserves FTS scores from single vault search', async () => {
      (searchNotesInVault as ReturnType<typeof vi.fn>).mockReturnValue([
        {
          note: {
            path: 'commands/docker-build.md',
            title: 'Docker Build',
            frontmatter: { type: 'command', confidence: 0.9, verified: true, tags: ['docker'] },
          },
          score: 3.5,
        },
        {
          note: {
            path: 'research/docker.md',
            title: 'Docker Overview',
            frontmatter: { type: 'research', confidence: 0.7, verified: false, tags: ['docker'] },
          },
          score: 1.2,
        },
      ]);
      (readNote as ReturnType<typeof vi.fn>).mockResolvedValue({
        content: 'Docker content',
      });

      const result = await recallHandler({ query: 'docker build', vault: 'work' });
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.results[0].score).toBe(3.5);
      expect(result.data.results[1].score).toBe(1.2);
    });

    it('preserves FTS scores from cross-vault search', async () => {
      (searchAllVaults as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          vault: 'work',
          vaultPath: '/tmp/work',
          prefixedPath: 'vault:work/docs/api.md',
          note: {
            path: 'docs/api.md',
            title: 'API Docs',
            frontmatter: { type: 'research', tags: [] },
          },
          score: 5.0,
        },
      ]);
      (readNote as ReturnType<typeof vi.fn>).mockResolvedValue({
        content: 'API documentation',
      });

      const result = await recallHandler({ query: 'API' });
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.results[0].score).toBe(5.0);
    });
  });

  describe('content loading', () => {
    it('loads content for single vault results', async () => {
      (searchNotesInVault as ReturnType<typeof vi.fn>).mockReturnValue([
        {
          note: {
            path: 'research/kubernetes.md',
            title: 'Kubernetes',
            frontmatter: { type: 'research', tags: ['k8s'] },
          },
          score: 2.0,
        },
      ]);
      (readNote as ReturnType<typeof vi.fn>).mockResolvedValue({
        content: 'Kubernetes orchestration content',
      });

      const result = await recallHandler({ query: 'kubernetes', vault: 'work' });
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(readNote).toHaveBeenCalledWith('research/kubernetes.md', expect.objectContaining({
        vaultPath: '/tmp/work',
      }));
      expect(result.data.results[0].content).toBe('Kubernetes orchestration content');
    });

    it('loads content from correct vault for cross-vault results', async () => {
      (searchAllVaults as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          vault: 'work',
          vaultPath: 'note.md',
          prefixedPath: 'vault:work/note.md',
          note: {
            path: 'note.md',
            title: 'Note',
            frontmatter: { type: 'research', tags: [] },
          },
          score: 1.0,
        },
      ]);
      (readNote as ReturnType<typeof vi.fn>).mockResolvedValue({
        content: 'Note content from work vault',
      });

      const result = await recallHandler({ query: 'test', include_content: true });
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(readNote).toHaveBeenCalledWith('note.md', expect.objectContaining({
        vaultPath: '/tmp/work',
      }));
    });

    it('skips content loading when include_content is false', async () => {
      (searchNotesInVault as ReturnType<typeof vi.fn>).mockReturnValue([
        {
          note: {
            path: 'note.md',
            title: 'Note',
            frontmatter: { type: 'research', tags: [] },
          },
          score: 1.0,
        },
      ]);

      const result = await recallHandler({
        query: 'test',
        vault: 'work',
        include_content: false,
      });
      expect(result.success).toBe(true);

      expect(readNote).not.toHaveBeenCalled();
    });
  });

  describe('result metadata', () => {
    it('includes vault attribution for single vault results', async () => {
      (searchNotesInVault as ReturnType<typeof vi.fn>).mockReturnValue([
        {
          note: {
            path: 'note.md',
            title: 'Test Note',
            frontmatter: { type: 'research', confidence: 0.8, verified: false, tags: ['test'] },
          },
          score: 1.5,
        },
      ]);
      (readNote as ReturnType<typeof vi.fn>).mockResolvedValue({
        content: 'Test content',
      });

      const result = await recallHandler({ query: 'test', vault: 'work' });
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.results[0].vault).toBe('work');
      expect(result.data.results[0].type).toBe('research');
      expect(result.data.results[0].confidence).toBe(0.8);
      expect(result.data.results[0].tags).toEqual(['test']);
    });

    it('returns correct count', async () => {
      (searchAllVaults as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          vault: 'work',
          vaultPath: '/tmp/work',
          prefixedPath: 'vault:work/a.md',
          note: { path: 'a.md', title: 'A', frontmatter: { type: 'research', tags: [] } },
          score: 2.0,
        },
        {
          vault: 'work',
          vaultPath: '/tmp/work',
          prefixedPath: 'vault:work/b.md',
          note: { path: 'b.md', title: 'B', frontmatter: { type: 'research', tags: [] } },
          score: 1.0,
        },
      ]);

      const result = await recallHandler({ query: 'test', include_content: false });
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.count).toBe(2);
      expect(result.data.query).toBe('test');
    });
  });
});
