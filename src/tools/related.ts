/**
 * palace_related - Find notes related to a given note
 */

import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolResult, RelatednessMethod } from '../types/index.js';
import { findRelatedNotes, getNoteMetadataByPath } from '../services/graph/index.js';
import { getIndexManager } from '../services/index/index.js';
import { resolveVaultParam, getVaultResultInfo } from '../utils/vault-param.js';

// Input schema
const inputSchema = z.object({
  path: z.string().min(1, 'Path is required'),
  method: z.enum(['links', 'tags', 'both']).optional().default('both'),
  limit: z.number().min(1).max(50).optional().default(10),
  vault: z.string().optional().describe('Vault alias or path. Defaults to the default vault.'),
});

// Tool definition
export const relatedTool: Tool = {
  name: 'palace_related',
  description:
    'Find notes related to a given note based on shared links, shared tags, or both. Returns a ranked list of related notes with similarity scores.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the source note (relative to vault root)',
      },
      method: {
        type: 'string',
        enum: ['links', 'tags', 'both'],
        description:
          'Method to find related notes: links (shared link targets), tags (shared tags), or both (combined). Default: both',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results (default: 10, max: 50)',
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
export async function relatedHandler(args: Record<string, unknown>): Promise<ToolResult> {
  // Validate input
  const parseResult = inputSchema.safeParse(args);
  if (!parseResult.success) {
    return {
      success: false,
      error: parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      code: 'VALIDATION_ERROR',
    };
  }

  const { path, method, limit, vault: vaultParam } = parseResult.data;

  try {
    // Resolve vault and get database
    const vault = resolveVaultParam(vaultParam);
    const manager = getIndexManager();
    const db = await manager.getIndex(vault.alias);

    // Verify note exists
    const noteMeta = getNoteMetadataByPath(db, path);
    if (!noteMeta) {
      return {
        success: false,
        error: `Note not found: ${path}`,
        code: 'NOT_FOUND',
      };
    }

    // Find related notes
    const related = findRelatedNotes(db, path, method as RelatednessMethod, limit);

    // Build method description
    let methodDescription: string;
    switch (method) {
      case 'links':
        methodDescription = 'Related by shared link targets';
        break;
      case 'tags':
        methodDescription = 'Related by shared tags';
        break;
      case 'both':
        methodDescription = 'Related by shared links and tags (combined score)';
        break;
    }

    return {
      success: true,
      data: {
        ...getVaultResultInfo(vault),
        source: {
          path: noteMeta.path,
          title: noteMeta.title,
        },
        method,
        methodDescription,
        count: related.length,
        related: related.map((r) => ({
          path: r.note.path,
          title: r.note.title,
          score: Math.round(r.score * 1000) / 1000, // Round to 3 decimal places
          sharedLinks: r.sharedLinks,
          sharedTags: r.sharedTags,
          type: r.note.frontmatter.type,
        })),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      code: 'RELATED_ERROR',
    };
  }
}
