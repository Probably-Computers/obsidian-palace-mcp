/**
 * Tests for palace_vaults tool
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { vaultsHandler } from '../../../src/tools/vaults';
import * as registry from '../../../src/services/vault/registry';
import * as query from '../../../src/services/index/query';

// Mock the registry and query
vi.mock('../../../src/services/vault/registry', () => ({
  getVaultRegistry: vi.fn(),
}));

vi.mock('../../../src/services/index/query', () => ({
  countNotes: vi.fn(() => 42),
}));

describe('palace_vaults tool', () => {
  const defaultVaultConfig = {
    vault: { name: 'work' },
    structure: {},
    ignore: {
      patterns: ['.obsidian/'],
      marker_file: '.palace-ignore',
      frontmatter_key: 'palace_ignore',
    },
    atomic: { max_lines: 200, max_sections: 6, auto_split: false },
    stubs: { auto_create: false, min_confidence: 0.2 },
    graph: { require_technology_links: false, warn_orphan_depth: 1, retroactive_linking: false },
  };

  const mockVaults = [
    {
      path: '/path/to/work',
      alias: 'work',
      mode: 'rw' as const,
      isDefault: true,
      description: undefined,
      indexPath: '/path/to/work/.palace/index.sqlite',
      config: defaultVaultConfig,
    },
    {
      path: '/path/to/personal',
      alias: 'personal',
      mode: 'rw' as const,
      isDefault: false,
      description: undefined,
      indexPath: '/path/to/personal/.palace/index.sqlite',
      config: defaultVaultConfig,
    },
    {
      path: '/path/to/docs',
      alias: 'docs',
      mode: 'ro' as const,
      isDefault: false,
      description: 'Read-only documentation',
      indexPath: '/path/to/docs/.palace/index.sqlite',
      config: {
        ...defaultVaultConfig,
        vault: { name: 'docs', description: 'Read-only documentation' },
      },
    },
  ];

  const mockGlobalConfig = {
    version: 1,
    vaults: [],
    cross_vault: {
      search: true,
      link_format: 'vault:alias/path',
      standards_source: 'work',
    },
    settings: {
      log_level: 'info' as const,
      watch_enabled: true,
      auto_index: true,
    },
  };

  const mockRegistry = {
    listVaults: vi.fn(() => mockVaults),
    getDefaultVault: vi.fn(() => mockVaults[0]),
    getVault: vi.fn((alias: string) => mockVaults.find((v) => v.alias === alias)),
    getGlobalConfig: vi.fn(() => mockGlobalConfig),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (registry.getVaultRegistry as ReturnType<typeof vi.fn>).mockReturnValue(mockRegistry);
  });

  it('lists all vaults with basic info', async () => {
    const result = await vaultsHandler({});

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.vaults).toHaveLength(3);
    expect(result.data.default_vault).toBe('work');

    const workVault = result.data.vaults.find((v: { alias: string }) => v.alias === 'work');
    expect(workVault).toBeDefined();
    expect(workVault.mode).toBe('rw');
    expect(workVault.is_default).toBe(true);

    const docsVault = result.data.vaults.find((v: { alias: string }) => v.alias === 'docs');
    expect(docsVault).toBeDefined();
    expect(docsVault.mode).toBe('ro');
  });

  it('includes cross-vault settings', async () => {
    const result = await vaultsHandler({});

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.cross_vault_search).toBe(true);
    expect(result.data.standards_source).toBe('work');
  });

  it('includes config details when requested', async () => {
    const result = await vaultsHandler({ include_config: true });

    expect(result.success).toBe(true);
    if (!result.success) return;

    const docsVault = result.data.vaults.find((v: { alias: string }) => v.alias === 'docs');
    expect(docsVault.description).toBe('Read-only documentation');
    expect(docsVault.config).toBeDefined();
    expect(docsVault.config.atomic.max_lines).toBe(200);
  });

  it('includes note counts when requested', async () => {
    const result = await vaultsHandler({ include_counts: true });

    expect(result.success).toBe(true);
    if (!result.success) return;

    const workVault = result.data.vaults.find((v: { alias: string }) => v.alias === 'work');
    expect(workVault.note_count).toBeDefined();
  });
});
