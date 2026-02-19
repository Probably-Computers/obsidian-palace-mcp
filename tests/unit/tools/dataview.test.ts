/**
 * Tests for palace_dataview tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/services/dataview/index.js', () => ({
  parseDQL: vi.fn(),
  DQLParseError: class DQLParseError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'DQLParseError';
    }
  },
  executeQueryWithTags: vi.fn(),
  formatResult: vi.fn(),
}));

vi.mock('../../../src/services/index/index.js', () => ({
  getIndexManager: vi.fn(),
}));

vi.mock('../../../src/utils/vault-param.js', () => ({
  resolveVaultParam: vi.fn(),
  getVaultResultInfo: vi.fn(),
}));

vi.mock('../../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { dataviewHandler } from '../../../src/tools/dataview.js';
import { parseDQL, DQLParseError, executeQueryWithTags, formatResult } from '../../../src/services/dataview/index.js';
import { getIndexManager } from '../../../src/services/index/index.js';
import { resolveVaultParam, getVaultResultInfo } from '../../../src/utils/vault-param.js';

const mockVault = {
  alias: 'test',
  path: '/tmp/vault',
  mode: 'rw' as const,
  config: { ignore: { patterns: [] } },
  indexPath: '/tmp/vault/.palace/index.sqlite',
};

const mockDb = {};

describe('palace_dataview tool', () => {
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
    (parseDQL as ReturnType<typeof vi.fn>).mockReturnValue({
      type: 'TABLE',
      fields: ['title'],
      from: 'research',
    });
    (executeQueryWithTags as ReturnType<typeof vi.fn>).mockReturnValue({
      total: 2,
      fields: ['title'],
      rows: [{ title: 'Note 1' }, { title: 'Note 2' }],
    });
    (formatResult as ReturnType<typeof vi.fn>).mockReturnValue({
      output: 'formatted output',
    });
  });

  it('returns validation error when query is missing', async () => {
    const result = await dataviewHandler({});
    expect(result.success).toBe(false);
    expect(result.code).toBe('VALIDATION_ERROR');
  });

  it('executes a DQL query successfully', async () => {
    const result = await dataviewHandler({
      query: 'TABLE title FROM "research"',
    });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.total).toBe(2);
    expect(result.data.format).toBe('json');
    expect(result.data.rows).toBeDefined();
    expect(parseDQL).toHaveBeenCalledWith('TABLE title FROM "research"');
  });

  it('returns PARSE_ERROR for invalid DQL', async () => {
    (parseDQL as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new DQLParseError('Unexpected token');
    });

    const result = await dataviewHandler({ query: 'INVALID QUERY' });
    expect(result.success).toBe(false);
    expect(result.code).toBe('PARSE_ERROR');
    expect(result.error).toContain('DQL syntax error');
  });

  it('passes format to formatResult', async () => {
    await dataviewHandler({ query: 'TABLE title', format: 'table' });
    expect(formatResult).toHaveBeenCalledWith(
      expect.anything(),
      'table'
    );
  });

  it('omits rows for non-json format', async () => {
    const result = await dataviewHandler({ query: 'TABLE title', format: 'table' });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.rows).toBeUndefined();
  });

  it('handles general errors gracefully', async () => {
    (resolveVaultParam as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('Vault error');
    });

    const result = await dataviewHandler({ query: 'TABLE title' });
    expect(result.success).toBe(false);
    expect(result.code).toBe('DATAVIEW_ERROR');
  });
});
