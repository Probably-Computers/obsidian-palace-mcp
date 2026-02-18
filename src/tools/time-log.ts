/**
 * palace_time_log tool (Phase 030)
 *
 * Manually log time entries against projects.
 */

import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolResult } from '../types/index.js';
import { logger } from '../utils/logger.js';
import {
  resolveVaultParam,
  enforceWriteAccess,
  getVaultResultInfo,
} from '../utils/vault-param.js';
import { getIndexManager } from '../services/index/manager.js';
import { createTimeEntry, parseDuration, TIME_CATEGORIES } from '../services/time/storage.js';
import type { TimeEntryData } from '../services/time/storage.js';

const inputSchema = z.object({
  project: z.string().min(1, 'Project is required'),
  duration: z.union([z.string(), z.number()]).describe('Duration: minutes (120), hours (2h, 2.5h), or hours+minutes (2h 30m)'),
  description: z.string().min(1, 'Description is required'),
  client: z.string().optional(),
  category: z.enum(TIME_CATEGORIES).optional(),
  billable: z.boolean().optional().default(true),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
  work_items: z.array(z.string()).optional(),
  session_id: z.string().optional(),
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  vault: z.string().optional(),
});

export const timeLogTool: Tool = {
  name: 'palace_time_log',
  description: `Log time spent on a project. Creates a time entry note with project, duration, and description. Supports flexible duration formats (120, "2h", "2h 30m"). Date defaults to today but can be backdated.`,
  inputSchema: {
    type: 'object',
    properties: {
      project: {
        type: 'string',
        description: 'Project name (required)',
      },
      duration: {
        oneOf: [{ type: 'string' }, { type: 'number' }],
        description: 'Duration: minutes (120), hours ("2h", "2.5h"), or hours+minutes ("2h 30m")',
      },
      description: {
        type: 'string',
        description: 'What was worked on',
      },
      client: {
        type: 'string',
        description: 'Client name',
      },
      category: {
        type: 'string',
        description: 'Time category',
        enum: [...TIME_CATEGORIES],
      },
      billable: {
        type: 'boolean',
        description: 'Whether this time is billable (default: true)',
      },
      date: {
        type: 'string',
        description: 'Date in YYYY-MM-DD format (defaults to today, allows backdating)',
      },
      work_items: {
        type: 'array',
        items: { type: 'string' },
        description: 'Wiki-link targets for related notes',
      },
      session_id: {
        type: 'string',
        description: 'Link to a session ID',
      },
      start_time: {
        type: 'string',
        description: 'ISO 8601 start time (optional, for precise records)',
      },
      end_time: {
        type: 'string',
        description: 'ISO 8601 end time (optional, for precise records)',
      },
      vault: {
        type: 'string',
        description: 'Vault alias or path (defaults to default vault)',
      },
    },
    required: ['project', 'duration', 'description'],
  },
};

export async function timeLogHandler(args: Record<string, unknown>): Promise<ToolResult> {
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
    // Parse duration
    const durationMinutes = parseDuration(input.duration);

    // Resolve vault
    const vault = resolveVaultParam(input.vault);
    enforceWriteAccess(vault);

    // Get database
    const manager = getIndexManager();
    const db = await manager.getIndex(vault.alias);

    // Default date to today
    const date = input.date ?? new Date().toISOString().split('T')[0]!;

    // Create the time entry
    const entryData: TimeEntryData = {
      project: input.project,
      duration_minutes: durationMinutes,
      description: input.description,
      date,
      billable: input.billable,
      source: 'manual',
    };
    if (input.client) entryData.client = input.client;
    if (input.category) entryData.category = input.category;
    if (input.work_items) entryData.work_items = input.work_items;
    if (input.session_id) entryData.session_id = input.session_id;
    if (input.start_time) entryData.start_time = input.start_time;
    if (input.end_time) entryData.end_time = input.end_time;

    const result = await createTimeEntry(
      entryData,
      vault.path,
      db,
      vault.config.ignore
    );

    logger.info(`Time logged: ${result.duration_formatted} for ${input.project}`);

    return {
      success: true,
      data: {
        ...getVaultResultInfo(vault),
        path: result.path,
        project: input.project,
        duration_minutes: durationMinutes,
        duration_formatted: result.duration_formatted,
        date,
        category: input.category ?? 'other',
        billable: input.billable,
        message: `Logged ${result.duration_formatted} for "${input.project}"`,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      code: 'TIME_LOG_ERROR',
    };
  }
}
