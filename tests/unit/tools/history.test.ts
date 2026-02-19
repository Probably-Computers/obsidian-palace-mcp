/**
 * Tests for palace_history tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/services/vault/index.js', () => ({
  getVaultRegistry: vi.fn(),
  readNote: vi.fn(),
}));

vi.mock('../../../src/services/history/index.js', () => ({
  listVersions: vi.fn(),
  getVersionContent: vi.fn(),
}));

vi.mock('../../../src/services/history/diff.js', () => ({
  generateDiff: vi.fn(),
  formatUnifiedDiff: vi.fn(),
  generateFrontmatterDiff: vi.fn(),
  formatFrontmatterDiff: vi.fn(),
  generateChangeSummary: vi.fn(),
}));

vi.mock('../../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}));

import { historyHandler } from '../../../src/tools/history.js';
import { getVaultRegistry, readNote } from '../../../src/services/vault/index.js';
import { listVersions, getVersionContent } from '../../../src/services/history/index.js';
import { generateDiff, formatUnifiedDiff, generateChangeSummary, generateFrontmatterDiff, formatFrontmatterDiff } from '../../../src/services/history/diff.js';

const mockVault = {
  alias: 'test',
  path: '/tmp/vault',
  mode: 'rw' as const,
  indexPath: '/tmp/vault/.palace/index.sqlite',
  config: { history: {} },
};

describe('palace_history tool', () => {
  let mockRegistry: {
    getVault: ReturnType<typeof vi.fn>;
    getDefaultVault: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRegistry = {
      getVault: vi.fn(() => mockVault),
      getDefaultVault: vi.fn(() => mockVault),
    };
    (getVaultRegistry as ReturnType<typeof vi.fn>).mockReturnValue(mockRegistry);
    (readNote as ReturnType<typeof vi.fn>).mockResolvedValue({
      path: 'research/note.md',
      content: 'current content',
    });
  });

  it('returns validation error when path is missing', async () => {
    const result = await historyHandler({});
    expect(result.success).toBe(false);
    expect(result.code).toBe('VALIDATION_ERROR');
  });

  it('returns VAULT_NOT_FOUND when vault missing', async () => {
    mockRegistry.getDefaultVault.mockReturnValue(null);
    const result = await historyHandler({ path: 'note.md' });
    expect(result.success).toBe(false);
    expect(result.code).toBe('VAULT_NOT_FOUND');
  });

  it('returns NOTE_NOT_FOUND when note missing', async () => {
    (readNote as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const result = await historyHandler({ path: 'nonexistent.md' });
    expect(result.success).toBe(false);
    expect(result.code).toBe('NOTE_NOT_FOUND');
  });

  it('lists versions for a note', async () => {
    (listVersions as ReturnType<typeof vi.fn>).mockResolvedValue([
      { version: 3, timestamp: '2025-01-03', operation: 'improve', changes: ['content'] },
      { version: 2, timestamp: '2025-01-02', operation: 'store', changes: ['created'] },
      { version: 1, timestamp: '2025-01-01', operation: 'store', changes: ['created'] },
    ]);

    const result = await historyHandler({ path: 'research/note.md' });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.current_version).toBe(3);
    expect(result.data.versions).toHaveLength(3);
    expect(result.data.total_versions).toBe(3);
  });

  it('filters by version range', async () => {
    (listVersions as ReturnType<typeof vi.fn>).mockResolvedValue([
      { version: 5, timestamp: '2025-01-05', operation: 'improve', changes: [] },
      { version: 4, timestamp: '2025-01-04', operation: 'improve', changes: [] },
      { version: 3, timestamp: '2025-01-03', operation: 'improve', changes: [] },
      { version: 2, timestamp: '2025-01-02', operation: 'store', changes: [] },
      { version: 1, timestamp: '2025-01-01', operation: 'store', changes: [] },
    ]);

    const result = await historyHandler({ path: 'note.md', from_version: 2, to_version: 4 });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.versions).toHaveLength(3);
    expect(result.data.versions[0].version).toBe(4);
    expect(result.data.versions[2].version).toBe(2);
  });

  it('includes diffs when show_diff is true', async () => {
    (listVersions as ReturnType<typeof vi.fn>).mockResolvedValue([
      { version: 2, timestamp: '2025-01-02', operation: 'improve', changes: ['content'] },
      { version: 1, timestamp: '2025-01-01', operation: 'store', changes: ['created'] },
    ]);
    (getVersionContent as ReturnType<typeof vi.fn>).mockResolvedValue('some content');
    (generateChangeSummary as ReturnType<typeof vi.fn>).mockReturnValue('Content changed');
    (generateDiff as ReturnType<typeof vi.fn>).mockReturnValue([]);
    (formatUnifiedDiff as ReturnType<typeof vi.fn>).mockReturnValue('--- v1\n+++ v2\n');

    const result = await historyHandler({ path: 'note.md', show_diff: true });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.versions[0].diff).toBeDefined();
    expect(result.data.versions[0].summary).toBe('Content changed');
    // Last version shows "Initial version"
    expect(result.data.versions[1].summary).toBe('Initial version');
  });

  it('compares two specific versions', async () => {
    (listVersions as ReturnType<typeof vi.fn>).mockResolvedValue([
      { version: 3, timestamp: '2025-01-03' },
    ]);
    (getVersionContent as ReturnType<typeof vi.fn>).mockResolvedValue('version content');
    (generateDiff as ReturnType<typeof vi.fn>).mockReturnValue([]);
    (formatUnifiedDiff as ReturnType<typeof vi.fn>).mockReturnValue('diff output');
    (generateFrontmatterDiff as ReturnType<typeof vi.fn>).mockReturnValue({});
    (formatFrontmatterDiff as ReturnType<typeof vi.fn>).mockReturnValue('fm diff');
    (generateChangeSummary as ReturnType<typeof vi.fn>).mockReturnValue('Changes summary');

    const result = await historyHandler({
      path: 'note.md',
      compare: { from: 1, to: 3 },
    });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.compare).toBeDefined();
    expect(result.data.compare!.from_version).toBe(1);
    expect(result.data.compare!.to_version).toBe(3);
  });

  it('handles errors gracefully', async () => {
    (getVaultRegistry as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('Registry error');
    });

    const result = await historyHandler({ path: 'note.md' });
    expect(result.success).toBe(false);
    expect(result.code).toBe('HISTORY_ERROR');
  });
});
