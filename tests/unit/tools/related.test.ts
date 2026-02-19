/**
 * Tests for palace_related tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/services/graph/index.js', () => ({
  findRelatedNotes: vi.fn(),
  getNoteMetadataByPath: vi.fn(),
}));

vi.mock('../../../src/services/index/index.js', () => ({
  getIndexManager: vi.fn(),
}));

vi.mock('../../../src/utils/vault-param.js', () => ({
  resolveVaultParam: vi.fn(),
  getVaultResultInfo: vi.fn(),
}));

import { relatedHandler } from '../../../src/tools/related.js';
import { findRelatedNotes, getNoteMetadataByPath } from '../../../src/services/graph/index.js';
import { getIndexManager } from '../../../src/services/index/index.js';
import { resolveVaultParam, getVaultResultInfo } from '../../../src/utils/vault-param.js';

const mockVault = {
  alias: 'test',
  path: '/tmp/vault',
  mode: 'rw' as const,
};

const mockDb = { prepare: vi.fn() };

describe('palace_related tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (resolveVaultParam as ReturnType<typeof vi.fn>).mockReturnValue(mockVault);
    (getVaultResultInfo as ReturnType<typeof vi.fn>).mockReturnValue({
      vault: 'test',
      vault_path: '/tmp/vault',
      vault_mode: 'rw',
    });
    (getIndexManager as ReturnType<typeof vi.fn>).mockReturnValue({
      getIndex: vi.fn().mockResolvedValue(mockDb),
    });
  });

  it('returns validation error when path is missing', async () => {
    const result = await relatedHandler({});
    expect(result.success).toBe(false);
    expect(result.code).toBe('VALIDATION_ERROR');
  });

  it('returns NOT_FOUND when note does not exist', async () => {
    (getNoteMetadataByPath as ReturnType<typeof vi.fn>).mockReturnValue(null);

    const result = await relatedHandler({ path: 'nonexistent.md' });
    expect(result.success).toBe(false);
    expect(result.code).toBe('NOT_FOUND');
  });

  it('finds related notes by both methods', async () => {
    (getNoteMetadataByPath as ReturnType<typeof vi.fn>).mockReturnValue({
      path: 'research/kubernetes.md',
      title: 'Kubernetes',
      frontmatter: { type: 'research' },
    });

    (findRelatedNotes as ReturnType<typeof vi.fn>).mockReturnValue([
      {
        note: {
          path: 'research/docker.md',
          title: 'Docker',
          frontmatter: { type: 'research' },
        },
        score: 0.85,
        sharedLinks: ['containerd'],
        sharedTags: ['infrastructure'],
      },
    ]);

    const result = await relatedHandler({ path: 'research/kubernetes.md' });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.method).toBe('both');
    expect(result.data.count).toBe(1);
    expect(result.data.related[0].title).toBe('Docker');
    expect(result.data.related[0].score).toBe(0.85);
    expect(result.data.related[0].sharedLinks).toEqual(['containerd']);
  });

  it('supports filtering by method', async () => {
    (getNoteMetadataByPath as ReturnType<typeof vi.fn>).mockReturnValue({
      path: 'test.md',
      title: 'Test',
      frontmatter: {},
    });
    (findRelatedNotes as ReturnType<typeof vi.fn>).mockReturnValue([]);

    await relatedHandler({ path: 'test.md', method: 'tags' });

    expect(findRelatedNotes).toHaveBeenCalledWith(mockDb, 'test.md', 'tags', 10);
  });

  it('supports custom limit', async () => {
    (getNoteMetadataByPath as ReturnType<typeof vi.fn>).mockReturnValue({
      path: 'test.md',
      title: 'Test',
      frontmatter: {},
    });
    (findRelatedNotes as ReturnType<typeof vi.fn>).mockReturnValue([]);

    await relatedHandler({ path: 'test.md', limit: 5 });

    expect(findRelatedNotes).toHaveBeenCalledWith(mockDb, 'test.md', 'both', 5);
  });

  it('handles errors gracefully', async () => {
    (getNoteMetadataByPath as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('DB connection failed');
    });

    const result = await relatedHandler({ path: 'test.md' });
    expect(result.success).toBe(false);
    expect(result.code).toBe('RELATED_ERROR');
  });
});
