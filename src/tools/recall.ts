/**
 * palace_recall - Search the palace for knowledge using FTS5
 */

import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolResult, SearchResult } from '../types/index.js';
import { readNote, listNotes } from '../services/vault/index.js';
import { searchNotes, getDatabaseSync } from '../services/index/index.js';
import { logger } from '../utils/logger.js';
import { resolveVaultParam, getVaultResultInfo } from '../utils/vault-param.js';

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
  vault: z.string().optional().describe('Vault alias or path. Defaults to the default vault.'),
});

// Tool definition
export const recallTool: Tool = {
  name: 'palace_recall',
  description:
    'Search the Obsidian palace for knowledge. Uses FTS5 full-text search for fast, ranked results.',
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
        description: 'Vault alias or path to search in (defaults to default vault)',
      },
    },
    required: ['query'],
  },
};

/**
 * Simple text search scoring (fallback when index unavailable)
 */
function scoreMatch(text: string, query: string): number {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const words = lowerQuery.split(/\s+/);

  let score = 0;

  // Exact phrase match
  if (lowerText.includes(lowerQuery)) {
    score += 10;
  }

  // Individual word matches
  for (const word of words) {
    if (word.length < 2) continue;

    const regex = new RegExp(word, 'gi');
    const matches = lowerText.match(regex);
    if (matches) {
      score += matches.length;
    }
  }

  return score;
}

/**
 * Fallback search without index
 */
async function fallbackSearch(
  query: string,
  type: string,
  tags: string[] | undefined,
  path: string | undefined,
  minConfidence: number | undefined,
  limit: number,
  includeContent: boolean,
  vaultPath: string,
  ignoreConfig: { patterns: string[]; marker_file: string; frontmatter_key: string }
): Promise<SearchResult[]> {
  logger.debug('Using fallback search (index not available)');

  const basePath = type !== 'all' ? type : '';
  const readOptions = { vaultPath, ignoreConfig };
  const allNotes = await listNotes(basePath || path || '', true, readOptions);
  const results: SearchResult[] = [];

  for (const meta of allNotes) {
    if (path && !meta.path.startsWith(path)) continue;
    if (type !== 'all' && meta.frontmatter.type !== type) continue;

    if (tags && tags.length > 0) {
      const noteTags = meta.frontmatter.tags ?? [];
      const hasAllTags = tags.every((tag) =>
        noteTags.some((t) => t.toLowerCase() === tag.toLowerCase())
      );
      if (!hasAllTags) continue;
    }

    if (minConfidence !== undefined && (meta.frontmatter.confidence ?? 0) < minConfidence) {
      continue;
    }

    let score = scoreMatch(meta.title, query);

    if (includeContent || score === 0) {
      const fullNote = await readNote(meta.path, readOptions);
      if (fullNote) {
        score += scoreMatch(fullNote.content, query) * 0.5;
      }
    }

    const tagText = (meta.frontmatter.tags ?? []).join(' ');
    score += scoreMatch(tagText, query) * 2;

    if (score > 0) {
      results.push({ note: meta, score });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

/**
 * Check if index is available
 */
function isIndexAvailable(): boolean {
  try {
    getDatabaseSync();
    return true;
  } catch {
    return false;
  }
}

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
    // Resolve vault
    const vault = resolveVaultParam(input.vault);
    const readOptions = {
      vaultPath: vault.path,
      ignoreConfig: vault.config.ignore,
    };

    let results: SearchResult[];

    // Try FTS5 search first, fallback to simple search
    // Note: Currently the index is shared, multi-vault indexing will be added in Phase 010
    if (isIndexAvailable()) {
      logger.debug('Using FTS5 search');
      const searchOptions: Parameters<typeof searchNotes>[0] = {
        query: input.query,
        limit: input.limit,
      };
      if (input.type !== 'all') searchOptions.type = input.type;
      if (input.tags) searchOptions.tags = input.tags;
      if (input.path) searchOptions.path = input.path;
      if (input.min_confidence !== undefined) searchOptions.minConfidence = input.min_confidence;

      results = searchNotes(searchOptions);
    } else {
      results = await fallbackSearch(
        input.query,
        input.type,
        input.tags,
        input.path,
        input.min_confidence,
        input.limit,
        input.include_content,
        vault.path,
        vault.config.ignore
      );
    }

    // Optionally include content
    const finalResults = await Promise.all(
      results.map(async (result) => {
        if (input.include_content) {
          const fullNote = await readNote(result.note.path, readOptions);
          return {
            ...result,
            content: fullNote?.content,
          };
        }
        return result;
      })
    );

    return {
      success: true,
      data: {
        ...getVaultResultInfo(vault),
        query: input.query,
        count: finalResults.length,
        indexed: isIndexAvailable(),
        results: finalResults,
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
