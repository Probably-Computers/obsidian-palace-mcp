/**
 * palace_remember - Store new knowledge in the palace
 */

import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolResult, KnowledgeType } from '../types/index.js';
import { createNote } from '../services/vault/index.js';
import {
  buildCompleteIndex,
  scanForMatches,
  autolinkContent,
} from '../services/autolink/index.js';
import { logger } from '../utils/logger.js';

// Input schema
const inputSchema = z.object({
  content: z.string().min(1, 'Content is required'),
  title: z.string().min(1, 'Title is required'),
  type: z.enum([
    'research',
    'command',
    'infrastructure',
    'client',
    'project',
    'pattern',
    'troubleshooting',
  ]),
  path: z.string().optional().default(''),
  tags: z.array(z.string()).optional().default([]),
  related: z.array(z.string()).optional().default([]),
  confidence: z.number().min(0).max(1).optional().default(0.5),
  source: z.string().optional().default('claude'),
  autolink: z.boolean().optional().default(true),
});

// Tool definition
export const rememberTool: Tool = {
  name: 'palace_remember',
  description:
    'Store new knowledge in the Obsidian palace. Creates a new note with proper frontmatter and auto-links to related notes.',
  inputSchema: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: 'The knowledge to store (markdown format)',
      },
      title: {
        type: 'string',
        description: 'Note title (will be used as filename)',
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
        ],
        description: 'Type of knowledge',
      },
      path: {
        type: 'string',
        description:
          'Subdirectory path within type folder (e.g., "docker" for commands/docker/)',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Tags for categorization',
      },
      related: {
        type: 'array',
        items: { type: 'string' },
        description: 'Wiki-link targets to related notes',
      },
      confidence: {
        type: 'number',
        description: 'Confidence level 0-1 (0.5 = learned from web, 0.9 = taught by human)',
      },
      source: {
        type: 'string',
        description: 'Where this came from (claude, user, web:url)',
      },
      autolink: {
        type: 'boolean',
        description: 'Automatically insert wiki-links for mentions of existing notes (default: true)',
      },
    },
    required: ['content', 'title', 'type'],
  },
};

// Tool handler
export async function rememberHandler(
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
    let contentToSave = input.content;
    let linksAdded = 0;

    // Auto-link content if enabled
    if (input.autolink) {
      try {
        const { index } = await buildCompleteIndex();
        const matches = scanForMatches(contentToSave, index);
        if (matches.length > 0) {
          const result = autolinkContent(contentToSave, matches);
          contentToSave = result.linkedContent;
          linksAdded = result.linksAdded.length;
          logger.debug(`Auto-linked ${linksAdded} terms in new note`);
        }
      } catch (linkError) {
        // Log but don't fail - auto-linking is a nice-to-have
        logger.warn('Auto-linking failed, proceeding without', linkError);
      }
    }

    const note = await createNote(
      input.type as KnowledgeType,
      input.path,
      input.title,
      contentToSave,
      {
        tags: input.tags,
        related: input.related.map((r) => `[[${r}]]`),
        confidence: input.confidence,
        source: input.source as 'claude' | 'user',
      }
    );

    return {
      success: true,
      data: {
        path: note.path,
        title: note.title,
        linksAdded,
        message: `Created note: ${note.path}${linksAdded > 0 ? ` (${linksAdded} auto-links added)` : ''}`,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      code: 'CREATE_ERROR',
    };
  }
}
