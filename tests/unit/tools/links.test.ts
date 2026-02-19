/**
 * Tests for palace_links tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/services/graph/index.js', () => ({
  getOutgoingLinks: vi.fn(),
  getIncomingLinks: vi.fn(),
  traverseGraph: vi.fn(),
  getNoteMetadataByPath: vi.fn(),
}));

vi.mock('../../../src/services/index/index.js', () => ({
  getIndexManager: vi.fn(),
}));

vi.mock('../../../src/utils/vault-param.js', () => ({
  resolveVaultParam: vi.fn(),
  getVaultResultInfo: vi.fn(),
}));

import { linksHandler } from '../../../src/tools/links.js';
import {
  getOutgoingLinks,
  getIncomingLinks,
  traverseGraph,
  getNoteMetadataByPath,
} from '../../../src/services/graph/index.js';
import { getIndexManager } from '../../../src/services/index/index.js';
import { resolveVaultParam, getVaultResultInfo } from '../../../src/utils/vault-param.js';

const mockVault = {
  alias: 'test',
  path: '/tmp/vault',
  mode: 'rw' as const,
  config: { ignore: { patterns: [] } },
  indexPath: '/tmp/vault/.palace/index.sqlite',
};

const mockDb = {};

describe('palace_links tool', () => {
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
    (getNoteMetadataByPath as ReturnType<typeof vi.fn>).mockReturnValue({
      path: 'research/kubernetes.md',
      title: 'Kubernetes',
    });
    (getIncomingLinks as ReturnType<typeof vi.fn>).mockReturnValue([
      { path: 'research/docker.md', title: 'Docker' },
    ]);
    (getOutgoingLinks as ReturnType<typeof vi.fn>).mockReturnValue([
      { path: 'research/pods.md', title: 'Pods' },
    ]);
  });

  it('returns validation error when path is missing', async () => {
    const result = await linksHandler({});
    expect(result.success).toBe(false);
    expect(result.code).toBe('VALIDATION_ERROR');
  });

  it('returns NOT_FOUND when note does not exist', async () => {
    (getNoteMetadataByPath as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const result = await linksHandler({ path: 'nonexistent.md' });
    expect(result.success).toBe(false);
    expect(result.code).toBe('NOT_FOUND');
  });

  it('returns both incoming and outgoing links at depth 1', async () => {
    const result = await linksHandler({ path: 'research/kubernetes.md' });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.incoming).toHaveLength(1);
    expect(result.data.outgoing).toHaveLength(1);
    expect(result.data.incomingCount).toBe(1);
    expect(result.data.outgoingCount).toBe(1);
    expect(result.data.depth).toBe(1);
  });

  it('returns only incoming links when direction is incoming', async () => {
    const result = await linksHandler({ path: 'research/kubernetes.md', direction: 'incoming' });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.incoming).toHaveLength(1);
    expect(result.data.outgoing).toBeUndefined();
  });

  it('returns only outgoing links when direction is outgoing', async () => {
    const result = await linksHandler({ path: 'research/kubernetes.md', direction: 'outgoing' });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.outgoing).toHaveLength(1);
    expect(result.data.incoming).toBeUndefined();
  });

  it('uses traverseGraph for depth > 1', async () => {
    (traverseGraph as ReturnType<typeof vi.fn>).mockReturnValue([
      { path: 'a.md', title: 'A', depth: 1, direction: 'outgoing' },
      { path: 'b.md', title: 'B', depth: 2, direction: 'outgoing' },
    ]);

    const result = await linksHandler({ path: 'research/kubernetes.md', depth: 2 });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(traverseGraph).toHaveBeenCalledWith(mockDb, 'research/kubernetes.md', 'both', 2);
    expect(result.data.totalResults).toBe(2);
    expect(result.data.resultsByDepth).toBeDefined();
  });

  it('handles errors gracefully', async () => {
    (resolveVaultParam as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('Vault error');
    });

    const result = await linksHandler({ path: 'test.md' });
    expect(result.success).toBe(false);
    expect(result.code).toBe('LINKS_ERROR');
  });
});
