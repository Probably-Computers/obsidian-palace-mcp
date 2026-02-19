/**
 * Tests for palace_store tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('fs/promises', () => ({
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock('../../../src/services/vault/resolver.js', () => ({
  resolveStorage: vi.fn(),
  checkPathConflict: vi.fn(),
  generateAlternativePath: vi.fn(),
}));

vi.mock('../../../src/services/vault/stub-manager.js', () => ({
  findStubByTitle: vi.fn(),
  expandStub: vi.fn(),
  createStubsForUnresolvedLinks: vi.fn(),
}));

vi.mock('../../../src/services/graph/retroactive.js', () => ({
  findUnlinkedMentions: vi.fn(),
  addRetroactiveLinks: vi.fn(),
}));

vi.mock('../../../src/services/autolink/index.js', () => ({
  buildCompleteIndex: vi.fn(),
  scanForMatches: vi.fn(),
  autolinkContent: vi.fn(),
}));

vi.mock('../../../src/utils/markdown.js', () => ({
  processWikiLinks: vi.fn((content: string) => content.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, '$2$1')),
}));

vi.mock('../../../src/services/index/index.js', () => ({
  getIndexManager: vi.fn(),
}));

vi.mock('../../../src/services/index/sync.js', () => ({
  getIndexedPaths: vi.fn(),
  indexNote: vi.fn(),
}));

vi.mock('../../../src/services/vault/reader.js', () => ({
  readNote: vi.fn(),
}));

vi.mock('../../../src/utils/vault-param.js', () => ({
  resolveVaultParam: vi.fn(),
  enforceWriteAccess: vi.fn(),
  getVaultResultInfo: vi.fn(),
}));

vi.mock('../../../src/utils/frontmatter.js', () => ({
  stringifyFrontmatter: vi.fn(
    (fm: Record<string, unknown>, body: string) => `---\n${JSON.stringify(fm)}\n---\n\n${body}`
  ),
}));

vi.mock('../../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../src/services/atomic/index.js', () => ({
  shouldSplit: vi.fn(),
  splitContent: vi.fn(),
  createHub: vi.fn(),
  createChildNote: vi.fn(),
}));

vi.mock('../../../src/services/operations/index.js', () => ({
  startOperation: vi.fn(),
  trackFileCreated: vi.fn(),
  trackFileModified: vi.fn(),
}));

import { storeHandler } from '../../../src/tools/store.js';
import { resolveStorage, checkPathConflict } from '../../../src/services/vault/resolver.js';
import { findStubByTitle } from '../../../src/services/vault/stub-manager.js';
import { buildCompleteIndex, scanForMatches, autolinkContent } from '../../../src/services/autolink/index.js';
import { getIndexManager } from '../../../src/services/index/index.js';
import { getIndexedPaths } from '../../../src/services/index/sync.js';
import { resolveVaultParam, enforceWriteAccess, getVaultResultInfo } from '../../../src/utils/vault-param.js';
import { shouldSplit } from '../../../src/services/atomic/index.js';
import { startOperation } from '../../../src/services/operations/index.js';
import { findUnlinkedMentions } from '../../../src/services/graph/retroactive.js';

const mockVault = {
  alias: 'test',
  path: '/tmp/vault',
  mode: 'rw' as const,
  config: {
    ignore: { patterns: [], marker_file: '.palace-ignore', frontmatter_key: 'palace_ignore' },
    atomic: {
      max_lines: 200,
      max_sections: 6,
      section_max_lines: 50,
      min_section_lines: 5,
      max_children: 10,
      auto_split: true,
    },
  },
  indexPath: '/tmp/vault/.palace/index.sqlite',
};

const mockDb = {};

const baseInput = {
  title: 'Docker Networking',
  content: 'Docker uses bridge networks by default.',
  intent: {
    capture_type: 'knowledge',
    domain: ['infrastructure', 'docker'],
  },
};

describe('palace_store tool', () => {
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
    (startOperation as ReturnType<typeof vi.fn>).mockReturnValue({ id: 'op_test123' });
    (findStubByTitle as ReturnType<typeof vi.fn>).mockReturnValue(null);
    (resolveStorage as ReturnType<typeof vi.fn>).mockReturnValue({
      fullPath: '/tmp/vault/infrastructure/docker/Docker Networking.md',
      relativePath: 'infrastructure/docker/Docker Networking.md',
      parentDir: '/tmp/vault/infrastructure/docker',
      isNewTopLevelDomain: false,
    });
    (checkPathConflict as ReturnType<typeof vi.fn>).mockReturnValue(false);
    (getIndexedPaths as ReturnType<typeof vi.fn>).mockReturnValue([]);
    (buildCompleteIndex as ReturnType<typeof vi.fn>).mockResolvedValue({ index: new Map() });
    (scanForMatches as ReturnType<typeof vi.fn>).mockReturnValue([]);
    (shouldSplit as ReturnType<typeof vi.fn>).mockReturnValue({
      shouldSplit: false,
      reason: '',
      metrics: { lineCount: 5, sectionCount: 1 },
    });
    (findUnlinkedMentions as ReturnType<typeof vi.fn>).mockReturnValue([]);
  });

  describe('validation', () => {
    it('returns validation error when title is missing', async () => {
      const result = await storeHandler({
        content: 'test',
        intent: { capture_type: 'knowledge', domain: ['test'] },
      });
      expect(result.success).toBe(false);
      expect(result.code).toBe('VALIDATION_ERROR');
    });

    it('returns validation error when content is missing', async () => {
      const result = await storeHandler({
        title: 'Test',
        intent: { capture_type: 'knowledge', domain: ['test'] },
      });
      expect(result.success).toBe(false);
      expect(result.code).toBe('VALIDATION_ERROR');
    });

    it('returns validation error when intent is missing', async () => {
      const result = await storeHandler({
        title: 'Test',
        content: 'test content',
      });
      expect(result.success).toBe(false);
      expect(result.code).toBe('VALIDATION_ERROR');
    });

    it('returns validation error when capture_type is invalid', async () => {
      const result = await storeHandler({
        title: 'Test',
        content: 'test',
        intent: { capture_type: 'invalid', domain: ['test'] },
      });
      expect(result.success).toBe(false);
      expect(result.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('basic storage', () => {
    it('stores a knowledge note successfully', async () => {
      const result = await storeHandler(baseInput);
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.created.path).toBe('infrastructure/docker/Docker Networking.md');
      expect(result.data.created.title).toBe('Docker Networking');
      expect(result.data.created.type).toBe('atomic');
      expect(result.data.domain.path).toBe('infrastructure/docker');
      expect(result.data.domain.level).toBe(2);
      expect(result.data.operation_id).toBe('op_test123');
    });

    it('enforces write access', async () => {
      await storeHandler(baseInput);
      expect(enforceWriteAccess).toHaveBeenCalledWith(mockVault);
    });

    it('resolves vault from options', async () => {
      await storeHandler({
        ...baseInput,
        options: { vault: 'work' },
      });
      expect(resolveVaultParam).toHaveBeenCalledWith('work');
    });
  });

  describe('stub expansion', () => {
    it('expands existing stub instead of creating new note', async () => {
      (findStubByTitle as ReturnType<typeof vi.fn>).mockReturnValue({
        path: 'infrastructure/docker/Docker Networking.md',
        title: 'Docker Networking',
      });

      const result = await storeHandler(baseInput);
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.message).toContain('Expanded stub');
    });
  });

  describe('dry run', () => {
    it('does not write files in dry_run mode', async () => {
      const { mkdir, writeFile } = await import('fs/promises');

      const result = await storeHandler({
        ...baseInput,
        options: { dry_run: true },
      });
      expect(result.success).toBe(true);
      expect(mkdir).not.toHaveBeenCalled();
      expect(writeFile).not.toHaveBeenCalled();
    });
  });

  describe('auto-linking', () => {
    it('auto-links content when enabled', async () => {
      (scanForMatches as ReturnType<typeof vi.fn>).mockReturnValue([
        { title: 'Docker', position: 0, length: 6 },
      ]);
      (autolinkContent as ReturnType<typeof vi.fn>).mockReturnValue({
        linkedContent: '[[Docker]] uses bridge networks.',
        linksAdded: [{ title: 'Docker' }],
      });

      const result = await storeHandler(baseInput);
      expect(result.success).toBe(true);
      expect(buildCompleteIndex).toHaveBeenCalled();
    });

    it('skips auto-linking when disabled', async () => {
      await storeHandler({
        ...baseInput,
        options: { autolink: false },
      });
      expect(buildCompleteIndex).not.toHaveBeenCalled();
    });
  });

  describe('portable mode', () => {
    it('disables stubs, retroactive linking, autolink, and splitting', async () => {
      const result = await storeHandler({
        ...baseInput,
        options: { portable: true },
      });
      expect(result.success).toBe(true);

      // Autolink should be skipped
      expect(buildCompleteIndex).not.toHaveBeenCalled();
      // Retroactive linking should be skipped
      expect(findUnlinkedMentions).not.toHaveBeenCalled();
    });
  });

  describe('atomic warning', () => {
    it('includes warning when auto_split is disabled but content exceeds limits', async () => {
      (shouldSplit as ReturnType<typeof vi.fn>).mockReturnValue({
        shouldSplit: true,
        reason: 'too many lines',
        metrics: { lineCount: 250, sectionCount: 8 },
      });

      const result = await storeHandler({
        ...baseInput,
        options: { auto_split: false },
      });
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.atomic_warning).toContain('exceeds atomic limits');
    });
  });

  describe('error handling', () => {
    it('handles resolver errors gracefully', async () => {
      (resolveStorage as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('Resolution failed');
      });

      const result = await storeHandler(baseInput);
      expect(result.success).toBe(false);
      expect(result.code).toBe('STORE_ERROR');
    });

    it('handles write access errors', async () => {
      (enforceWriteAccess as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error("Vault 'test' is read-only");
      });

      const result = await storeHandler(baseInput);
      expect(result.success).toBe(false);
      expect(result.code).toBe('STORE_ERROR');
      expect(result.error).toContain('read-only');
    });
  });
});
