/**
 * palace_query - Query notes by properties
 */

import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolResult } from '../types/index.js';
import { queryNotes, countNotes, type FilterOptions } from '../services/index/index.js';
import { readNote } from '../services/vault/index.js';

// Input schema
const inputSchema = z.object({
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
  source: z.string().optional(),
  min_confidence: z.number().min(0).max(1).optional(),
  max_confidence: z.number().min(0).max(1).optional(),
  verified: z.boolean().optional(),
  created_after: z.string().optional(),
  created_before: z.string().optional(),
  modified_after: z.string().optional(),
  modified_before: z.string().optional(),
  sort_by: z
    .enum(['created', 'modified', 'title', 'confidence'])
    .optional()
    .default('modified'),
  sort_order: z.enum(['asc', 'desc']).optional().default('desc'),
  limit: z.number().min(1).max(100).optional().default(20),
  offset: z.number().min(0).optional().default(0),
  include_content: z.boolean().optional().default(false),
});

// Tool definition
export const queryTool: Tool = {
  name: 'palace_query',
  description:
    'Query notes by properties like type, tags, confidence, verified status, and dates. Use this for filtering without full-text search.',
  inputSchema: {
    type: 'object',
    properties: {
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
        description: 'Filter by tags (must have ALL specified tags)',
      },
      path: {
        type: 'string',
        description: 'Filter by path prefix',
      },
      source: {
        type: 'string',
        description: 'Filter by source (claude, user, web:url)',
      },
      min_confidence: {
        type: 'number',
        description: 'Minimum confidence threshold (0-1)',
      },
      max_confidence: {
        type: 'number',
        description: 'Maximum confidence threshold (0-1)',
      },
      verified: {
        type: 'boolean',
        description: 'Filter by verified status',
      },
      created_after: {
        type: 'string',
        description: 'Filter notes created after this ISO date',
      },
      created_before: {
        type: 'string',
        description: 'Filter notes created before this ISO date',
      },
      modified_after: {
        type: 'string',
        description: 'Filter notes modified after this ISO date',
      },
      modified_before: {
        type: 'string',
        description: 'Filter notes modified before this ISO date',
      },
      sort_by: {
        type: 'string',
        enum: ['created', 'modified', 'title', 'confidence'],
        description: 'Sort results by field (default: modified)',
      },
      sort_order: {
        type: 'string',
        enum: ['asc', 'desc'],
        description: 'Sort order (default: desc)',
      },
      limit: {
        type: 'number',
        description: 'Maximum results (default: 20, max: 100)',
      },
      offset: {
        type: 'number',
        description: 'Offset for pagination (default: 0)',
      },
      include_content: {
        type: 'boolean',
        description: 'Include full note content in results (default: false)',
      },
    },
  },
};

// Tool handler
export async function queryHandler(
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
    // Build filter options - only include defined values
    const filterOptions: FilterOptions = {
      sortBy: input.sort_by,
      sortOrder: input.sort_order,
      limit: input.limit,
      offset: input.offset,
    };

    if (input.type !== 'all') filterOptions.type = input.type;
    if (input.tags) filterOptions.tags = input.tags;
    if (input.path) filterOptions.path = input.path;
    if (input.source) filterOptions.source = input.source;
    if (input.min_confidence !== undefined) filterOptions.minConfidence = input.min_confidence;
    if (input.max_confidence !== undefined) filterOptions.maxConfidence = input.max_confidence;
    if (input.verified !== undefined) filterOptions.verified = input.verified;
    if (input.created_after) filterOptions.createdAfter = input.created_after;
    if (input.created_before) filterOptions.createdBefore = input.created_before;
    if (input.modified_after) filterOptions.modifiedAfter = input.modified_after;
    if (input.modified_before) filterOptions.modifiedBefore = input.modified_before;

    // Execute query
    const notes = queryNotes(filterOptions);

    // Build count options - only include defined values
    const countOptions: Parameters<typeof countNotes>[0] = {};
    if (filterOptions.type) countOptions.type = filterOptions.type;
    if (filterOptions.tags) countOptions.tags = filterOptions.tags;
    if (filterOptions.path) countOptions.path = filterOptions.path;
    if (filterOptions.minConfidence !== undefined) countOptions.minConfidence = filterOptions.minConfidence;
    if (filterOptions.verified !== undefined) countOptions.verified = filterOptions.verified;

    // Get total count for pagination
    const total = countNotes(countOptions);

    // Optionally include content
    const results = await Promise.all(
      notes.map(async (meta) => {
        if (input.include_content) {
          const fullNote = await readNote(meta.path);
          return {
            ...meta,
            content: fullNote?.content,
          };
        }
        return meta;
      })
    );

    return {
      success: true,
      data: {
        count: results.length,
        total,
        offset: input.offset,
        limit: input.limit,
        hasMore: input.offset + results.length < total,
        results,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      code: 'QUERY_ERROR',
    };
  }
}
