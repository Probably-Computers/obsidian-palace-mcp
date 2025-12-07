/**
 * palace_orphans - Find disconnected notes in the vault
 */

import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolResult, OrphanType } from '../types/index.js';
import { findOrphans } from '../services/graph/index.js';
import { resolveVaultParam, getVaultResultInfo } from '../utils/vault-param.js';

// Input schema
const inputSchema = z.object({
  type: z.enum(['no_incoming', 'no_outgoing', 'isolated']).optional().default('isolated'),
  path: z.string().optional(),
  limit: z.number().min(1).max(100).optional().default(50),
  vault: z.string().optional().describe('Vault alias or path. Defaults to the default vault.'),
});

// Tool definition
export const orphansTool: Tool = {
  name: 'palace_orphans',
  description:
    'Find orphan notes: notes with no incoming links (backlinks), no outgoing links, or completely isolated (no links at all).',
  inputSchema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['no_incoming', 'no_outgoing', 'isolated'],
        description:
          'Type of orphan: no_incoming (no backlinks), no_outgoing (no outgoing links), isolated (no links at all). Default: isolated',
      },
      path: {
        type: 'string',
        description: 'Optional path prefix to limit search to a specific directory',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results (default: 50, max: 100)',
      },
      vault: {
        type: 'string',
        description: 'Vault alias or path to search in (defaults to default vault)',
      },
    },
  },
};

// Tool handler
export async function orphansHandler(args: Record<string, unknown>): Promise<ToolResult> {
  // Validate input
  const parseResult = inputSchema.safeParse(args);
  if (!parseResult.success) {
    return {
      success: false,
      error: parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      code: 'VALIDATION_ERROR',
    };
  }

  const { type, path, limit, vault: vaultParam } = parseResult.data;

  try {
    // Resolve vault
    const vault = resolveVaultParam(vaultParam);

    // Find orphans
    // Note: Currently uses shared index, multi-vault indexing will be added in Phase 010
    const orphans = findOrphans(type as OrphanType, path);

    // Limit results
    const limited = orphans.slice(0, limit);

    // Build description based on type
    let description: string;
    switch (type) {
      case 'no_incoming':
        description = 'Notes with no backlinks (no other notes link to them)';
        break;
      case 'no_outgoing':
        description = 'Notes with no outgoing links (they link to no other notes)';
        break;
      case 'isolated':
        description = 'Completely isolated notes (no incoming or outgoing links)';
        break;
    }

    return {
      success: true,
      data: {
        ...getVaultResultInfo(vault),
        type,
        description,
        count: limited.length,
        total: orphans.length,
        hasMore: orphans.length > limit,
        orphans: limited,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      code: 'ORPHANS_ERROR',
    };
  }
}
