/**
 * Integration tests for palace_query tool
 *
 * Tests vault filtering (vaults/exclude_vaults), date filters,
 * type-specific queries, and cross-vault vault attribution.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/services/index/index.js', () => ({
  queryAllVaults: vi.fn(),
  queryNotesInVault: vi.fn(),
  countNotesInVault: vi.fn(),
  countNotesAllVaults: vi.fn(),
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

import { queryHandler } from '../../src/tools/query.js';
import {
  queryAllVaults,
  queryNotesInVault,
  countNotesInVault,
  countNotesAllVaults,
  getIndexManager,
} from '../../src/services/index/index.js';
import { readNote } from '../../src/services/vault/index.js';
import { resolveVaultParam } from '../../src/utils/vault-param.js';
import { getVaultRegistry } from '../../src/services/vault/registry.js';

const mockVault = {
  alias: 'work',
  path: '/tmp/work',
  mode: 'rw' as const,
};

const mockPersonalVault = {
  alias: 'personal',
  path: '/tmp/personal',
  mode: 'rw' as const,
};

const mockDb = {};

describe('palace_query Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (resolveVaultParam as ReturnType<typeof vi.fn>).mockReturnValue(mockVault);
    (getIndexManager as ReturnType<typeof vi.fn>).mockReturnValue({
      getIndex: vi.fn().mockResolvedValue(mockDb),
    });
    (getVaultRegistry as ReturnType<typeof vi.fn>).mockReturnValue({
      getVault: vi.fn((alias: string) => {
        if (alias === 'work') return mockVault;
        if (alias === 'personal') return mockPersonalVault;
        return undefined;
      }),
    });
  });

  describe('vault filtering', () => {
    it('passes vaults filter to cross-vault query', async () => {
      (queryAllVaults as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (countNotesAllVaults as ReturnType<typeof vi.fn>).mockResolvedValue(0);

      await queryHandler({
        vaults: ['work', 'personal'],
      });

      expect(queryAllVaults).toHaveBeenCalledWith(
        expect.objectContaining({
          vaults: ['work', 'personal'],
        })
      );
    });

    it('passes exclude_vaults filter to cross-vault query', async () => {
      (queryAllVaults as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (countNotesAllVaults as ReturnType<typeof vi.fn>).mockResolvedValue(0);

      await queryHandler({
        exclude_vaults: ['personal'],
      });

      expect(queryAllVaults).toHaveBeenCalledWith(
        expect.objectContaining({
          excludeVaults: ['personal'],
        })
      );
    });
  });

  describe('date filters', () => {
    it('passes created_after and created_before correctly', async () => {
      (queryAllVaults as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (countNotesAllVaults as ReturnType<typeof vi.fn>).mockResolvedValue(0);

      await queryHandler({
        created_after: '2025-01-01',
        created_before: '2025-12-31',
      });

      expect(queryAllVaults).toHaveBeenCalledWith(
        expect.objectContaining({
          createdAfter: '2025-01-01',
          createdBefore: '2025-12-31',
        })
      );
    });

    it('passes modified_after and modified_before correctly', async () => {
      (queryAllVaults as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (countNotesAllVaults as ReturnType<typeof vi.fn>).mockResolvedValue(0);

      await queryHandler({
        modified_after: '2025-06-01',
        modified_before: '2025-06-30',
      });

      expect(queryAllVaults).toHaveBeenCalledWith(
        expect.objectContaining({
          modifiedAfter: '2025-06-01',
          modifiedBefore: '2025-06-30',
        })
      );
    });
  });

  describe('type-specific queries', () => {
    it('filters by type in single vault mode', async () => {
      (queryNotesInVault as ReturnType<typeof vi.fn>).mockReturnValue([]);
      (countNotesInVault as ReturnType<typeof vi.fn>).mockReturnValue(0);

      await queryHandler({ vault: 'work', type: 'command' });

      expect(queryNotesInVault).toHaveBeenCalledWith(
        mockDb,
        expect.objectContaining({ type: 'command' })
      );
    });

    it('excludes type filter when type is "all"', async () => {
      (queryAllVaults as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (countNotesAllVaults as ReturnType<typeof vi.fn>).mockResolvedValue(0);

      await queryHandler({ type: 'all' });

      // 'all' means no type filter should be applied
      const calledWith = (queryAllVaults as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(calledWith.type).toBeUndefined();
    });
  });

  describe('confidence range filters', () => {
    it('passes both min and max confidence', async () => {
      (queryAllVaults as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (countNotesAllVaults as ReturnType<typeof vi.fn>).mockResolvedValue(0);

      await queryHandler({
        min_confidence: 0.5,
        max_confidence: 0.9,
      });

      expect(queryAllVaults).toHaveBeenCalledWith(
        expect.objectContaining({
          minConfidence: 0.5,
          maxConfidence: 0.9,
        })
      );
    });
  });

  describe('project and client filters', () => {
    it('passes project filter', async () => {
      (queryAllVaults as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (countNotesAllVaults as ReturnType<typeof vi.fn>).mockResolvedValue(0);

      await queryHandler({ project: 'my-project' });

      expect(queryAllVaults).toHaveBeenCalledWith(
        expect.objectContaining({ project: 'my-project' })
      );
    });

    it('passes client filter', async () => {
      (queryAllVaults as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (countNotesAllVaults as ReturnType<typeof vi.fn>).mockResolvedValue(0);

      await queryHandler({ client: 'acme-corp' });

      expect(queryAllVaults).toHaveBeenCalledWith(
        expect.objectContaining({ client: 'acme-corp' })
      );
    });
  });

  describe('cross-vault vault attribution', () => {
    it('attributes each result to its source vault', async () => {
      (queryAllVaults as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          vault: 'work',
          vaultPath: '/tmp/work',
          prefixedPath: 'vault:work/docs/api.md',
          note: {
            path: 'docs/api.md',
            title: 'API',
            frontmatter: { type: 'research', tags: ['api'] },
          },
        },
        {
          vault: 'personal',
          vaultPath: '/tmp/personal',
          prefixedPath: 'vault:personal/notes/api.md',
          note: {
            path: 'notes/api.md',
            title: 'API Notes',
            frontmatter: { type: 'research', tags: ['api'] },
          },
        },
      ]);
      (countNotesAllVaults as ReturnType<typeof vi.fn>).mockResolvedValue(2);

      const result = await queryHandler({});
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.results[0].vault).toBe('work');
      expect(result.data.results[1].vault).toBe('personal');
    });
  });

  describe('content loading', () => {
    it('loads content from correct vault for cross-vault results', async () => {
      (queryAllVaults as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          vault: 'work',
          vaultPath: 'docs/api.md',
          prefixedPath: 'vault:work/docs/api.md',
          note: {
            path: 'docs/api.md',
            title: 'API',
            frontmatter: { type: 'research', tags: [] },
          },
        },
      ]);
      (countNotesAllVaults as ReturnType<typeof vi.fn>).mockResolvedValue(1);
      (readNote as ReturnType<typeof vi.fn>).mockResolvedValue({
        content: 'API documentation content',
      });

      const result = await queryHandler({ include_content: true });
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(readNote).toHaveBeenCalledWith('docs/api.md', expect.objectContaining({
        vaultPath: '/tmp/work',
      }));
      expect(result.data.results[0].content).toBe('API documentation content');
    });

    it('handles content load failure gracefully', async () => {
      (queryAllVaults as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          vault: 'work',
          vaultPath: 'docs/api.md',
          prefixedPath: 'vault:work/docs/api.md',
          note: {
            path: 'docs/api.md',
            title: 'API',
            frontmatter: { type: 'research', tags: [] },
          },
        },
      ]);
      (countNotesAllVaults as ReturnType<typeof vi.fn>).mockResolvedValue(1);
      (readNote as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await queryHandler({ include_content: true });
      expect(result.success).toBe(true);
      if (!result.success) return;

      // Content should be undefined when note can't be read
      expect(result.data.results[0].content).toBeUndefined();
    });
  });

  describe('pagination', () => {
    it('reports hasMore as false when all results returned', async () => {
      (queryAllVaults as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          vault: 'test',
          vaultPath: '/tmp/work',
          prefixedPath: 'vault:test/note.md',
          note: { path: 'note.md', title: 'Note', frontmatter: { type: 'research', tags: [] } },
        },
      ]);
      (countNotesAllVaults as ReturnType<typeof vi.fn>).mockResolvedValue(1);

      const result = await queryHandler({ limit: 20, offset: 0 });
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.hasMore).toBe(false);
    });

    it('reports correct total with offset', async () => {
      (queryAllVaults as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (countNotesAllVaults as ReturnType<typeof vi.fn>).mockResolvedValue(100);

      const result = await queryHandler({ limit: 20, offset: 80 });
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.total).toBe(100);
      expect(result.data.hasMore).toBe(true);
    });
  });
});
