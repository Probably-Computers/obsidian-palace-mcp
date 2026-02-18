/**
 * palace_project_summary tool (Phase 031)
 *
 * Load project context at brief/standard/deep depth for AI session resume.
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
import { loadProjectContext, loadAllProjectsBrief } from '../services/project/index.js';

const inputSchema = z.object({
  project: z.string().min(1, 'Project name is required'),
  vault: z.string().optional(),
  depth: z.enum(['brief', 'standard', 'deep']).optional().default('standard'),
  lookback_days: z.number().min(1).max(365).optional().default(7),
  include_time: z.boolean().optional().default(true),
});

export const projectSummaryTool: Tool = {
  name: 'palace_project_summary',
  description:
    'Load project context for AI session resume. Returns project status, work items, recent changes, time tracking, and more. Use depth parameter to control detail level: brief (~200-500 tokens), standard (~2K-5K tokens), deep (~8K-20K tokens). Pass project="*" for multi-project dashboard.',
  inputSchema: {
    type: 'object',
    required: ['project'],
    properties: {
      project: {
        type: 'string',
        description: 'Project name (or "*" / "all" for multi-project dashboard)',
      },
      vault: {
        type: 'string',
        description: 'Vault alias or path (defaults to default vault)',
      },
      depth: {
        type: 'string',
        description: 'Context depth: brief, standard (default), or deep',
        enum: ['brief', 'standard', 'deep'],
      },
      lookback_days: {
        type: 'number',
        description: 'Days to look back for recent changes (default: 7)',
      },
      include_time: {
        type: 'boolean',
        description: 'Include time tracking summary (default: true)',
      },
    },
  },
};

export async function projectSummaryHandler(args: Record<string, unknown>): Promise<ToolResult> {
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

    // Multi-project mode
    if (input.project === '*' || input.project.toLowerCase() === 'all') {
      const projects = await loadAllProjectsBrief(
        db,
        vault.path,
        vault.config.ignore,
      );

      logger.info(`Project dashboard: ${projects.length} projects found`);

      return {
        success: true,
        data: {
          ...getVaultResultInfo(vault),
          mode: 'dashboard',
          project_count: projects.length,
          projects,
        },
      };
    }

    // Single project mode
    const context = await loadProjectContext(
      input.project,
      db,
      vault.path,
      {
        depth: input.depth,
        lookback_days: input.lookback_days,
        include_time: input.include_time,
      },
      vault.config.ignore,
    );

    const found = !!(context.hub_path);
    logger.info(`Project summary [${input.depth}]: ${input.project} (found: ${found})`);

    return {
      success: true,
      data: {
        ...getVaultResultInfo(vault),
        mode: 'single',
        depth: input.depth,
        found,
        ...context,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      code: 'PROJECT_SUMMARY_ERROR',
    };
  }
}
