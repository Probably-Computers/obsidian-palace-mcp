/**
 * palace_recall - Search the palace for knowledge
 */

import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolResult, NoteMetadata, SearchResult } from '../types/index.js';
import { listNotes, readNote } from '../services/vault/index.js';
import { stripMarkdown } from '../utils/markdown.js';

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
});

// Tool definition
export const recallTool: Tool = {
  name: 'palace_recall',
  description:
    'Search the Obsidian palace for knowledge. Searches titles, content, and tags.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query (searches titles and content)',
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
    },
    required: ['query'],
  },
};

/**
 * Simple text search scoring
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

// Tool handler
export async function recallHandler(
  args: Record<string, unknown>
): Promise<ToolResult> {
  // Validate input
  const parseResult = inputSchema.safeParse(args);
  if (!parseResult.success) {
    return {
      success: false,
      error: parseResult.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; '),
      code: 'VALIDATION_ERROR',
    };
  }

  const input = parseResult.data;

  try {
    // Get all notes (TODO: use SQLite index for performance)
    const basePath = input.type !== 'all' ? input.type : '';
    const allNotes = await listNotes(basePath || input.path || '', true);

    // Filter and score
    const results: SearchResult[] = [];

    for (const meta of allNotes) {
      // Apply filters
      if (input.path && !meta.path.startsWith(input.path)) {
        continue;
      }

      if (input.type !== 'all' && meta.frontmatter.type !== input.type) {
        continue;
      }

      if (input.tags && input.tags.length > 0) {
        const noteTags = meta.frontmatter.tags ?? [];
        const hasAllTags = input.tags.every((tag) =>
          noteTags.some((t) => t.toLowerCase() === tag.toLowerCase())
        );
        if (!hasAllTags) continue;
      }

      if (
        input.min_confidence !== undefined &&
        (meta.frontmatter.confidence ?? 0) < input.min_confidence
      ) {
        continue;
      }

      // Score the match
      let score = scoreMatch(meta.title, input.query);

      // If we need content for scoring or results, read the full note
      if (input.include_content || score === 0) {
        const fullNote = await readNote(meta.path);
        if (fullNote) {
          score += scoreMatch(fullNote.content, input.query) * 0.5;
        }
      }

      // Also score tag matches
      const tagText = (meta.frontmatter.tags ?? []).join(' ');
      score += scoreMatch(tagText, input.query) * 2;

      if (score > 0) {
        results.push({
          note: meta,
          score,
        });
      }
    }

    // Sort by score and limit
    results.sort((a, b) => b.score - a.score);
    const limited = results.slice(0, input.limit);

    // Optionally include content
    const finalResults = await Promise.all(
      limited.map(async (result) => {
        if (input.include_content) {
          const fullNote = await readNote(result.note.path);
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
        query: input.query,
        count: finalResults.length,
        total: results.length,
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
