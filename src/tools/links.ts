/**
 * palace_links - Get backlinks and outlinks for a note
 */

import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolResult } from '../types/index.js';
import {
  getOutgoingLinks,
  getIncomingLinks,
  traverseGraph,
  getNoteMetadataByPath,
} from '../services/graph/index.js';
import { resolveVaultParam, getVaultResultInfo } from '../utils/vault-param.js';

// Input schema
const inputSchema = z.object({
  path: z.string().min(1, 'Path is required'),
  direction: z.enum(['incoming', 'outgoing', 'both']).optional().default('both'),
  depth: z.number().min(1).max(5).optional().default(1),
  vault: z.string().optional().describe('Vault alias or path. Defaults to the default vault.'),
});

// Tool definition
export const linksTool: Tool = {
  name: 'palace_links',
  description:
    'Get incoming links (backlinks) and/or outgoing links for a note. Supports multi-hop traversal with depth parameter.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the note (relative to vault root)',
      },
      direction: {
        type: 'string',
        enum: ['incoming', 'outgoing', 'both'],
        description:
          'Link direction: incoming (backlinks), outgoing (links from note), or both (default: both)',
      },
      depth: {
        type: 'number',
        description:
          'Traversal depth for multi-hop links (1-5, default: 1). Depth 1 returns direct links only.',
      },
      vault: {
        type: 'string',
        description: 'Vault alias or path to search in (defaults to default vault)',
      },
    },
    required: ['path'],
  },
};

// Tool handler
export async function linksHandler(args: Record<string, unknown>): Promise<ToolResult> {
  // Validate input
  const parseResult = inputSchema.safeParse(args);
  if (!parseResult.success) {
    return {
      success: false,
      error: parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      code: 'VALIDATION_ERROR',
    };
  }

  const { path, direction, depth, vault: vaultParam } = parseResult.data;

  try {
    // Resolve vault
    const vault = resolveVaultParam(vaultParam);

    // Verify note exists
    // Note: Currently uses shared index, multi-vault indexing will be added in Phase 010
    const noteMeta = getNoteMetadataByPath(path);
    if (!noteMeta) {
      return {
        success: false,
        error: `Note not found: ${path}`,
        code: 'NOT_FOUND',
      };
    }

    // For depth 1, use simple link queries
    if (depth === 1) {
      const result: {
        path: string;
        title: string;
        incoming?: ReturnType<typeof getIncomingLinks>;
        outgoing?: ReturnType<typeof getOutgoingLinks>;
      } = {
        path: noteMeta.path,
        title: noteMeta.title,
      };

      if (direction === 'incoming' || direction === 'both') {
        result.incoming = getIncomingLinks(path);
      }

      if (direction === 'outgoing' || direction === 'both') {
        result.outgoing = getOutgoingLinks(path);
      }

      return {
        success: true,
        data: {
          ...getVaultResultInfo(vault),
          ...result,
          depth: 1,
          incomingCount: result.incoming?.length ?? 0,
          outgoingCount: result.outgoing?.length ?? 0,
        },
      };
    }

    // For depth > 1, use traversal
    const traversalResults = traverseGraph(path, direction, depth);

    // Group results by depth
    const byDepth: Record<number, typeof traversalResults> = {};
    for (const result of traversalResults) {
      const depthKey = result.depth;
      if (!byDepth[depthKey]) {
        byDepth[depthKey] = [];
      }
      byDepth[depthKey]!.push(result);
    }

    return {
      success: true,
      data: {
        ...getVaultResultInfo(vault),
        path: noteMeta.path,
        title: noteMeta.title,
        direction,
        maxDepth: depth,
        totalResults: traversalResults.length,
        resultsByDepth: byDepth,
        results: traversalResults,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      code: 'LINKS_ERROR',
    };
  }
}
