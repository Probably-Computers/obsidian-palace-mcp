/**
 * Tests for palace_list tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/services/vault/index.js', () => ({
  listNotes: vi.fn(),
}));

vi.mock('../../../src/utils/vault-param.js', () => ({
  resolveVaultParam: vi.fn(),
  getVaultResultInfo: vi.fn(),
}));

import { listHandler } from '../../../src/tools/list.js';
import { listNotes } from '../../../src/services/vault/index.js';
import { resolveVaultParam, getVaultResultInfo } from '../../../src/utils/vault-param.js';

const mockVault = {
  alias: 'test',
  path: '/tmp/vault',
  mode: 'rw' as const,
  config: { ignore: { patterns: [] } },
  indexPath: '/tmp/vault/.palace/index.sqlite',
};

describe('palace_list tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (resolveVaultParam as ReturnType<typeof vi.fn>).mockReturnValue(mockVault);
    (getVaultResultInfo as ReturnType<typeof vi.fn>).mockReturnValue({
      vault: 'test',
      vault_path: '/tmp/vault',
      vault_mode: 'rw',
    });
    (listNotes as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        path: 'research/kubernetes.md',
        title: 'Kubernetes',
        frontmatter: { type: 'research', tags: ['k8s'], confidence: 0.9, verified: true, modified: '2025-01-01' },
      },
      {
        path: 'research/docker.md',
        title: 'Docker',
        frontmatter: { type: 'research', tags: ['containers'], confidence: 0.8, verified: false, modified: '2025-01-02' },
      },
    ]);
  });

  it('lists notes with basic info by default', async () => {
    const result = await listHandler({});
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.count).toBe(2);
    expect(result.data.notes[0].path).toBe('research/kubernetes.md');
    expect(result.data.notes[0].title).toBe('Kubernetes');
    expect(result.data.notes[0].type).toBeUndefined();
  });

  it('includes metadata when requested', async () => {
    const result = await listHandler({ include_metadata: true });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.notes[0].type).toBe('research');
    expect(result.data.notes[0].tags).toEqual(['k8s']);
    expect(result.data.notes[0].confidence).toBe(0.9);
  });

  it('passes path and recursive to listNotes', async () => {
    await listHandler({ path: 'research', recursive: true });
    expect(listNotes).toHaveBeenCalledWith('research', true, {
      vaultPath: '/tmp/vault',
      ignoreConfig: mockVault.config.ignore,
    });
  });

  it('resolves vault from parameter', async () => {
    await listHandler({ vault: 'work' });
    expect(resolveVaultParam).toHaveBeenCalledWith('work');
  });

  it('handles errors gracefully', async () => {
    (listNotes as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('List failed'));
    const result = await listHandler({});
    expect(result.success).toBe(false);
    expect(result.code).toBe('LIST_ERROR');
  });
});
