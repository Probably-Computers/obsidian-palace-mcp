/**
 * Tests for palace_time_log tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/utils/vault-param.js', () => ({
  resolveVaultParam: vi.fn(),
  enforceWriteAccess: vi.fn(),
  getVaultResultInfo: vi.fn(),
}));

vi.mock('../../../src/services/index/manager.js', () => ({
  getIndexManager: vi.fn(),
}));

vi.mock('../../../src/services/time/storage.js', () => ({
  createTimeEntry: vi.fn(),
  parseDuration: vi.fn(),
  TIME_CATEGORIES: [
    'development',
    'research',
    'meetings',
    'review',
    'documentation',
    'design',
    'admin',
    'business_dev',
    'professional_dev',
    'other',
  ] as const,
}));

vi.mock('../../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { timeLogHandler } from '../../../src/tools/time-log.js';
import { resolveVaultParam, enforceWriteAccess, getVaultResultInfo } from '../../../src/utils/vault-param.js';
import { getIndexManager } from '../../../src/services/index/manager.js';
import { createTimeEntry, parseDuration } from '../../../src/services/time/storage.js';

const mockVault = {
  alias: 'test',
  path: '/tmp/vault',
  mode: 'rw' as const,
  config: {
    ignore: { patterns: [], marker_file: '.palace-ignore', frontmatter_key: 'palace_ignore' },
  },
};

const mockDb = {};

describe('palace_time_log tool', () => {
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
    (parseDuration as ReturnType<typeof vi.fn>).mockReturnValue(120);
    (createTimeEntry as ReturnType<typeof vi.fn>).mockResolvedValue({
      path: 'time/2026/02/2026-02-19 - MyProject - development.md',
      duration_formatted: '2h 0m',
    });
  });

  it('returns validation error when project is missing', async () => {
    const result = await timeLogHandler({ duration: '2h', description: 'test' });
    expect(result.success).toBe(false);
    expect(result.code).toBe('VALIDATION_ERROR');
  });

  it('returns validation error when duration is missing', async () => {
    const result = await timeLogHandler({ project: 'MyProject', description: 'test' });
    expect(result.success).toBe(false);
    expect(result.code).toBe('VALIDATION_ERROR');
  });

  it('returns validation error when description is missing', async () => {
    const result = await timeLogHandler({ project: 'MyProject', duration: '2h' });
    expect(result.success).toBe(false);
    expect(result.code).toBe('VALIDATION_ERROR');
  });

  it('logs time entry successfully', async () => {
    const result = await timeLogHandler({
      project: 'MyProject',
      duration: '2h',
      description: 'Worked on feature X',
    });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(parseDuration).toHaveBeenCalledWith('2h');
    expect(createTimeEntry).toHaveBeenCalled();
    expect(result.data.project).toBe('MyProject');
    expect(result.data.duration_minutes).toBe(120);
    expect(result.data.duration_formatted).toBe('2h 0m');
    expect(result.data.message).toContain('MyProject');
  });

  it('passes optional fields correctly', async () => {
    await timeLogHandler({
      project: 'MyProject',
      duration: 90,
      description: 'Meeting',
      client: 'Acme Corp',
      category: 'meetings',
      billable: false,
      date: '2026-02-15',
      work_items: ['[[Task 1]]'],
      session_id: 'session_abc',
      start_time: '2026-02-15T10:00:00Z',
      end_time: '2026-02-15T11:30:00Z',
    });

    expect(createTimeEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        project: 'MyProject',
        client: 'Acme Corp',
        category: 'meetings',
        billable: false,
        date: '2026-02-15',
        work_items: ['[[Task 1]]'],
        session_id: 'session_abc',
        start_time: '2026-02-15T10:00:00Z',
        end_time: '2026-02-15T11:30:00Z',
      }),
      '/tmp/vault',
      mockDb,
      mockVault.config.ignore
    );
  });

  it('enforces write access', async () => {
    await timeLogHandler({
      project: 'MyProject',
      duration: '1h',
      description: 'test',
    });

    expect(enforceWriteAccess).toHaveBeenCalledWith(mockVault);
  });

  it('returns validation error for invalid date format', async () => {
    const result = await timeLogHandler({
      project: 'MyProject',
      duration: '1h',
      description: 'test',
      date: 'not-a-date',
    });
    expect(result.success).toBe(false);
    expect(result.code).toBe('VALIDATION_ERROR');
  });

  it('handles errors gracefully', async () => {
    (parseDuration as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('Invalid duration format');
    });

    const result = await timeLogHandler({
      project: 'MyProject',
      duration: 'invalid',
      description: 'test',
    });
    expect(result.success).toBe(false);
    expect(result.code).toBe('TIME_LOG_ERROR');
  });
});
