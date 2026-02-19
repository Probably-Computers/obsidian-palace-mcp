/**
 * Tests for palace_structure tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/services/vault/index.js', () => ({
  getDirectoryTree: vi.fn(),
}));

vi.mock('../../../src/utils/vault-param.js', () => ({
  resolveVaultParam: vi.fn(),
  getVaultResultInfo: vi.fn(),
}));

import { structureHandler } from '../../../src/tools/structure.js';
import { getDirectoryTree } from '../../../src/services/vault/index.js';
import { resolveVaultParam, getVaultResultInfo } from '../../../src/utils/vault-param.js';

const mockVault = {
  alias: 'test',
  path: '/tmp/vault',
  mode: 'rw' as const,
  config: {
    ignore: { patterns: [], marker_file: '.palace-ignore', frontmatter_key: 'palace_ignore' },
  },
  indexPath: '/tmp/vault/.palace/index.sqlite',
};

describe('palace_structure tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (resolveVaultParam as ReturnType<typeof vi.fn>).mockReturnValue(mockVault);
    (getVaultResultInfo as ReturnType<typeof vi.fn>).mockReturnValue({
      vault: 'test',
      vault_path: '/tmp/vault',
      vault_mode: 'rw',
    });
  });

  it('returns validation error for invalid depth', async () => {
    const result = await structureHandler({ depth: 0 });
    expect(result.success).toBe(false);
    expect(result.code).toBe('VALIDATION_ERROR');
  });

  it('returns vault structure with defaults', async () => {
    (getDirectoryTree as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        name: 'research',
        type: 'directory',
        children: [
          { name: 'kubernetes.md', type: 'file' },
          { name: 'docker.md', type: 'file' },
        ],
      },
      { name: 'daily', type: 'directory', children: [] },
    ]);

    const result = await structureHandler({});
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.stats.files).toBe(2);
    expect(result.data.stats.directories).toBe(2);
    expect(result.data.tree).toContain('research');
    expect(result.data.entries).toHaveLength(2);
  });

  it('extracts domain patterns from tree', async () => {
    (getDirectoryTree as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        name: 'infrastructure',
        type: 'directory',
        children: [
          { name: 'kubernetes.md', type: 'file' },
          {
            name: 'networking',
            type: 'directory',
            children: [{ name: 'dns.md', type: 'file' }],
          },
        ],
      },
    ]);

    const result = await structureHandler({});
    expect(result.success).toBe(true);
    if (!result.success) return;

    const patterns = result.data.domain_patterns;
    expect(patterns.top_level_domains).toHaveLength(1);
    expect(patterns.top_level_domains[0].name).toBe('infrastructure');
    expect(patterns.top_level_domains[0].totalNotes).toBe(2);
    expect(patterns.all_domains).toHaveLength(2);
  });

  it('identifies special folders', async () => {
    (getDirectoryTree as ReturnType<typeof vi.fn>).mockResolvedValue([
      { name: 'projects', type: 'directory', children: [] },
      { name: 'daily', type: 'directory', children: [] },
      { name: 'standards', type: 'directory', children: [] },
      { name: 'research', type: 'directory', children: [] },
    ]);

    const result = await structureHandler({});
    expect(result.success).toBe(true);
    if (!result.success) return;

    const special = result.data.domain_patterns.special_folders;
    expect(special.projects).toBe(true);
    expect(special.daily).toBe(true);
    expect(special.standards).toBe(true);
    expect(special.sources).toBe(false);
  });

  it('respects custom depth and path', async () => {
    (getDirectoryTree as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await structureHandler({ depth: 5, path: 'research' });

    expect(getDirectoryTree).toHaveBeenCalledWith('research', 5, {
      vaultPath: '/tmp/vault',
      ignoreConfig: mockVault.config.ignore,
    });
  });

  it('handles errors gracefully', async () => {
    (getDirectoryTree as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('ENOENT'));

    const result = await structureHandler({});
    expect(result.success).toBe(false);
    expect(result.code).toBe('STRUCTURE_ERROR');
    expect(result.error).toContain('ENOENT');
  });
});
