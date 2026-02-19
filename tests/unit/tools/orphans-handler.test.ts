/**
 * Mocked unit tests for palace_orphans handler
 * Covers stub_orphans, child_orphans, include_context, cleanup, suggestions, errors
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/services/graph/index.js', () => ({
  findOrphans: vi.fn(),
}));

vi.mock('../../../src/services/index/index.js', () => ({
  getIndexManager: vi.fn(),
}));

vi.mock('../../../src/services/index/sync.js', () => ({
  removeFromIndex: vi.fn(),
}));

vi.mock('../../../src/utils/vault-param.js', () => ({
  resolveVaultParam: vi.fn(),
  getVaultResultInfo: vi.fn(),
}));

vi.mock('../../../src/services/vault/writer.js', () => ({
  deleteNote: vi.fn(),
}));

vi.mock('../../../src/services/vault/reader.js', () => ({
  readNote: vi.fn(),
}));

vi.mock('../../../src/services/operations/index.js', () => ({
  startOperation: vi.fn(() => ({ id: 'op_test' })),
  trackFileDeleted: vi.fn(),
}));

vi.mock('../../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('better-sqlite3', () => {
  const prepareFn = vi.fn(() => ({
    all: vi.fn(() => []),
    run: vi.fn(),
  }));
  return {
    default: vi.fn(() => ({
      prepare: prepareFn,
      exec: vi.fn(),
    })),
  };
});

import { orphansHandler } from '../../../src/tools/orphans.js';
import { findOrphans } from '../../../src/services/graph/index.js';
import { getIndexManager } from '../../../src/services/index/index.js';
import { resolveVaultParam, getVaultResultInfo } from '../../../src/utils/vault-param.js';
import { readNote } from '../../../src/services/vault/reader.js';

const mockVault = {
  alias: 'test',
  path: '/tmp/vault',
  mode: 'rw' as const,
  config: { ignore: { patterns: [] } },
  indexPath: '/tmp/vault/.palace/index.sqlite',
};

const mockDb = {
  prepare: vi.fn(() => ({
    all: vi.fn(() => []),
    run: vi.fn(),
  })),
  exec: vi.fn(),
};

describe('orphansHandler (mocked)', () => {
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
    (findOrphans as ReturnType<typeof vi.fn>).mockReturnValue([]);
  });

  it('returns empty orphans for clean vault', async () => {
    const result = await orphansHandler({});
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.count).toBe(0);
    expect(result.data.type).toBe('isolated');
  });

  it('returns orphans with correct metadata', async () => {
    (findOrphans as ReturnType<typeof vi.fn>).mockReturnValue([
      {
        path: 'notes/orphan.md',
        filename: 'orphan.md',
        title: 'Orphan Note',
        frontmatter: {
          created: '2025-01-01T00:00:00Z',
          modified: '2025-01-01T00:00:00Z',
        },
      },
    ]);

    const result = await orphansHandler({ type: 'isolated' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.count).toBe(1);
    expect(result.data.orphans[0].path).toBe('notes/orphan.md');
    expect(result.data.orphans[0].title).toBe('Orphan Note');
  });

  it('handles stub_orphans type', async () => {
    // stub_orphans uses internal SQL query, which returns empty from mock
    const result = await orphansHandler({ type: 'stub_orphans' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.type).toBe('stub_orphans');
    expect(result.data.description).toContain('Stub notes');
  });

  it('handles child_orphans type', async () => {
    const result = await orphansHandler({ type: 'child_orphans' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.type).toBe('child_orphans');
    expect(result.data.description).toContain('Child notes');
  });

  it('handles no_incoming type', async () => {
    const result = await orphansHandler({ type: 'no_incoming' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.description).toContain('no backlinks');
  });

  it('handles no_outgoing type', async () => {
    const result = await orphansHandler({ type: 'no_outgoing' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.description).toContain('no outgoing links');
  });

  it('includes suggestions by default', async () => {
    const result = await orphansHandler({});
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.suggestions).toBeDefined();
    expect(Array.isArray(result.data.suggestions)).toBe(true);
  });

  it('excludes suggestions when disabled', async () => {
    const result = await orphansHandler({ include_suggestions: false });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.suggestions).toBeUndefined();
  });

  it('handles delete_orphans with dry_run', async () => {
    (findOrphans as ReturnType<typeof vi.fn>).mockReturnValue([
      {
        path: 'notes/orphan.md',
        filename: 'orphan.md',
        title: 'Orphan',
        frontmatter: { created: '2025-01-01', modified: '2025-01-01' },
      },
    ]);

    const result = await orphansHandler({ delete_orphans: true, dry_run: true });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.cleanup).toBeDefined();
    expect(result.data.cleanup.dry_run).toBe(true);
    expect(result.data.cleanup.deleted).toHaveLength(1);
    expect(result.data.cleanup.message).toContain('DRY RUN');
  });

  it('rejects delete on read-only vault', async () => {
    (resolveVaultParam as ReturnType<typeof vi.fn>).mockReturnValue({
      ...mockVault,
      mode: 'ro',
    });

    const result = await orphansHandler({ delete_orphans: true, dry_run: false });
    expect(result.success).toBe(false);
    expect(result.code).toBe('READONLY_VAULT');
  });

  it('respects limit parameter', async () => {
    const manyOrphans = Array.from({ length: 20 }, (_, i) => ({
      path: `notes/orphan-${i}.md`,
      filename: `orphan-${i}.md`,
      title: `Orphan ${i}`,
      frontmatter: { created: '2025-01-01', modified: '2025-01-01' },
    }));
    (findOrphans as ReturnType<typeof vi.fn>).mockReturnValue(manyOrphans);

    const result = await orphansHandler({ limit: 5 });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.count).toBe(5);
    expect(result.data.total).toBe(20);
    expect(result.data.hasMore).toBe(true);
  });

  it('generates type-specific suggestions', async () => {
    (findOrphans as ReturnType<typeof vi.fn>).mockReturnValue([
      {
        path: 'notes/orphan.md',
        filename: 'orphan.md',
        title: 'Orphan',
        frontmatter: { created: '2025-01-01', modified: '2025-01-01' },
      },
    ]);

    const result = await orphansHandler({ type: 'isolated' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.suggestions.some((s: string) => s.includes('wiki-links'))).toBe(true);
  });

  it('suggests deletion for many orphans', async () => {
    const manyOrphans = Array.from({ length: 15 }, (_, i) => ({
      path: `notes/orphan-${i}.md`,
      filename: `orphan-${i}.md`,
      title: `Orphan ${i}`,
      frontmatter: { created: '2025-01-01', modified: '2025-01-01' },
    }));
    (findOrphans as ReturnType<typeof vi.fn>).mockReturnValue(manyOrphans);

    const result = await orphansHandler({});
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.suggestions.some((s: string) => s.includes('delete_orphans'))).toBe(true);
  });

  it('includes context when requested', async () => {
    (findOrphans as ReturnType<typeof vi.fn>).mockReturnValue([
      {
        path: 'notes/orphan.md',
        filename: 'orphan.md',
        title: 'Orphan Note',
        frontmatter: { created: '2025-01-01', modified: '2025-01-01' },
      },
    ]);
    (readNote as ReturnType<typeof vi.fn>).mockResolvedValue({
      path: 'notes/orphan.md',
      content: 'Some orphan content that should appear in preview.',
    });

    const result = await orphansHandler({ include_context: true });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.orphans_with_context).toBeDefined();
    expect(result.data.orphans_with_context).toHaveLength(1);
    expect(result.data.orphans_with_context[0].content_preview).toBeDefined();
    expect(result.data.action_summary).toBeDefined();
  });

  it('handles errors gracefully', async () => {
    (resolveVaultParam as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('Vault not found');
    });

    const result = await orphansHandler({ vault: 'nonexistent' });
    expect(result.success).toBe(false);
    expect(result.code).toBe('ORPHANS_ERROR');
  });

  it('passes path prefix to findOrphans', async () => {
    await orphansHandler({ path: 'research/' });
    expect(findOrphans).toHaveBeenCalledWith(
      expect.anything(),
      'isolated',
      'research/'
    );
  });
});
