/**
 * palace_history tool (Phase 028)
 *
 * View version history for notes
 */

import { z } from 'zod';
import { join } from 'path';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getVaultRegistry, readNote } from '../services/vault/index.js';
import {
  listVersions,
  getVersionContent,
} from '../services/history/index.js';
import {
  generateDiff,
  formatUnifiedDiff,
  generateFrontmatterDiff,
  formatFrontmatterDiff,
  generateChangeSummary,
} from '../services/history/diff.js';
import type { ToolResult } from '../types/index.js';

/**
 * Input schema for palace_history
 */
export const historySchema = z.object({
  path: z.string().describe('Note path to show history for'),
  vault: z.string().optional().describe('Vault alias (defaults to default vault)'),
  limit: z.number().default(10).describe('Max versions to return'),
  show_diff: z.boolean().default(false).describe('Include diffs between versions'),
  from_version: z.number().optional().describe('Start from this version'),
  to_version: z.number().optional().describe('End at this version'),
  compare: z
    .object({
      from: z.number(),
      to: z.number(),
    })
    .optional()
    .describe('Compare two specific versions'),
});

export type HistoryInput = z.infer<typeof historySchema>;

/**
 * Version in result
 */
interface VersionResult {
  version: number;
  timestamp: string;
  operation: string;
  mode?: string | undefined;
  changes: string[];
  summary?: string | undefined;
  diff?: string | undefined;
}

/**
 * Compare result
 */
interface CompareResult {
  from_version: number;
  to_version: number;
  content_diff: string;
  frontmatter_diff: string;
  summary: string;
}

/**
 * History result
 */
interface HistoryResult {
  path: string;
  current_version: number;
  versions: VersionResult[];
  total_versions: number;
  compare?: CompareResult | undefined;
}

/**
 * Handler for palace_history (internal)
 */
