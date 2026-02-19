/**
 * Tests for palace_migrate tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/services/migrate/inspector.js', () => ({
  inspectVault: vi.fn(),
}));

vi.mock('../../../src/services/migrate/executor.js', () => ({
  executeMigration: vi.fn(),
}));

vi.mock('../../../src/services/index/index.js', () => ({
  getIndexManager: vi.fn(),
}));

vi.mock('../../../src/utils/vault-param.js', () => ({
  resolveVaultParam: vi.fn(),
  enforceWriteAccess: vi.fn(),
  getVaultResultInfo: vi.fn(),
}));

import { migrateHandler } from '../../../src/tools/migrate.js';
import { inspectVault } from '../../../src/services/migrate/inspector.js';
import { executeMigration } from '../../../src/services/migrate/executor.js';
import { getIndexManager } from '../../../src/services/index/index.js';
import { resolveVaultParam, enforceWriteAccess, getVaultResultInfo } from '../../../src/utils/vault-param.js';

const mockVault = {
  alias: 'test',
  path: '/tmp/vault',
  mode: 'rw' as const,
  config: { ignore: { patterns: [] } },
  indexPath: '/tmp/vault/.palace/index.sqlite',
};

const mockDb = {};

describe('palace_migrate tool', () => {
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
    (inspectVault as ReturnType<typeof vi.fn>).mockResolvedValue({
      notes_scanned: 50,
      issues: [
        {
          path: 'research/Architecture.md',
          type: 'unprefixed_children',
          description: 'Child note not prefixed with hub name',
          suggestion: 'Rename to Kubernetes - Architecture.md',
        },
        {
          path: 'commands/note.md',
          type: 'naming_inconsistencies',
          description: 'Duplicate filename',
          suggestion: 'Consider renaming',
        },
      ],
      summary: { unprefixed_children: 1, naming_inconsistencies: 1 },
    });
  });

  it('inspects vault in dry_run mode (default)', async () => {
    const result = await migrateHandler({});
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.dry_run).toBe(true);
    expect(result.data.notes_scanned).toBe(50);
    expect(result.data.issues_found).toBe(2);
    expect(result.data.issues).toHaveLength(2);
    expect(result.data.issues[0].fixable).toBe(true);
    expect(result.data.issues[1].fixable).toBe(false);
  });

  it('passes categories filter to inspector', async () => {
    await migrateHandler({ categories: ['unprefixed_children'] });
    expect(inspectVault).toHaveBeenCalledWith(mockDb, '/tmp/vault', ['unprefixed_children']);
  });

  it('applies limit to issues', async () => {
    const result = await migrateHandler({ limit: 1 });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.issues).toHaveLength(1);
  });

  it('executes migration when dry_run is false', async () => {
    (executeMigration as ReturnType<typeof vi.fn>).mockResolvedValue({
      operation_id: 'op_migrate_123',
      issues_fixed: 1,
      issues_skipped: 0,
      fixes: [{ path: 'Kubernetes - Architecture.md', action: 'renamed' }],
      skipped: [],
      errors: [],
    });

    const result = await migrateHandler({ dry_run: false });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.dry_run).toBe(false);
    expect(result.data.operation_id).toBe('op_migrate_123');
    expect(result.data.issues_fixed).toBe(1);
    expect(enforceWriteAccess).toHaveBeenCalledWith(mockVault);
  });

  it('only passes fixable issues to executor', async () => {
    (executeMigration as ReturnType<typeof vi.fn>).mockResolvedValue({
      operation_id: 'op_123',
      issues_fixed: 1,
      issues_skipped: 0,
      fixes: [],
      skipped: [],
      errors: [],
    });

    await migrateHandler({ dry_run: false });
    // Only unprefixed_children should be passed (not naming_inconsistencies)
    const callArgs = (executeMigration as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[0]).toHaveLength(1);
    expect(callArgs[0][0].type).toBe('unprefixed_children');
  });

  it('handles errors gracefully', async () => {
    (resolveVaultParam as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('Vault error');
    });

    const result = await migrateHandler({});
    expect(result.success).toBe(false);
    expect(result.code).toBe('MIGRATE_ERROR');
  });
});
