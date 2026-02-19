/**
 * Tests for standards validator service
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/services/vault/reader.js', () => ({
  readNote: vi.fn(),
  listNotes: vi.fn(),
}));

vi.mock('../../../src/services/vault/registry.js', () => ({
  getVaultRegistry: vi.fn(),
}));

vi.mock('../../../src/services/standards/loader.js', () => ({
  loadStandards: vi.fn(),
}));

vi.mock('../../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { validateCompliance, isCompliant, validateMultiple } from '../../../src/services/standards/validator.js';
import { readNote } from '../../../src/services/vault/reader.js';
import { getVaultRegistry } from '../../../src/services/vault/registry.js';
import { loadStandards } from '../../../src/services/standards/loader.js';

const mockVault = {
  alias: 'test',
  path: '/tmp/vault',
  mode: 'rw' as const,
  config: { ignore: { patterns: [] } },
  indexPath: '/tmp/vault/.palace/index.sqlite',
};

const mockNote = {
  path: 'research/kubernetes.md',
  title: 'Kubernetes',
  content: '# Kubernetes\n\nContainer orchestration platform.\n\nUses conventional commits for version control.',
  raw: '---\ntype: research\ndomain: [kubernetes]\n---\n\n# Kubernetes\n\nContainer orchestration platform.\n\nUses conventional commits for version control.',
  frontmatter: {
    type: 'research',
    domain: ['kubernetes'],
    created: '2025-01-01',
    modified: '2025-01-01',
  },
};

const mockStandard = {
  path: 'standards/git-workflow.md',
  vault: 'test',
  title: 'Git Workflow',
  binding: 'required' as const,
  applies_to: ['all'],
  domain: ['git'],
  content: '## Requirements\n\n- Must use conventional commits\n- Should include scope',
  summary: 'Git workflow standard',
  frontmatter: {
    type: 'standard',
    ai_binding: 'required',
    applies_to: ['all'],
  },
};

describe('standards validator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getVaultRegistry as ReturnType<typeof vi.fn>).mockReturnValue({
      getVault: vi.fn(() => mockVault),
      getDefaultVault: vi.fn(() => mockVault),
      requireVault: vi.fn(() => mockVault),
    });
    (readNote as ReturnType<typeof vi.fn>).mockResolvedValue(mockNote);
    (loadStandards as ReturnType<typeof vi.fn>).mockResolvedValue([mockStandard]);
  });

  describe('validateCompliance', () => {
    it('returns compliant when note matches standard requirements', async () => {
      const report = await validateCompliance('research/kubernetes.md');
      expect(report.compliant).toBe(true);
      expect(report.violations).toHaveLength(0);
      expect(report.checked_against).toContain('standards/git-workflow.md');
    });

    it('returns non-compliant when note is not found', async () => {
      (readNote as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const report = await validateCompliance('nonexistent.md');
      expect(report.compliant).toBe(false);
      expect(report.violations).toHaveLength(1);
      expect(report.violations[0].standard).toBe('system');
    });

    it('returns violations when content missing required pattern', async () => {
      const strictStandard = {
        ...mockStandard,
        content: '## Requirements\n\n- Must use semantic versioning\n- Must include changelog',
      };
      (loadStandards as ReturnType<typeof vi.fn>).mockResolvedValue([strictStandard]);

      const report = await validateCompliance('research/kubernetes.md');
      expect(report.violations.length).toBeGreaterThan(0);
    });

    it('returns warnings for "should" rules', async () => {
      const softStandard = {
        ...mockStandard,
        content: '## Requirements\n\n- Should include examples\n- Should have diagrams',
      };
      (loadStandards as ReturnType<typeof vi.fn>).mockResolvedValue([softStandard]);

      const report = await validateCompliance('research/kubernetes.md');
      expect(report.warnings.length).toBeGreaterThan(0);
    });

    it('validates frontmatter requirements', async () => {
      const fmStandard = {
        ...mockStandard,
        content: '## Frontmatter Requirements\n\n- `confidence`: Required\n- `verified`: Recommended',
      };
      (loadStandards as ReturnType<typeof vi.fn>).mockResolvedValue([fmStandard]);

      const report = await validateCompliance('research/kubernetes.md');
      // confidence is missing from mockNote's frontmatter
      expect(report.violations.length).toBeGreaterThan(0);
    });

    it('filters standards by specific paths', async () => {
      const report = await validateCompliance('research/kubernetes.md', {
        standards: ['standards/git-workflow.md'],
      });
      expect(report.checked_against).toContain('standards/git-workflow.md');
    });

    it('uses specified vault', async () => {
      await validateCompliance('note.md', { vault: 'work' });
      // getVaultRegistry is called internally and the returned registry's requireVault
      // should be called with 'work'
      const registry = (getVaultRegistry as ReturnType<typeof vi.fn>)();
      expect(registry.requireVault).toHaveBeenCalledWith('work');
    });
  });

  describe('isCompliant', () => {
    it('returns true when compliant', async () => {
      const result = await isCompliant('research/kubernetes.md');
      expect(result).toBe(true);
    });

    it('returns false when not compliant', async () => {
      (readNote as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const result = await isCompliant('nonexistent.md');
      expect(result).toBe(false);
    });
  });

  describe('validateMultiple', () => {
    it('validates multiple notes', async () => {
      const results = await validateMultiple([
        'research/kubernetes.md',
        'research/docker.md',
      ]);
      expect(results.size).toBe(2);
      expect(results.has('research/kubernetes.md')).toBe(true);
      expect(results.has('research/docker.md')).toBe(true);
    });
  });
});
