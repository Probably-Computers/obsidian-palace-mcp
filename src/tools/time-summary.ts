/**
 * palace_time_summary tool (Phase 030)
 *
 * Aggregate and report on time entries with filtering and grouping.
 */

import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolResult } from '../types/index.js';
import { logger } from '../utils/logger.js';
import {
  resolveVaultParam,
  getVaultResultInfo,
} from '../utils/vault-param.js';
import { getIndexManager } from '../services/index/manager.js';
import { aggregateTime } from '../services/time/aggregator.js';
import type { TimeFilter } from '../services/time/aggregator.js';
import { TIME_CATEGORIES } from '../services/time/storage.js';

const GROUP_BY_OPTIONS = ['project', 'client', 'date', 'category'] as const;

const inputSchema = z.object({
  project: z.string().optional(),
  client: z.string().optional(),
  category: z.enum(TIME_CATEGORIES).optional(),
  billable: z.boolean().optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional(),
  group_by: z.enum(GROUP_BY_OPTIONS).optional().default('project'),
  include_entries: z.boolean().optional().default(false),
  vault: z.string().optional(),
});

export const timeSummaryTool: Tool = {
  name: 'palace_time_summary',
  description: `Aggregate and report on logged time entries. Filter by project, client, category, date range, or billable status. Group results by project, client, date, or category.`,
  inputSchema: {
    type: 'object',
    properties: {
      project: {
        type: 'string',
        description: 'Filter by project name',
      },
      client: {
        type: 'string',
        description: 'Filter by client name',
      },
      category: {
        type: 'string',
        description: 'Filter by time category',
        enum: [...TIME_CATEGORIES],
      },
      billable: {
        type: 'boolean',
        description: 'Filter by billable status',
      },
      date_from: {
        type: 'string',
        description: 'Start date filter (YYYY-MM-DD)',
      },
      date_to: {
        type: 'string',
        description: 'End date filter (YYYY-MM-DD)',
      },
      group_by: {
        type: 'string',
        description: 'Group results by dimension (default: project)',
        enum: [...GROUP_BY_OPTIONS],
      },
      include_entries: {
        type: 'boolean',
        description: 'Include individual time entries in each group (default: false)',
      },
      vault: {
        type: 'string',
        description: 'Vault alias or path (defaults to default vault)',
      },
    },
  },
};

export async function timeSummaryHandler(args: Record<string, unknown>): Promise<ToolResult> {
  const parseResult = inputSchema.safeParse(args);
  if (!parseResult.success) {
    return {
      success: false,
      error: parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      code: 'VALIDATION_ERROR',
    };
  }

  const input = parseResult.data;

  try {
    const vault = resolveVaultParam(input.vault);
    const manager = getIndexManager();
    const db = await manager.getIndex(vault.alias);

    const filters: TimeFilter = {};
    if (input.project) filters.project = input.project;
    if (input.client) filters.client = input.client;
    if (input.category) filters.category = input.category;
    if (input.billable !== undefined) filters.billable = input.billable;
    if (input.date_from) filters.date_from = input.date_from;
    if (input.date_to) filters.date_to = input.date_to;

    const result = await aggregateTime(
      db,
      vault.path,
      filters,
      input.group_by,
      input.include_entries,
      vault.config.ignore
    );

    logger.info(`Time summary: ${result.total_entries} entries, ${result.grand_total_formatted} total`);

    return {
      success: true,
      data: {
        ...getVaultResultInfo(vault),
        ...result,
        group_by: input.group_by,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      code: 'TIME_SUMMARY_ERROR',
    };
  }
}
