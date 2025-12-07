/**
 * palace_recall - Search the palace for knowledge using FTS5
 * Supports cross-vault search when enabled
 */

import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolResult } from '../types/index.js';
import { readNote } from '../services/vault/index.js';
import {
  searchAllVaults,
  searchNotesInVault,
  getIndexManager,
  type VaultSearchResult,
} from '../services/index/index.js';
import { logger } from '../utils/logger.js';
import { resolveVaultParam, getVaultResultInfo } from '../utils/vault-param.js';
import { getVaultRegistry } from '../services/vault/registry.js';

// Input schema
const inputSchema = z.object({
  query: z.string().min(1, 'Query is required'),
  type: z
    .enum([
      'research',
      'command',
      'infrastructure',
      'client',
      'project',
      'pattern',
      'troubleshooting',
      'all',
    ])
    .optional()
    .default('all'),
  tags: z.array(z.string()).optional(),
  path: z.string().optional(),
  min_confidence: z.number().min(0).max(1).optional(),
  limit: z.number().min(1).max(50).optional().default(10),
  include_content: z.boolean().optional().default(true),
  vault: z.string().optional().describe('Vault alias or path. Limits search to this vault.'),
  vaults: z.array(z.string()).optional().describe('List of vault aliases to search.'),
  exclude_vaults: z.array(z.string()).optional().describe('Vault aliases to exclude from search.'),
});

// Tool definition
export const recallTool: Tool = {
  name: 'palace_recall',
  description:
    'Search the Obsidian palace for knowledge. Uses FTS5 full-text search for fast, ranked results. Supports cross-vault search.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query (searches titles and content using full-text search)',
      },
      type: {
        type: 'string',
        enum: [
          'research',
          'command',
          'infrastructure',
          'client',
          'project',
          'pattern',
          'troubleshooting',
          'all',
        ],
        description: 'Filter by knowledge type',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter by tags (AND logic)',
      },
      path: {
        type: 'string',
        description: 'Filter by path prefix',
      },
      min_confidence: {
        type: 'number',
        description: 'Minimum confidence threshold (0-1)',
      },
      limit: {
        type: 'number',
        description: 'Maximum results to return (default: 10, max: 50)',
      },
      include_content: {
        type: 'boolean',
        description: 'Include full content in results (default: true)',
      },
      vault: {
        type: 'string',
        description: 'Vault alias or path to search in (limits search to this vault)',
      },
      vaults: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of vault aliases to search (for multi-vault search)',
      },
      exclude_vaults: {
        type: 'array',
        items: { type: 'string' },
        description: 'Vault aliases to exclude from search',
      },
    },
    required: ['query'],
  },
};

// Tool handler
export async function recallHandler(args: Record<string, unknown>): Promise<ToolResult> {
  // Validate input
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
    const registry = getVaultRegistry();
    const manager = getIndexManager();

    // Build search options - only include defined values
    const searchOptions: {
      query: string;
      type?: string;
      tags?: string[];
      path?: string;
      minConfidence?: number;
      limit: number;
      vaults?: string[];
      excludeVaults?: string[];
    } = {
      query: input.query,
      limit: input.limit,
    };

    if (input.type !== 'all') searchOptions.type = input.type;
    if (input.tags && input.tags.length > 0) searchOptions.tags = input.tags;
    if (input.path) searchOptions.path = input.path;
    if (input.min_confidence !== undefined) searchOptions.minConfidence = input.min_confidence;
    if (input.vaults && input.vaults.length > 0) searchOptions.vaults = input.vaults;
    if (input.exclude_vaults && input.exclude_vaults.length > 0) searchOptions.excludeVaults = input.exclude_vaults;

    let results: VaultSearchResult[];
    let searchMode: 'single' | 'cross';

    // If specific vault is provided, search only that vault
    if (input.vault) {
      const vault = resolveVaultParam(input.vault);
      const db = await manager.getIndex(vault.alias);
      const singleResults = searchNotesInVault(db, searchOptions);

      // Add vault attribution
      results = singleResults.map((r) => ({
        ...r,
        vault: vault.alias,
        vaultPath: r.note.path,
        prefixedPath: `vault:${vault.alias}/${r.note.path}`,
      }));
      searchMode = 'single';
    } else {
      // Cross-vault search
      results = await searchAllVaults(searchOptions);
      searchMode = registry.isCrossVaultSearchEnabled() ? 'cross' : 'single';
    }

    // Optionally include content
    const finalResults = await Promise.all(
      results.map(async (result) => {
        if (input.include_content) {
          const vault = registry.getVault(result.vault);
          if (vault) {
            const fullNote = await readNote(result.vaultPath, { vaultPath: vault.path });
            return {
              ...result,
              content: fullNote?.content,
            };
          }
        }
        return result;
      })
    );

    return {
      success: true,
      data: {
        query: input.query,
        search_mode: searchMode,
        count: finalResults.length,
        results: finalResults.map((r) => ({
          vault: r.vault,
          path: r.vaultPath,
          prefixed_path: r.prefixedPath,
          title: r.note.title,
          type: r.note.frontmatter.type,
          score: r.score,
          confidence: r.note.frontmatter.confidence,
          verified: r.note.frontmatter.verified,
          tags: r.note.frontmatter.tags,
          content: 'content' in r ? r.content : undefined,
        })),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      code: 'SEARCH_ERROR',
    };
  }
}
