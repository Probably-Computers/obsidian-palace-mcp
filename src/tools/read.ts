/**
 * palace_read - Read a specific note from the palace
 */

import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolResult } from '../types/index.js';
import { readNote, findNoteByTitle } from '../services/vault/index.js';
import {
  resolveVaultParam,
  resolvePathWithVault,
  getVaultResultInfo,
  validateNotePath,
} from '../utils/vault-param.js';

// Input schema
const inputSchema = z
  .object({
    path: z.string().optional(),
    title: z.string().optional(),
    vault: z
      .string()
      .optional()
      .describe('Vault alias or path. Defaults to the default vault.'),
  })
  .refine((data) => data.path || data.title, {
    message: 'Either path or title is required',
  });

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
        description:
          'Full path to note (relative to vault root, e.g., "commands/docker/build.md"). Supports cross-vault format: "vault:alias/path"',
      },
      title: {
        type: 'string',
        description: 'Note title (will search for matching file, also checks aliases)',
      },
      vault: {
        type: 'string',
        description: 'Vault alias or path to read from (defaults to default vault)',
      },
    },
  },
};

// Tool handler
export async function readHandler(args: Record<string, unknown>): Promise<ToolResult> {
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
    let note;
    let resolvedVault;

    if (input.path) {
      // Handle cross-vault path format or use explicit vault parameter
      const { vault, notePath } = resolvePathWithVault(input.path, input.vault);
      resolvedVault = vault;
      validateNotePath(notePath, vault.path);

      note = await readNote(notePath, {
        vaultPath: vault.path,
        ignoreConfig: vault.config.ignore,
      });
    } else if (input.title) {
      // Search by title in specified vault
      resolvedVault = resolveVaultParam(input.vault);

      note = await findNoteByTitle(input.title, {
        vaultPath: resolvedVault.path,
        ignoreConfig: resolvedVault.config.ignore,
      });
    } else {
      resolvedVault = resolveVaultParam(input.vault);
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
        ...getVaultResultInfo(resolvedVault!),
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
