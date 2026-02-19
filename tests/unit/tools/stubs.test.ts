/**
 * Tests for palace_stubs tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/services/vault/stub-manager.js', () => ({
  findStubs: vi.fn(),
}));

vi.mock('../../../src/services/index/index.js', () => ({
  getIndexManager: vi.fn(),
}));

vi.mock('../../../src/utils/vault-param.js', () => ({
  resolveVaultParam: vi.fn(),
  getVaultResultInfo: vi.fn(),
}));

import { stubsHandler } from '../../../src/tools/stubs.js';
import { findStubs } from '../../../src/services/vault/stub-manager.js';
import { getIndexManager } from '../../../src/services/index/index.js';
import { resolveVaultParam, getVaultResultInfo } from '../../../src/utils/vault-param.js';

const mockVault = {
  alias: 'test',
  path: '/tmp/vault',
  mode: 'rw' as const,
};

const mockDb = {};

describe('palace_stubs tool', () => {
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

  it('returns stubs sorted by created date (default)', async () => {
    (findStubs as ReturnType<typeof vi.fn>).mockReturnValue([
      {
        path: 'infrastructure/containerd.md',
        title: 'containerd',
        frontmatter: {
          type: 'stub',
          created: '2025-01-01T00:00:00Z',
          mentioned_in: ['research/kubernetes.md', 'research/docker.md'],
        },
      },
      {
        path: 'infrastructure/cri-o.md',
        title: 'CRI-O',
        frontmatter: {
          type: 'stub',
          created: '2025-02-01T00:00:00Z',
          mentioned_in: ['research/kubernetes.md'],
        },
      },
    ]);

    const result = await stubsHandler({});
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.stub_count).toBe(2);
    // Default sort is created (newest first)
    expect(result.data.stubs[0].title).toBe('CRI-O');
    expect(result.data.stubs[1].title).toBe('containerd');
  });

  it('sorts stubs by mention count', async () => {
    (findStubs as ReturnType<typeof vi.fn>).mockReturnValue([
      {
        path: 'a.md',
        title: 'A',
        frontmatter: { type: 'stub', created: '2025-01-01T00:00:00Z', mentioned_in: ['x.md'] },
      },
      {
        path: 'b.md',
        title: 'B',
        frontmatter: { type: 'stub', created: '2025-01-01T00:00:00Z', mentioned_in: ['x.md', 'y.md', 'z.md'] },
      },
    ]);

    const result = await stubsHandler({ sort_by: 'mentions' });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.stubs[0].title).toBe('B');
    expect(result.data.stubs[0].mention_count).toBe(3);
  });

  it('sorts stubs alphabetically by title', async () => {
    (findStubs as ReturnType<typeof vi.fn>).mockReturnValue([
      {
        path: 'z.md',
        title: 'Zebra',
        frontmatter: { type: 'stub', created: '2025-01-01T00:00:00Z', mentioned_in: [] },
      },
      {
        path: 'a.md',
        title: 'Alpha',
        frontmatter: { type: 'stub', created: '2025-01-01T00:00:00Z', mentioned_in: [] },
      },
    ]);

    const result = await stubsHandler({ sort_by: 'title' });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.stubs[0].title).toBe('Alpha');
    expect(result.data.stubs[1].title).toBe('Zebra');
  });

  it('filters stubs by path', async () => {
    (findStubs as ReturnType<typeof vi.fn>).mockReturnValue([
      {
        path: 'infrastructure/containerd.md',
        title: 'containerd',
        frontmatter: { type: 'stub', created: '2025-01-01T00:00:00Z', mentioned_in: [] },
      },
      {
        path: 'research/topic.md',
        title: 'Topic',
        frontmatter: { type: 'stub', created: '2025-01-01T00:00:00Z', mentioned_in: [] },
      },
    ]);

    const result = await stubsHandler({ path_filter: 'infrastructure' });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.stub_count).toBe(1);
    expect(result.data.stubs[0].title).toBe('containerd');
  });

  it('respects limit parameter', async () => {
    const manyStubs = Array.from({ length: 10 }, (_, i) => ({
      path: `stub-${i}.md`,
      title: `Stub ${i}`,
      frontmatter: { type: 'stub', created: '2025-01-01T00:00:00Z', mentioned_in: [] },
    }));
    (findStubs as ReturnType<typeof vi.fn>).mockReturnValue(manyStubs);

    const result = await stubsHandler({ limit: 3 });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.stub_count).toBe(3);
    expect(result.data.summary.total_stubs).toBe(10);
  });

  it('builds summary with domains, oldest, and most mentioned', async () => {
    (findStubs as ReturnType<typeof vi.fn>).mockReturnValue([
      {
        path: 'infrastructure/containerd.md',
        title: 'containerd',
        frontmatter: {
          type: 'stub',
          created: '2025-01-01T00:00:00Z',
          mentioned_in: ['a.md', 'b.md'],
        },
      },
      {
        path: 'research/topic.md',
        title: 'Topic',
        frontmatter: {
          type: 'stub',
          created: '2025-06-01T00:00:00Z',
          mentioned_in: [],
        },
      },
    ]);

    const result = await stubsHandler({});
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.summary.total_stubs).toBe(2);
    expect(result.data.summary.oldest_stub).toBe('infrastructure/containerd.md');
    expect(result.data.summary.most_mentioned).toBe('infrastructure/containerd.md');
    expect(result.data.summary.domains_with_stubs).toEqual(['infrastructure', 'research']);
  });

  it('handles errors gracefully', async () => {
    (findStubs as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('DB error');
    });

    const result = await stubsHandler({});
    expect(result.success).toBe(false);
    expect(result.code).toBe('STUBS_ERROR');
  });
});
