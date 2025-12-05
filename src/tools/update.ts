/**
 * palace_update - Update existing notes in the palace
 */

import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolResult, Note, NoteFrontmatter, KnowledgeSource } from '../types/index.js';
import {
  readNote,
  updateNote,
  appendToNote,
  updateFrontmatter,
} from '../services/vault/index.js';
import { indexNote } from '../services/index/index.js';

// Input schema
const inputSchema = z.object({
  path: z.string().min(1, 'Path is required'),
  mode: z
    .enum(['replace', 'append', 'frontmatter'])
    .optional()
    .default('replace'),
  content: z.string().optional(),
  frontmatter: z
    .object({
      type: z
        .enum([
          'research',
          'command',
          'infrastructure',
          'client',
          'project',
          'pattern',
          'troubleshooting',
        ])
        .optional(),
      source: z.string().optional(),
      confidence: z.number().min(0).max(1).optional(),
      verified: z.boolean().optional(),
      tags: z.array(z.string()).optional(),
      related: z.array(z.string()).optional(),
      aliases: z.array(z.string()).optional(),
    })
    .optional(),
});

// Tool definition
export const updateTool: Tool = {
  name: 'palace_update',
  description:
    'Update an existing note in the Obsidian palace. Can replace content, append to content, or update frontmatter properties.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the note to update (relative to vault root)',
      },
      mode: {
        type: 'string',
        enum: ['replace', 'append', 'frontmatter'],
        description:
          'Update mode: replace (overwrite content), append (add to end), frontmatter (update metadata only)',
      },
      content: {
        type: 'string',
        description: 'New content (required for replace/append modes)',
      },
      frontmatter: {
        type: 'object',
        description: 'Frontmatter updates (merged with existing)',
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
            ],
          },
          source: { type: 'string' },
          confidence: { type: 'number' },
          verified: { type: 'boolean' },
          tags: { type: 'array', items: { type: 'string' } },
          related: { type: 'array', items: { type: 'string' } },
          aliases: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    required: ['path'],
  },
};

// Tool handler
export async function updateHandler(
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

  const { path, mode, content, frontmatter } = parseResult.data;

  // Validate that content is provided for replace/append modes
  if ((mode === 'replace' || mode === 'append') && !content) {
    return {
      success: false,
      error: `Content is required for ${mode} mode`,
      code: 'VALIDATION_ERROR',
    };
  }

  // Validate that frontmatter is provided for frontmatter mode
  if (mode === 'frontmatter' && !frontmatter) {
    return {
      success: false,
      error: 'Frontmatter updates required for frontmatter mode',
      code: 'VALIDATION_ERROR',
    };
  }

  try {
    // Check if note exists
    const existing = await readNote(path);
    if (!existing) {
      return {
        success: false,
        error: `Note not found: ${path}`,
        code: 'NOT_FOUND',
      };
    }

    let updatedNote: Note;

    // Build frontmatter updates - only include defined values
    const frontmatterUpdates: Partial<NoteFrontmatter> = {};
    if (frontmatter?.type) frontmatterUpdates.type = frontmatter.type;
    if (frontmatter?.source) frontmatterUpdates.source = frontmatter.source as KnowledgeSource;
    if (frontmatter?.confidence !== undefined) frontmatterUpdates.confidence = frontmatter.confidence;
    if (frontmatter?.verified !== undefined) frontmatterUpdates.verified = frontmatter.verified;
    if (frontmatter?.tags) frontmatterUpdates.tags = frontmatter.tags;
    if (frontmatter?.related) frontmatterUpdates.related = frontmatter.related;
    if (frontmatter?.aliases) frontmatterUpdates.aliases = frontmatter.aliases;

    switch (mode) {
      case 'replace':
        updatedNote = await updateNote(path, content!, frontmatterUpdates);
        break;

      case 'append':
        updatedNote = await appendToNote(path, content!);
        if (Object.keys(frontmatterUpdates).length > 0) {
          updatedNote = await updateFrontmatter(path, frontmatterUpdates);
        }
        break;

      case 'frontmatter':
        updatedNote = await updateFrontmatter(path, frontmatterUpdates);
        break;

      default:
        return {
          success: false,
          error: `Unknown mode: ${mode}`,
          code: 'INVALID_MODE',
        };
    }

    // Update the index
    indexNote(updatedNote);

    return {
      success: true,
      data: {
        path: updatedNote.path,
        title: updatedNote.title,
        mode,
        frontmatter: updatedNote.frontmatter,
        message: `Note updated successfully (${mode} mode)`,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      code: 'UPDATE_ERROR',
    };
  }
}
