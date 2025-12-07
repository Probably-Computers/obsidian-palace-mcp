/**
 * palace_list - List notes in a directory
 */

import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolResult } from '../types/index.js';
import { listNotes } from '../services/vault/index.js';
import { resolveVaultParam, getVaultResultInfo } from '../utils/vault-param.js';

// Input schema
const inputSchema = z.object({
  path: z.string().optional().default(''),
  recursive: z.boolean().optional().default(false),
  include_metadata: z.boolean().optional().default(false),
  vault: z.string().optional().describe('Vault alias or path. Defaults to the default vault.'),
});

// Tool definition
export const listTool: Tool = {
  name: 'palace_list',
  description: 'List notes in a palace directory. Can list recursively and include metadata.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Directory path to list (relative to vault root, e.g., "commands/docker")',
      },
      recursive: {
        type: 'boolean',
        description: 'Include subdirectories (default: false)',
      },
      include_metadata: {
        type: 'boolean',
        description: 'Include frontmatter in results (default: false)',
      },
      vault: {
        type: 'string',
        description: 'Vault alias or path to list from (defaults to default vault)',
      },
    },
  },
};

// Tool handler
export async function listHandler(args: Record<string, unknown>): Promise<ToolResult> {
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

    const notes = await listNotes(input.path, input.recursive, {
      vaultPath: vault.path,
      ignoreConfig: vault.config.ignore,
    });

    // Format output based on include_metadata flag
    const results = notes.map((note) => {
      if (input.include_metadata) {
        return {
          path: note.path,
          title: note.title,
          type: note.frontmatter.type,
          tags: note.frontmatter.tags,
          confidence: note.frontmatter.confidence,
          verified: note.frontmatter.verified,
          modified: note.frontmatter.modified,
        };
      }
      return {
        path: note.path,
        title: note.title,
      };
    });

    return {
      success: true,
      data: {
        ...getVaultResultInfo(vault),
        path: input.path || '/',
        count: results.length,
        notes: results,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      code: 'LIST_ERROR',
    };
  }
}
