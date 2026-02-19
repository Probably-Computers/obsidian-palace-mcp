/**
 * Tests for palace_recall tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/services/index/index.js', () => ({
  searchAllVaults: vi.fn(),
  searchNotesInVault: vi.fn(),
  getIndexManager: vi.fn(),
}));

vi.mock('../../../src/services/vault/index.js', () => ({
  readNote: vi.fn(),
}));

vi.mock('../../../src/utils/vault-param.js', () => ({
  resolveVaultParam: vi.fn(),
}));

vi.mock('../../../src/services/vault/registry.js', () => ({
  getVaultRegistry: vi.fn(),
}));

import { recallHandler } from '../../../src/tools/recall.js';
import { searchAllVaults, searchNotesInVault, getIndexManager } from '../../../src/services/index/index.js';
import { readNote } from '../../../src/services/vault/index.js';
import { resolveVaultParam } from '../../../src/utils/vault-param.js';
import { getVaultRegistry } from '../../../src/services/vault/registry.js';

const mockVault = {
  alias: 'test',
  path: '/tmp/vault',
  mode: 'rw' as const,
};

const mockDb = {};

describe('palace_recall tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (resolveVaultParam as ReturnType<typeof vi.fn>).mockReturnValue(mockVault);
    (getIndexManager as ReturnType<typeof vi.fn>).mockReturnValue({
      getIndex: vi.fn().mockResolvedValue(mockDb),
    });
    (getVaultRegistry as ReturnType<typeof vi.fn>).mockReturnValue({
      getVault: vi.fn().mockReturnValue(mockVault),
      isCrossVaultSearchEnabled: vi.fn().mockReturnValue(false),
    });
  });

  it('returns validation error when query is missing', async () => {
    const result = await recallHandler({});
    expect(result.success).toBe(false);
    expect(result.code).toBe('VALIDATION_ERROR');
  });

  it('returns validation error for empty query', async () => {
    const result = await recallHandler({ query: '' });
    expect(result.success).toBe(false);
    expect(result.code).toBe('VALIDATION_ERROR');
  });

  it('searches single vault when vault param is provided', async () => {
    const mockResults = [
      {
        note: {
          path: 'research/kubernetes.md',
          title: 'Kubernetes',
          frontmatter: { type: 'research', confidence: 0.9, verified: true, tags: ['k8s'] },
        },
        score: 1.5,
      },
    ];
    (searchNotesInVault as ReturnType<typeof vi.fn>).mockReturnValue(mockResults);
    (readNote as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: 'Kubernetes is a container orchestrator',
    });

    const result = await recallHandler({ query: 'kubernetes', vault: 'test' });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.query).toBe('kubernetes');
    expect(result.data.search_mode).toBe('single');
    expect(result.data.count).toBe(1);
    expect(result.data.results[0].title).toBe('Kubernetes');
    expect(result.data.results[0].score).toBe(1.5);
  });

  it('searches all vaults when no vault param', async () => {
    (searchAllVaults as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        vault: 'work',
        vaultPath: 'docs/api.md',
        prefixedPath: 'vault:work/docs/api.md',
        note: {
          path: 'docs/api.md',
          title: 'API Docs',
          frontmatter: { type: 'research', tags: [] },
        },
        score: 2.0,
      },
    ]);
    (readNote as ReturnType<typeof vi.fn>).mockResolvedValue({ content: 'API documentation' });

    const result = await recallHandler({ query: 'API', include_content: true });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(searchAllVaults).toHaveBeenCalled();
    expect(result.data.count).toBe(1);
  });

  it('excludes content when include_content is false', async () => {
    (searchAllVaults as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        vault: 'test',
        vaultPath: 'note.md',
        prefixedPath: 'vault:test/note.md',
        note: {
          path: 'note.md',
          title: 'Note',
          frontmatter: { type: 'research', tags: [] },
        },
        score: 1.0,
      },
    ]);

    const result = await recallHandler({ query: 'test', include_content: false });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(readNote).not.toHaveBeenCalled();
  });

  it('passes search options correctly', async () => {
    (searchAllVaults as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await recallHandler({
      query: 'docker',
      type: 'command',
      tags: ['devops'],
      path: 'commands',
      min_confidence: 0.5,
      limit: 5,
    });

    expect(searchAllVaults).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'docker',
        type: 'command',
        tags: ['devops'],
        path: 'commands',
        minConfidence: 0.5,
        limit: 5,
      })
    );
  });

  it('handles errors gracefully', async () => {
    (searchAllVaults as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Index corrupted'));

    const result = await recallHandler({ query: 'test' });
    expect(result.success).toBe(false);
    expect(result.code).toBe('SEARCH_ERROR');
  });
});
