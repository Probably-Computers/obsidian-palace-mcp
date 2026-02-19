/**
 * Tests for palace_revert tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/services/vault/index.js', () => ({
  getVaultRegistry: vi.fn(),
  readNote: vi.fn(),
}));

vi.mock('../../../src/services/history/index.js', () => ({
  getVersion: vi.fn(),
  saveVersion: vi.fn(),
  listVersions: vi.fn(),
}));

vi.mock('../../../src/services/index/sync.js', () => ({
  indexNote: vi.fn(),
}));

vi.mock('../../../src/services/index/sqlite.js', () => ({
  createDatabase: vi.fn(() => ({ close: vi.fn() })),
}));

vi.mock('../../../src/utils/frontmatter.js', () => ({
  stringifyFrontmatter: vi.fn((fm, content) => `---\n${JSON.stringify(fm)}\n---\n\n${content}`),
}));

vi.mock('../../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('fs/promises', () => ({
  writeFile: vi.fn(),
}));

import { revertHandler } from '../../../src/tools/revert.js';
import { getVaultRegistry, readNote } from '../../../src/services/vault/index.js';
import { getVersion, listVersions, saveVersion } from '../../../src/services/history/index.js';

const mockVault = {
  alias: 'test',
  path: '/tmp/vault',
  mode: 'rw' as const,
  indexPath: '/tmp/vault/.palace/index.sqlite',
  config: {
    history: {
      max_versions_per_note: 50,
      max_age_days: 90,
      auto_cleanup: true,
    },
  },
};

describe('palace_revert tool', () => {
  let mockRegistry: {
    getVault: ReturnType<typeof vi.fn>;
    getDefaultVault: ReturnType<typeof vi.fn>;
    isReadOnly: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRegistry = {
      getVault: vi.fn(() => mockVault),
      getDefaultVault: vi.fn(() => mockVault),
      isReadOnly: vi.fn(() => false),
    };
    (getVaultRegistry as ReturnType<typeof vi.fn>).mockReturnValue(mockRegistry);
  });

  it('returns validation error when path is missing', async () => {
    const result = await revertHandler({ to_version: 1 });
    expect(result.success).toBe(false);
    expect(result.code).toBe('VALIDATION_ERROR');
  });

  it('returns validation error when to_version is missing', async () => {
    const result = await revertHandler({ path: 'note.md' });
    expect(result.success).toBe(false);
    expect(result.code).toBe('VALIDATION_ERROR');
  });

  it('returns error when vault not found', async () => {
    mockRegistry.getDefaultVault.mockReturnValue(null);

    const result = await revertHandler({ path: 'note.md', to_version: 1 });
    expect(result.success).toBe(false);
    expect(result.code).toBe('VAULT_NOT_FOUND');
  });

  it('returns error when note not found', async () => {
    (readNote as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await revertHandler({ path: 'nonexistent.md', to_version: 1 });
    expect(result.success).toBe(false);
    expect(result.code).toBe('NOTE_NOT_FOUND');
  });

  it('returns error when target version not found', async () => {
    (readNote as ReturnType<typeof vi.fn>).mockResolvedValue({
      path: 'note.md',
      frontmatter: { type: 'research' },
      content: 'Current content',
      raw: '---\ntype: research\n---\n\nCurrent content',
    });
    (getVersion as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await revertHandler({ path: 'note.md', to_version: 99 });
    expect(result.success).toBe(false);
    expect(result.code).toBe('VERSION_NOT_FOUND');
  });

  it('returns error when vault is read-only and not dry_run', async () => {
    mockRegistry.isReadOnly.mockReturnValue(true);

    const result = await revertHandler({ path: 'note.md', to_version: 1, dry_run: false });
    expect(result.success).toBe(false);
    expect(result.code).toBe('VAULT_READ_ONLY');
  });

  it('previews revert in dry_run mode', async () => {
    (readNote as ReturnType<typeof vi.fn>).mockResolvedValue({
      path: 'note.md',
      frontmatter: { type: 'research', title: 'Updated' },
      content: 'New content',
      raw: '---\ntype: research\n---\n\nNew content',
    });
    (getVersion as ReturnType<typeof vi.fn>).mockResolvedValue({
      version: 1,
      frontmatter: { type: 'research', title: 'Original' },
      body: 'Old content',
    });
    (listVersions as ReturnType<typeof vi.fn>).mockResolvedValue([
      { version: 3, timestamp: '2025-01-03' },
    ]);

    const result = await revertHandler({ path: 'note.md', to_version: 1, dry_run: true });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.dry_run).toBe(true);
    expect(result.data.reverted_from).toBe(3);
    expect(result.data.reverted_to).toBe(1);
    expect(result.data.changes_reverted).toContain('frontmatter');
    expect(result.data.changes_reverted).toContain('content');
    expect(result.data.preview).toBeDefined();
  });

  it('executes revert with backup', async () => {
    (readNote as ReturnType<typeof vi.fn>).mockResolvedValue({
      path: 'note.md',
      frontmatter: { type: 'research', title: 'Updated' },
      content: 'New content',
      raw: '---\ntype: research\n---\n\nNew content',
    });
    (getVersion as ReturnType<typeof vi.fn>).mockResolvedValue({
      version: 1,
      frontmatter: { type: 'research', title: 'Original' },
      body: 'Old content',
    });
    (listVersions as ReturnType<typeof vi.fn>).mockResolvedValue([
      { version: 3, timestamp: '2025-01-03' },
    ]);
    (saveVersion as ReturnType<typeof vi.fn>).mockResolvedValue(4);

    const result = await revertHandler({
      path: 'note.md',
      to_version: 1,
      dry_run: false,
      create_backup: true,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.dry_run).toBe(false);
    expect(result.data.backup_version).toBe(4);
    expect(saveVersion).toHaveBeenCalled();
  });

  it('supports content-only revert', async () => {
    const sameFrontmatter = { type: 'research', title: 'Same' };
    (readNote as ReturnType<typeof vi.fn>).mockResolvedValue({
      path: 'note.md',
      frontmatter: sameFrontmatter,
      content: 'New content',
      raw: '---\ntype: research\n---\n\nNew content',
    });
    (getVersion as ReturnType<typeof vi.fn>).mockResolvedValue({
      version: 1,
      frontmatter: sameFrontmatter,
      body: 'Old content',
    });
    (listVersions as ReturnType<typeof vi.fn>).mockResolvedValue([{ version: 2 }]);

    const result = await revertHandler({
      path: 'note.md',
      to_version: 1,
      revert_scope: 'content',
      dry_run: true,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.changes_reverted).toContain('content');
    expect(result.data.changes_reverted).not.toContain('frontmatter');
  });
});
