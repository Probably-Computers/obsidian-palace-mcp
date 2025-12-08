/**
 * Tests for vault-param utilities
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  resolveVaultParam,
  enforceWriteAccess,
  parseCrossVaultPath,
  resolvePathWithVault,
  formatCrossVaultPath,
  getVaultResultInfo,
} from '../../../src/utils/vault-param';
import * as registry from '../../../src/services/vault/registry';

// Mock the registry
vi.mock('../../../src/services/vault/registry', () => ({
  getVaultRegistry: vi.fn(),
}));

describe('vault-param utilities', () => {
  const defaultVault = {
    path: '/path/to/work',
    alias: 'work',
    mode: 'rw' as const,
    default: true,
    config: {
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
    },
  };

  const readOnlyVault = {
    path: '/path/to/docs',
    alias: 'docs',
    mode: 'ro' as const,
    default: false,
    config: {
      vault: { name: 'docs' },
      structure: {},
      ignore: {
        patterns: ['.obsidian/'],
        marker_file: '.palace-ignore',
        frontmatter_key: 'palace_ignore',
      },
      atomic: { max_lines: 200, max_sections: 6, auto_split: false },
      stubs: { auto_create: false, min_confidence: 0.2 },
      graph: { require_technology_links: false, warn_orphan_depth: 1, retroactive_linking: false },
    },
  };

  const mockRegistry = {
    listVaults: vi.fn(() => [defaultVault, readOnlyVault]),
    getDefaultVault: vi.fn(() => defaultVault),
    getVault: vi.fn((alias: string) => {
      if (alias === 'work') return defaultVault;
      if (alias === 'docs') return readOnlyVault;
      return undefined;
    }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (registry.getVaultRegistry as ReturnType<typeof vi.fn>).mockReturnValue(mockRegistry);
  });

  describe('resolveVaultParam', () => {
    it('returns default vault when no parameter provided', () => {
      const result = resolveVaultParam();
      expect(result).toBe(defaultVault);
    });

    it('returns default vault when undefined provided', () => {
      const result = resolveVaultParam(undefined);
      expect(result).toBe(defaultVault);
    });

    it('resolves by alias', () => {
      const result = resolveVaultParam('docs');
      expect(result).toBe(readOnlyVault);
    });

    it('resolves by path', () => {
      const result = resolveVaultParam('/path/to/work');
      expect(result).toBe(defaultVault);
    });

    it('throws for unknown vault', () => {
      expect(() => resolveVaultParam('unknown')).toThrow('Vault not found: unknown');
    });
  });

  describe('enforceWriteAccess', () => {
    it('allows write on rw vaults', () => {
      expect(() => enforceWriteAccess(defaultVault)).not.toThrow();
    });

    it('throws on ro vaults', () => {
      expect(() => enforceWriteAccess(readOnlyVault)).toThrow("Vault 'docs' is read-only");
    });
  });

  describe('parseCrossVaultPath', () => {
    it('parses cross-vault format', () => {
      const result = parseCrossVaultPath('vault:work/path/to/note.md');
      expect(result).toEqual({
        vaultAlias: 'work',
        notePath: 'path/to/note.md',
      });
    });

    it('returns null for non-cross-vault paths', () => {
      expect(parseCrossVaultPath('path/to/note.md')).toBeNull();
      expect(parseCrossVaultPath('work/path/to/note.md')).toBeNull();
    });
  });

  describe('resolvePathWithVault', () => {
    it('uses cross-vault format when present', () => {
      const result = resolvePathWithVault('vault:docs/path/to/note.md');
      expect(result.vault).toBe(readOnlyVault);
      expect(result.notePath).toBe('path/to/note.md');
    });

    it('uses explicit vault parameter', () => {
      const result = resolvePathWithVault('path/to/note.md', 'docs');
      expect(result.vault).toBe(readOnlyVault);
      expect(result.notePath).toBe('path/to/note.md');
    });

    it('uses default vault when no vault specified', () => {
      const result = resolvePathWithVault('path/to/note.md');
      expect(result.vault).toBe(defaultVault);
      expect(result.notePath).toBe('path/to/note.md');
    });
  });

  describe('formatCrossVaultPath', () => {
    it('formats path with vault prefix', () => {
      const result = formatCrossVaultPath('work', 'path/to/note.md');
      expect(result).toBe('vault:work/path/to/note.md');
    });
  });

  describe('getVaultResultInfo', () => {
    it('returns vault info for results', () => {
      const result = getVaultResultInfo(defaultVault);
      expect(result).toEqual({
        vault: 'work',
        vault_path: '/path/to/work',
        vault_mode: 'rw',
      });
    });
  });
});
