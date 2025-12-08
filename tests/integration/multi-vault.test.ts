/**
 * Multi-vault integration tests
 * Tests tool operations across multiple configured vaults
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  resolveVaultParam,
  enforceWriteAccess,
  parseCrossVaultPath,
  resolvePathWithVault,
  formatCrossVaultPath,
} from '../../src/utils/vault-param';
import * as registry from '../../src/services/vault/registry';
import type { ResolvedVault } from '../../src/types/index';

// Mock the registry
vi.mock('../../src/services/vault/registry', () => ({
  getVaultRegistry: vi.fn(),
}));

describe('Multi-Vault Integration', () => {
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

  const workVault: ResolvedVault = {
    path: '/path/to/work',
    alias: 'work',
    mode: 'rw',
    isDefault: true,
    indexPath: '/path/to/work/.palace/index.sqlite',
    config: defaultVaultConfig,
  };

  const personalVault: ResolvedVault = {
    path: '/path/to/personal',
    alias: 'personal',
    mode: 'rw',
    isDefault: false,
    indexPath: '/path/to/personal/.palace/index.sqlite',
    config: { ...defaultVaultConfig, vault: { name: 'personal' } },
  };

  const docsVault: ResolvedVault = {
    path: '/path/to/docs',
    alias: 'docs',
    mode: 'ro',
    isDefault: false,
    description: 'Read-only documentation',
    indexPath: '/path/to/docs/.palace/index.sqlite',
    config: { ...defaultVaultConfig, vault: { name: 'docs' } },
  };

  const mockVaults = [workVault, personalVault, docsVault];

  const mockRegistry = {
    listVaults: vi.fn(() => mockVaults),
    getDefaultVault: vi.fn(() => workVault),
    getVault: vi.fn((alias: string) => mockVaults.find((v) => v.alias === alias)),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (registry.getVaultRegistry as ReturnType<typeof vi.fn>).mockReturnValue(mockRegistry);
  });

  describe('Vault Resolution', () => {
    it('resolves default vault when no parameter provided', () => {
      const vault = resolveVaultParam();
      expect(vault.alias).toBe('work');
      expect(vault.isDefault).toBe(true);
    });

    it('resolves vault by alias', () => {
      const vault = resolveVaultParam('personal');
      expect(vault.alias).toBe('personal');
      expect(vault.path).toBe('/path/to/personal');
    });

    it('resolves vault by path', () => {
      const vault = resolveVaultParam('/path/to/docs');
      expect(vault.alias).toBe('docs');
    });

    it('throws for unknown vault', () => {
      expect(() => resolveVaultParam('unknown')).toThrow('Vault not found: unknown');
    });
  });

  describe('Read-Only Enforcement', () => {
    it('allows write operations on rw vaults', () => {
      expect(() => enforceWriteAccess(workVault)).not.toThrow();
      expect(() => enforceWriteAccess(personalVault)).not.toThrow();
    });

    it('rejects write operations on ro vaults', () => {
      expect(() => enforceWriteAccess(docsVault)).toThrow("Vault 'docs' is read-only");
    });
  });

  describe('Cross-Vault Path Resolution', () => {
    it('parses cross-vault path format', () => {
      const result = parseCrossVaultPath('vault:personal/notes/todo.md');
      expect(result).toEqual({
        vaultAlias: 'personal',
        notePath: 'notes/todo.md',
      });
    });

    it('returns null for regular paths', () => {
      expect(parseCrossVaultPath('notes/todo.md')).toBeNull();
      expect(parseCrossVaultPath('/absolute/path.md')).toBeNull();
    });

    it('resolves cross-vault path to vault and note path', () => {
      const result = resolvePathWithVault('vault:docs/reference/api.md');
      expect(result.vault.alias).toBe('docs');
      expect(result.notePath).toBe('reference/api.md');
    });

    it('uses explicit vault parameter for regular paths', () => {
      const result = resolvePathWithVault('notes/project.md', 'personal');
      expect(result.vault.alias).toBe('personal');
      expect(result.notePath).toBe('notes/project.md');
    });

    it('uses default vault for paths without vault context', () => {
      const result = resolvePathWithVault('research/topic.md');
      expect(result.vault.alias).toBe('work');
      expect(result.notePath).toBe('research/topic.md');
    });

    it('formats cross-vault path correctly', () => {
      const path = formatCrossVaultPath('personal', 'daily/2025-12-07.md');
      expect(path).toBe('vault:personal/daily/2025-12-07.md');
    });
  });

  describe('Vault Selection Priority', () => {
    it('cross-vault path takes precedence over explicit vault param', () => {
      // If path contains vault: prefix, that vault is used regardless of explicit param
      const result = resolvePathWithVault('vault:docs/readme.md', 'personal');
      expect(result.vault.alias).toBe('docs');
    });

    it('explicit vault param used for regular paths', () => {
      const result = resolvePathWithVault('notes/test.md', 'docs');
      expect(result.vault.alias).toBe('docs');
    });
  });
});
