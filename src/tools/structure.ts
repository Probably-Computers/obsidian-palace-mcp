/**
 * palace_structure - Get the palace directory tree structure
 */

import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolResult, DirectoryEntry } from '../types/index.js';
import { getDirectoryTree } from '../services/vault/index.js';
import { resolveVaultParam, getVaultResultInfo } from '../utils/vault-param.js';

// Input schema
const inputSchema = z.object({
  depth: z.number().min(1).max(10).optional().default(3),
  path: z.string().optional().default(''),
  vault: z.string().optional().describe('Vault alias or path. Defaults to the default vault.'),
});

// Tool definition
export const structureTool: Tool = {
  name: 'palace_structure',
  description:
    'Get the palace directory tree structure. Useful for understanding vault organization.',
  inputSchema: {
    type: 'object',
    properties: {
      depth: {
        type: 'number',
        description: 'Maximum depth to traverse (default: 3, max: 10)',
      },
      path: {
        type: 'string',
        description: 'Start from this subdirectory',
      },
      vault: {
        type: 'string',
        description: 'Vault alias or path to show structure of (defaults to default vault)',
      },
    },
  },
};

/**
 * Format directory tree as readable text
 */
function formatTree(entries: DirectoryEntry[], prefix = ''): string {
  const lines: string[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const isLast = i === entries.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const icon = entry.type === 'directory' ? '📁 ' : '📄 ';

    lines.push(`${prefix}${connector}${icon}${entry.name}`);

    if (entry.children && entry.children.length > 0) {
      const childPrefix = prefix + (isLast ? '    ' : '│   ');
      lines.push(formatTree(entry.children, childPrefix));
    }
  }

  return lines.join('\n');
}

/**
 * Count files and directories
 */
function countEntries(entries: DirectoryEntry[]): { files: number; dirs: number } {
  let files = 0;
  let dirs = 0;

  for (const entry of entries) {
    if (entry.type === 'directory') {
      dirs++;
      if (entry.children) {
        const childCounts = countEntries(entry.children);
        files += childCounts.files;
        dirs += childCounts.dirs;
      }
    } else {
      files++;
    }
  }

  return { files, dirs };
}

// Tool handler
export async function structureHandler(args: Record<string, unknown>): Promise<ToolResult> {
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

    const tree = await getDirectoryTree(input.path, input.depth, {
      vaultPath: vault.path,
      ignoreConfig: vault.config.ignore,
    });
    const counts = countEntries(tree);
    const formatted = formatTree(tree);

    return {
      success: true,
      data: {
        ...getVaultResultInfo(vault),
        path: input.path || '/',
        depth: input.depth,
        stats: {
          files: counts.files,
          directories: counts.dirs,
        },
        tree: formatted,
        entries: tree, // Also include raw structure for programmatic use
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      code: 'STRUCTURE_ERROR',
    };
  }
}
