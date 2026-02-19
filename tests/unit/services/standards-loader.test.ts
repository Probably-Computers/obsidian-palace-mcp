/**
 * Tests for standards loader service
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/services/vault/reader.js', () => ({
  readNote: vi.fn(),
  listNotes: vi.fn(),
}));

vi.mock('../../../src/services/vault/registry.js', () => ({
  getVaultRegistry: vi.fn(),
}));

vi.mock('../../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  loadStandards,
  loadRequiredStandards,
  hasRequiredStandards,
  getStandardByPath,
  clearStandardsCache,
} from '../../../src/services/standards/loader.js';
import { readNote, listNotes } from '../../../src/services/vault/reader.js';
import { getVaultRegistry } from '../../../src/services/vault/registry.js';

const mockVault = {
  alias: 'test',
  path: '/tmp/vault',
  mode: 'rw' as const,
  config: { ignore: { patterns: [] } },
  indexPath: '/tmp/vault/.palace/index.sqlite',
};

const mockRegistry = {
  getVault: vi.fn(() => mockVault),
  getDefaultVault: vi.fn(() => mockVault),
  getStandardsSourceVault: vi.fn(() => null),
  isCrossVaultSearchEnabled: vi.fn(() => false),
  listVaults: vi.fn(() => [mockVault]),
};

const standardNote = {
  path: 'standards/git-workflow.md',
  title: 'Git Workflow Standard',
  content: '## Overview\n\nGit commit standards.\n\n## Requirements\n\n- Must use conventional commits',
  raw: '---\ntype: standard\nai_binding: required\napplies_to: [all]\n---\n\n## Overview\n\nGit commit standards.',
  frontmatter: {
    type: 'standard',
    ai_binding: 'required',
    applies_to: ['all'],
    domain: ['git'],
    created: '2025-01-01',
    modified: '2025-01-01',
  },
};

describe('standards loader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearStandardsCache();
    (getVaultRegistry as ReturnType<typeof vi.fn>).mockReturnValue(mockRegistry);
    (listNotes as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        path: 'standards/git-workflow.md',
        title: 'Git Workflow Standard',
        frontmatter: {
          type: 'standard',
          ai_binding: 'required',
          applies_to: ['all'],
        },
      },
    ]);
    (readNote as ReturnType<typeof vi.fn>).mockResolvedValue(standardNote);
  });

  describe('loadStandards', () => {
    it('loads standards from default vault', async () => {
      const standards = await loadStandards();
      expect(standards).toHaveLength(1);
      expect(standards[0].title).toBe('Git Workflow Standard');
      expect(standards[0].binding).toBe('required');
    });

    it('loads from specific vault when provided', async () => {
      await loadStandards({ vault: 'test' });
      expect(mockRegistry.getVault).toHaveBeenCalledWith('test');
    });

    it('returns empty array for non-existent vault', async () => {
      mockRegistry.getVault.mockReturnValue(null);
      const standards = await loadStandards({ vault: 'nonexistent' });
      expect(standards).toHaveLength(0);
    });

    it('filters by binding level', async () => {
      const standards = await loadStandards({ binding: 'optional' });
      expect(standards).toHaveLength(0); // Our standard is 'required'
    });

    it('filters by domain', async () => {
      const standards = await loadStandards({ domain: ['git'] });
      expect(standards).toHaveLength(1);

      clearStandardsCache();
      const noMatch = await loadStandards({ domain: ['python'] });
      expect(noMatch).toHaveLength(0);
    });

    it('filters by applies_to', async () => {
      const standards = await loadStandards({ applies_to: 'all' });
      expect(standards).toHaveLength(1);
    });

    it('uses cache on second call', async () => {
      await loadStandards();
      await loadStandards();
      // listNotes should only be called once due to caching
      expect(listNotes).toHaveBeenCalledTimes(1);
    });

    it('skips non-standard notes', async () => {
      (listNotes as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          path: 'research/note.md',
          title: 'Regular Note',
          frontmatter: { type: 'research' },
        },
      ]);

      const standards = await loadStandards();
      expect(standards).toHaveLength(0);
    });

    it('extracts summary from content', async () => {
      const standards = await loadStandards();
      expect(standards[0].summary).toContain('Git commit standards');
    });

    it('loads from standards_source vault when configured', async () => {
      const standardsVault = { ...mockVault, alias: 'standards' };
      mockRegistry.getStandardsSourceVault.mockReturnValue(standardsVault);

      await loadStandards();
      expect(listNotes).toHaveBeenCalledWith('', true, expect.objectContaining({
        vaultPath: standardsVault.path,
      }));
    });
  });

  describe('loadRequiredStandards', () => {
    it('only returns required standards', async () => {
      const standards = await loadRequiredStandards();
      expect(standards.every(s => s.binding === 'required')).toBe(true);
    });
  });

  describe('hasRequiredStandards', () => {
    it('returns true when required standards exist', async () => {
      const has = await hasRequiredStandards();
      expect(has).toBe(true);
    });

    it('returns false when no required standards', async () => {
      (listNotes as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      const has = await hasRequiredStandards();
      expect(has).toBe(false);
    });
  });

  describe('getStandardByPath', () => {
    it('returns null for non-existent path', async () => {
      const standard = await getStandardByPath('nonexistent.md', 'test');
      expect(standard).toBeNull();
    });

    it('delegates to loadStandards with vault', async () => {
      // Just verify getStandardByPath calls loadStandards correctly
      await getStandardByPath('some-path.md', 'work');
      expect(mockRegistry.getVault).toHaveBeenCalledWith('work');
    });
  });
});
