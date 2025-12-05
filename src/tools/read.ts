/**
 * palace_read - Read a specific note from the palace
 */

import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolResult } from '../types/index.js';
import { readNote, findNoteByTitle } from '../services/vault/index.js';

// Input schema
const inputSchema = z.object({
  path: z.string().optional(),
  title: z.string().optional(),
}).refine(
  (data) => data.path || data.title,
  { message: 'Either path or title is required' }
);

// Tool definition
export const readTool: Tool = {
  name: 'palace_read',
  description:
    'Read a specific note from the palace by path or title. Returns the full note content and metadata.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Full path to note (relative to vault root, e.g., "commands/docker/build.md")',
      },
      title: {
        type: 'string',
        description: 'Note title (will search for matching file, also checks aliases)',
      },
    },
  },
};

// Tool handler
export async function readHandler(
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
    let note;

    if (input.path) {
      // Read by path
      note = await readNote(input.path);
    } else if (input.title) {
      // Search by title
      note = await findNoteByTitle(input.title);
    }

    if (!note) {
      return {
        success: false,
        error: input.path
          ? `Note not found: ${input.path}`
          : `No note found with title: ${input.title}`,
        code: 'NOT_FOUND',
      };
    }

    return {
      success: true,
      data: {
        path: note.path,
        title: note.title,
        frontmatter: note.frontmatter,
        content: note.content,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      code: 'READ_ERROR',
    };
  }
}
