/**
 * Tests for palace_project_summary tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/utils/vault-param.js', () => ({
  resolveVaultParam: vi.fn(),
  getVaultResultInfo: vi.fn(),
}));

vi.mock('../../../src/services/index/manager.js', () => ({
  getIndexManager: vi.fn(),
}));

vi.mock('../../../src/services/project/index.js', () => ({
  loadProjectContext: vi.fn(),
  loadAllProjectsBrief: vi.fn(),
}));

vi.mock('../../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { projectSummaryHandler } from '../../../src/tools/project-summary.js';
import { resolveVaultParam, getVaultResultInfo } from '../../../src/utils/vault-param.js';
import { getIndexManager } from '../../../src/services/index/manager.js';
import { loadProjectContext, loadAllProjectsBrief } from '../../../src/services/project/index.js';

const mockVault = {
  alias: 'test',
  path: '/tmp/vault',
  mode: 'rw' as const,
  config: {
    ignore: { patterns: [], marker_file: '.palace-ignore', frontmatter_key: 'palace_ignore' },
  },
};

const mockDb = {};

describe('palace_project_summary tool', () => {
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

  it('returns validation error when project is missing', async () => {
    const result = await projectSummaryHandler({});
    expect(result.success).toBe(false);
    expect(result.code).toBe('VALIDATION_ERROR');
  });

  it('returns validation error for empty project', async () => {
    const result = await projectSummaryHandler({ project: '' });
    expect(result.success).toBe(false);
    expect(result.code).toBe('VALIDATION_ERROR');
  });

  it('returns single project context at standard depth', async () => {
    (loadProjectContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      project: 'MyProject',
      hub_path: 'projects/MyProject/MyProject.md',
      status: 'in_progress',
      priority: 'high',
      work_items: { total: 10, done: 5, in_progress: 3, blocked: 2 },
      blockers: ['client review'],
    });

    const result = await projectSummaryHandler({ project: 'MyProject' });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.mode).toBe('single');
    expect(result.data.depth).toBe('standard');
    expect(result.data.found).toBe(true);
    expect(result.data.project).toBe('MyProject');
    expect(result.data.status).toBe('in_progress');
  });

  it('supports brief depth', async () => {
    (loadProjectContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      project: 'MyProject',
      hub_path: 'projects/MyProject/MyProject.md',
    });

    await projectSummaryHandler({ project: 'MyProject', depth: 'brief' });

    expect(loadProjectContext).toHaveBeenCalledWith(
      'MyProject',
      mockDb,
      '/tmp/vault',
      expect.objectContaining({ depth: 'brief' }),
      mockVault.config.ignore
    );
  });

  it('supports deep depth with custom lookback', async () => {
    (loadProjectContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      project: 'MyProject',
      hub_path: null,
    });

    await projectSummaryHandler({
      project: 'MyProject',
      depth: 'deep',
      lookback_days: 30,
      include_time: false,
    });

    expect(loadProjectContext).toHaveBeenCalledWith(
      'MyProject',
      mockDb,
      '/tmp/vault',
      expect.objectContaining({
        depth: 'deep',
        lookback_days: 30,
        include_time: false,
      }),
      mockVault.config.ignore
    );
  });

  it('returns dashboard mode for wildcard project', async () => {
    (loadAllProjectsBrief as ReturnType<typeof vi.fn>).mockResolvedValue([
      { project: 'Project A', status: 'in_progress' },
      { project: 'Project B', status: 'done' },
    ]);

    const result = await projectSummaryHandler({ project: '*' });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.mode).toBe('dashboard');
    expect(result.data.project_count).toBe(2);
    expect(result.data.projects).toHaveLength(2);
  });

  it('returns dashboard mode for "all" project', async () => {
    (loadAllProjectsBrief as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await projectSummaryHandler({ project: 'all' });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.mode).toBe('dashboard');
    expect(loadAllProjectsBrief).toHaveBeenCalled();
  });

  it('reports found=false when no hub found', async () => {
    (loadProjectContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      project: 'Unknown',
      hub_path: null,
    });

    const result = await projectSummaryHandler({ project: 'Unknown' });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.found).toBe(false);
  });

  it('handles errors gracefully', async () => {
    (loadProjectContext as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB error'));

    const result = await projectSummaryHandler({ project: 'MyProject' });
    expect(result.success).toBe(false);
    expect(result.code).toBe('PROJECT_SUMMARY_ERROR');
  });
});