async function historyHandlerInternal(input: HistoryInput): Promise<ToolResult<HistoryResult>> {
  try {
    const registry = getVaultRegistry();
    const vault = input.vault ? registry.getVault(input.vault) : registry.getDefaultVault();

    if (!vault) {
      return {
        success: false,
        error: `Vault not found: ${input.vault ?? 'default'}`,
        code: 'VAULT_NOT_FOUND',
      };
    }

    const palaceDir = join(vault.path, '.palace');

    // Check if the note exists
    const note = await readNote(input.path, { vaultPath: vault.path });
    if (!note) {
      return {
        success: false,
        error: `Note not found: ${input.path}`,
        code: 'NOTE_NOT_FOUND',
      };
    }

    // If compare is specified, just do a comparison
    if (input.compare) {
      const compareResult = await compareVersions(
        palaceDir,
        input.path,
        vault.path,
        input.compare.from,
        input.compare.to
      );

      if (!compareResult.success) {
        return compareResult;
      }

      // Get current version for context
      const allVersions = await listVersions(palaceDir, input.path);

      return {
        success: true,
        data: {
          path: input.path,
          current_version: allVersions.length > 0 ? allVersions[0]!.version : 0,
          versions: [],
          total_versions: allVersions.length,
          compare: compareResult.data,
        },
      };
    }

    // List versions
    let versions = await listVersions(palaceDir, input.path);

    // Filter by version range if specified
    if (input.from_version !== undefined) {
      versions = versions.filter((v) => v.version >= input.from_version!);
    }
    if (input.to_version !== undefined) {
      versions = versions.filter((v) => v.version <= input.to_version!);
    }

    const totalVersions = versions.length;

    // Apply limit
    const limitedVersions = versions.slice(0, input.limit);

    // Build version results
    const versionResults: VersionResult[] = [];

    for (let i = 0; i < limitedVersions.length; i++) {
      const version = limitedVersions[i];
      if (!version) continue;

      const result: VersionResult = {
        version: version.version,
        timestamp: version.timestamp,
        operation: version.operation,
        changes: version.changes,
      };

      if (version.mode !== undefined) {
        result.mode = version.mode;
      }

      // Generate diff if requested
      if (input.show_diff && i < limitedVersions.length - 1) {
        const nextVersion = limitedVersions[i + 1];
        if (nextVersion) {
          const currentContent = await getVersionContent(palaceDir, input.path, version.version);
          const previousContent = await getVersionContent(
            palaceDir,
            input.path,
            nextVersion.version
          );

          if (currentContent && previousContent) {
            result.summary = generateChangeSummary(previousContent, currentContent);

            const diff = generateDiff(previousContent, currentContent);
            result.diff = formatUnifiedDiff(diff, `v${nextVersion.version}`, `v${version.version}`);
          }
        }
      } else if (input.show_diff && i === limitedVersions.length - 1) {
        // For the oldest version, compare with empty
        const currentContent = await getVersionContent(palaceDir, input.path, version.version);
        if (currentContent) {
          result.summary = 'Initial version';
        }
      }

      versionResults.push(result);
    }

    // Get current version number
    const currentVersion = versions.length > 0 ? versions[0]!.version : 0;

    return {
      success: true,
      data: {
        path: input.path,
        current_version: currentVersion,
        versions: versionResults,
        total_versions: totalVersions,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to get history: ${error instanceof Error ? error.message : String(error)}`,
      code: 'HISTORY_ERROR',
    };
  }
}

/**
 * Compare two specific versions
 */
async function compareVersions(
  palaceDir: string,
  notePath: string,
  vaultPath: string,
  fromVersion: number,
  toVersion: number
): Promise<ToolResult<CompareResult>> {
  let fromContent: string | null = null;
  let toContent: string | null = null;

  // Handle special case: version 0 means current file
  if (fromVersion === 0) {
    const fullPath = join(vaultPath, notePath);
    if (existsSync(fullPath)) {
      fromContent = await readFile(fullPath, 'utf-8');
    }
  } else {
    fromContent = await getVersionContent(palaceDir, notePath, fromVersion);
  }

  if (toVersion === 0) {
    const fullPath = join(vaultPath, notePath);
    if (existsSync(fullPath)) {
      toContent = await readFile(fullPath, 'utf-8');
    }
  } else {
    toContent = await getVersionContent(palaceDir, notePath, toVersion);
  }

  if (fromContent === null) {
    return {
      success: false,
      error: `Version ${fromVersion} not found`,
      code: 'VERSION_NOT_FOUND',
    };
  }

  if (toContent === null) {
    return {
      success: false,
      error: `Version ${toVersion} not found`,
      code: 'VERSION_NOT_FOUND',
    };
  }

  const contentDiff = generateDiff(fromContent, toContent);
  const fmDiff = generateFrontmatterDiff(fromContent, toContent);

  return {
    success: true,
    data: {
      from_version: fromVersion,
      to_version: toVersion,
      content_diff: formatUnifiedDiff(contentDiff, `v${fromVersion}`, `v${toVersion}`),
      frontmatter_diff: formatFrontmatterDiff(fmDiff),
      summary: generateChangeSummary(fromContent, toContent),
    },
  };
}

/**
 * Tool definition for palace_history
 */
export const historyTool: Tool = {
  name: 'palace_history',
  description:
    'View version history for a note. Shows timestamps, operations, and optionally diffs between versions. Use compare to diff two specific versions.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Note path to show history for',
      },
      vault: {
        type: 'string',
        description: 'Vault alias (defaults to default vault)',
      },
      limit: {
        type: 'number',
        description: 'Max versions to return (default: 10)',
        default: 10,
      },
      show_diff: {
        type: 'boolean',
        description: 'Include diffs between versions (default: false)',
        default: false,
      },
      from_version: {
        type: 'number',
        description: 'Start from this version',
      },
      to_version: {
        type: 'number',
        description: 'End at this version',
      },
      compare: {
        type: 'object',
        properties: {
          from: { type: 'number' },
          to: { type: 'number' },
        },
        required: ['from', 'to'],
        description: 'Compare two specific versions',
      },
    },
    required: ['path'],
  },
};

/**
 * Wrapper handler that validates input
 */
export async function historyHandler(
  args: Record<string, unknown>
): Promise<ToolResult<HistoryResult>> {
  const parsed = historySchema.safeParse(args);
  if (!parsed.success) {
    return {
      success: false,
      error: `Invalid input: ${parsed.error.message}`,
      code: 'VALIDATION_ERROR',
    };
  }

  return historyHandlerInternal(parsed.data);
}
