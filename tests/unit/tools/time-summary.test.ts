/**
 * Tests for palace_time_summary tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/utils/vault-param.js', () => ({
  resolveVaultParam: vi.fn(),
  getVaultResultInfo: vi.fn(),
}));

vi.mock('../../../src/services/index/manager.js', () => ({
  getIndexManager: vi.fn(),
}));

vi.mock('../../../src/services/time/aggregator.js', () => ({
  aggregateTime: vi.fn(),
}));

vi.mock('../../../src/services/time/storage.js', () => ({
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

import { timeSummaryHandler } from '../../../src/tools/time-summary.js';
import { resolveVaultParam, getVaultResultInfo } from '../../../src/utils/vault-param.js';
import { getIndexManager } from '../../../src/services/index/manager.js';
import { aggregateTime } from '../../../src/services/time/aggregator.js';

const mockVault = {
  alias: 'test',
  path: '/tmp/vault',
  mode: 'rw' as const,
  config: {
    ignore: { patterns: [], marker_file: '.palace-ignore', frontmatter_key: 'palace_ignore' },
  },
};

const mockDb = {};

describe('palace_time_summary tool', () => {
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
  });

  it('returns aggregated time with defaults', async () => {
    (aggregateTime as ReturnType<typeof vi.fn>).mockResolvedValue({
      groups: [
        { key: 'MyProject', total_minutes: 300, total_formatted: '5h 0m', entry_count: 3 },
      ],
      grand_total_minutes: 300,
      grand_total_formatted: '5h 0m',
      total_entries: 3,
      filters_applied: {},
    });

    const result = await timeSummaryHandler({});
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.grand_total_minutes).toBe(300);
    expect(result.data.grand_total_formatted).toBe('5h 0m');
    expect(result.data.groups).toHaveLength(1);
    expect(result.data.group_by).toBe('project');
  });

  it('passes filters correctly', async () => {
    (aggregateTime as ReturnType<typeof vi.fn>).mockResolvedValue({
      groups: [],
      grand_total_minutes: 0,
      grand_total_formatted: '0m',
      total_entries: 0,
      filters_applied: { project: 'MyProject', billable: true },
    });

    await timeSummaryHandler({
      project: 'MyProject',
      client: 'Acme',
      category: 'development',
      billable: true,
      date_from: '2026-02-01',
      date_to: '2026-02-28',
      group_by: 'date',
      include_entries: true,
    });

    expect(aggregateTime).toHaveBeenCalledWith(
      mockDb,
      '/tmp/vault',
      expect.objectContaining({
        project: 'MyProject',
        client: 'Acme',
        category: 'development',
        billable: true,
        date_from: '2026-02-01',
        date_to: '2026-02-28',
      }),
      'date',
      true,
      mockVault.config.ignore
    );
  });

  it('returns validation error for invalid date format', async () => {
    const result = await timeSummaryHandler({ date_from: 'not-a-date' });
    expect(result.success).toBe(false);
    expect(result.code).toBe('VALIDATION_ERROR');
  });

  it('handles errors gracefully', async () => {
    (aggregateTime as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Query failed'));

    const result = await timeSummaryHandler({});
    expect(result.success).toBe(false);
    expect(result.code).toBe('TIME_SUMMARY_ERROR');
  });
});
