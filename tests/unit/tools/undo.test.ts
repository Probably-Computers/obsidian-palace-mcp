/**
 * Tests for palace_undo tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/services/vault/index.js', () => ({
  getVaultRegistry: vi.fn(),
  readNote: vi.fn(),
}));

vi.mock('../../../src/services/operations/tracker.js', () => ({
  getOperation: vi.fn(),
  getRecentOperations: vi.fn(),
}));

vi.mock('../../../src/services/history/index.js', () => ({
  getVersionContent: vi.fn(),
  listVersions: vi.fn(),
}));

vi.mock('../../../src/services/index/sync.js', () => ({
  indexNote: vi.fn(),
  removeFromIndex: vi.fn(),
}));

vi.mock('../../../src/services/index/sqlite.js', () => ({
  createDatabase: vi.fn(() => ({ close: vi.fn() })),
}));

vi.mock('../../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { undoHandler } from '../../../src/tools/undo.js';
import { getVaultRegistry } from '../../../src/services/vault/index.js';
import { getOperation, getRecentOperations } from '../../../src/services/operations/tracker.js';
import { listVersions, getVersionContent } from '../../../src/services/history/index.js';

const mockVault = {
  alias: 'test',
  path: '/tmp/vault',
  mode: 'rw' as const,
  indexPath: '/tmp/vault/.palace/index.sqlite',
  config: { history: {} },
};

describe('palace_undo tool', () => {
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

  describe('list mode', () => {
    it('lists recent undoable operations', async () => {
      (getRecentOperations as ReturnType<typeof vi.fn>).mockReturnValue([
        {
          id: 'op_1',
          type: 'store',
          timestamp: '2025-01-01T00:00:00Z',
          vaultAlias: 'test',
          filesCreated: ['note.md'],
          filesModified: [],
          filesDeleted: [],
        },
        {
          id: 'op_2',
          type: 'improve',
          timestamp: '2025-01-02T00:00:00Z',
          vaultAlias: 'test',
          filesCreated: [],
          filesModified: ['note.md'],
          filesDeleted: [],
        },
      ]);

      const result = await undoHandler({ list: true });
      expect(result.success).toBe(true);
      if (!result.success) return;

      const data = result.data as { operations: Array<{ id: string; undoable: boolean }> };
      expect(data.operations).toHaveLength(2);
      expect(data.operations[0].id).toBe('op_1');
      expect(data.operations[0].undoable).toBe(true);
    });

    it('marks empty-file operations as not undoable', async () => {
      (getRecentOperations as ReturnType<typeof vi.fn>).mockReturnValue([
        {
          id: 'op_empty',
          type: 'store',
          timestamp: '2025-01-01T00:00:00Z',
          vaultAlias: 'test',
          filesCreated: [],
          filesModified: [],
          filesDeleted: [],
        },
      ]);

      const result = await undoHandler({ list: true });
      expect(result.success).toBe(true);
      if (!result.success) return;

      const data = result.data as { operations: Array<{ undoable: boolean; reason?: string }> };
      expect(data.operations[0].undoable).toBe(false);
      expect(data.operations[0].reason).toBeDefined();
    });
  });

  describe('undo mode', () => {
    it('requires operation_id when list is false', async () => {
      const result = await undoHandler({ list: false });
      expect(result.success).toBe(false);
      expect(result.code).toBe('VALIDATION_ERROR');
    });

    it('returns error when operation not found', async () => {
      (getOperation as ReturnType<typeof vi.fn>).mockReturnValue(null);

      const result = await undoHandler({ operation_id: 'nonexistent', dry_run: true });
      expect(result.success).toBe(false);
      expect(result.code).toBe('OPERATION_NOT_FOUND');
    });

    it('returns error when operation belongs to different vault', async () => {
      (getOperation as ReturnType<typeof vi.fn>).mockReturnValue({
        id: 'op_1',
        type: 'store',
        vaultAlias: 'other-vault',
        filesCreated: ['note.md'],
        filesModified: [],
        filesDeleted: [],
      });

      const result = await undoHandler({ operation_id: 'op_1', dry_run: true });
      expect(result.success).toBe(false);
      expect(result.code).toBe('VAULT_MISMATCH');
    });

    it('returns error when vault is read-only', async () => {
      mockRegistry.isReadOnly.mockReturnValue(true);
      (getOperation as ReturnType<typeof vi.fn>).mockReturnValue({
        id: 'op_1',
        type: 'store',
        vaultAlias: 'test',
        filesCreated: ['note.md'],
        filesModified: [],
        filesDeleted: [],
      });

      const result = await undoHandler({ operation_id: 'op_1', dry_run: false });
      expect(result.success).toBe(false);
      expect(result.code).toBe('VAULT_READ_ONLY');
    });

    it('returns error when vault not found', async () => {
      mockRegistry.getDefaultVault.mockReturnValue(null);

      const result = await undoHandler({ list: false, operation_id: 'op_1' });
      expect(result.success).toBe(false);
      expect(result.code).toBe('VAULT_NOT_FOUND');
    });

    it('previews undo for improve operation in dry_run', async () => {
      (getOperation as ReturnType<typeof vi.fn>).mockReturnValue({
        id: 'op_improve',
        type: 'improve',
        vaultAlias: 'test',
        filesCreated: [],
        filesModified: ['research/note.md'],
        filesDeleted: [],
      });

      (listVersions as ReturnType<typeof vi.fn>).mockResolvedValue([
        { version: 2, timestamp: '2025-01-02' },
      ]);
      (getVersionContent as ReturnType<typeof vi.fn>).mockResolvedValue('old content');

      const result = await undoHandler({ operation_id: 'op_improve', dry_run: true });
      expect(result.success).toBe(true);
      if (!result.success) return;

      const data = result.data as { files_restored: string[]; dry_run: boolean };
      expect(data.dry_run).toBe(true);
      expect(data.files_restored).toContain('research/note.md');
    });
  });

  describe('validation', () => {
    it('returns validation error for invalid input', async () => {
      const result = await undoHandler({ limit: 'abc' });
      expect(result.success).toBe(false);
      expect(result.code).toBe('VALIDATION_ERROR');
    });
  });
});
