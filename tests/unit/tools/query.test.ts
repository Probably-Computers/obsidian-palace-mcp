/**
 * Tests for palace_query tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/services/index/index.js', () => ({
  queryAllVaults: vi.fn(),
  queryNotesInVault: vi.fn(),
  countNotesInVault: vi.fn(),
  countNotesAllVaults: vi.fn(),
  getIndexManager: vi.fn(),
}));

vi.mock('../../../src/services/vault/index.js', () => ({
  readNote: vi.fn(),
}));

vi.mock('../../../src/utils/vault-param.js', () => ({
  resolveVaultParam: vi.fn(),
}));

vi.mock('../../../src/services/vault/registry.js', () => ({
  getVaultRegistry: vi.fn(),
}));

import { queryHandler } from '../../../src/tools/query.js';
import {
  queryAllVaults,
  queryNotesInVault,
  countNotesInVault,
  countNotesAllVaults,
  getIndexManager,
} from '../../../src/services/index/index.js';
import { readNote } from '../../../src/services/vault/index.js';
import { resolveVaultParam } from '../../../src/utils/vault-param.js';
import { getVaultRegistry } from '../../../src/services/vault/registry.js';

const mockVault = {
  alias: 'test',
  path: '/tmp/vault',
  mode: 'rw' as const,
};

const mockDb = {};

describe('palace_query tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (resolveVaultParam as ReturnType<typeof vi.fn>).mockReturnValue(mockVault);
    (getIndexManager as ReturnType<typeof vi.fn>).mockReturnValue({
      getIndex: vi.fn().mockResolvedValue(mockDb),
    });
    (getVaultRegistry as ReturnType<typeof vi.fn>).mockReturnValue({
      getVault: vi.fn().mockReturnValue(mockVault),
    });
  });

  it('queries single vault when vault param is provided', async () => {
    const mockNotes = [
      {
        path: 'research/topic.md',
        title: 'Topic',
        frontmatter: {
          type: 'research',
          created: '2025-01-01',
          modified: '2025-01-02',
          confidence: 0.9,
          verified: true,
          tags: ['test'],
        },
      },
    ];
    (queryNotesInVault as ReturnType<typeof vi.fn>).mockReturnValue(mockNotes);
    (countNotesInVault as ReturnType<typeof vi.fn>).mockReturnValue(1);

    const result = await queryHandler({ vault: 'test' });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.query_mode).toBe('single');
    expect(result.data.count).toBe(1);
    expect(result.data.results[0].title).toBe('Topic');
    expect(result.data.results[0].vault).toBe('test');
  });

  it('queries all vaults when no vault param', async () => {
    (queryAllVaults as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        vault: 'work',
        vaultPath: 'docs/api.md',
        prefixedPath: 'vault:work/docs/api.md',
        note: {
          path: 'docs/api.md',
          title: 'API',
          frontmatter: { type: 'research', tags: [] },
        },
      },
    ]);
    (countNotesAllVaults as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const result = await queryHandler({});
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.query_mode).toBe('cross');
    expect(queryAllVaults).toHaveBeenCalled();
  });

  it('passes filter options correctly', async () => {
    (queryAllVaults as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (countNotesAllVaults as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    await queryHandler({
      type: 'command',
      tags: ['docker'],
      path: 'commands',
      min_confidence: 0.5,
      verified: true,
      sort_by: 'created',
      sort_order: 'asc',
      limit: 5,
      offset: 10,
    });

    expect(queryAllVaults).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'command',
        tags: ['docker'],
        path: 'commands',
        minConfidence: 0.5,
        verified: true,
        sortBy: 'created',
        sortOrder: 'asc',
        limit: 5,
        offset: 10,
      })
    );
  });

  it('includes content when requested', async () => {
    (queryAllVaults as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        vault: 'test',
        vaultPath: 'note.md',
        prefixedPath: 'vault:test/note.md',
        note: {
          path: 'note.md',
          title: 'Note',
          frontmatter: { type: 'research', tags: [] },
        },
      },
    ]);
    (countNotesAllVaults as ReturnType<typeof vi.fn>).mockResolvedValue(1);
    (readNote as ReturnType<typeof vi.fn>).mockResolvedValue({ content: 'Full content here' });

    const result = await queryHandler({ include_content: true });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(readNote).toHaveBeenCalled();
    expect(result.data.results[0].content).toBe('Full content here');
  });

  it('calculates hasMore correctly', async () => {
    (queryAllVaults as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        vault: 'test',
        vaultPath: 'note.md',
        prefixedPath: 'vault:test/note.md',
        note: { path: 'note.md', title: 'Note', frontmatter: { type: 'research', tags: [] } },
      },
    ]);
    (countNotesAllVaults as ReturnType<typeof vi.fn>).mockResolvedValue(50);

    const result = await queryHandler({ limit: 20, offset: 0 });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.hasMore).toBe(true);
    expect(result.data.total).toBe(50);
  });

  it('handles errors gracefully', async () => {
    (queryAllVaults as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Query failed'));

    const result = await queryHandler({});
    expect(result.success).toBe(false);
    expect(result.code).toBe('QUERY_ERROR');
  });
});
