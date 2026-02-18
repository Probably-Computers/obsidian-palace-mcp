/**
 * palace_revert tool (Phase 028)
 *
 * Restore notes to previous versions
 */

import { z } from 'zod';
import { join } from 'path';
import { writeFile } from 'fs/promises';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getVaultRegistry, readNote } from '../services/vault/index.js';
import {
  getVersion,
  saveVersion,
  listVersions,
} from '../services/history/index.js';
import { stringifyFrontmatter } from '../utils/frontmatter.js';
import { indexNote } from '../services/index/sync.js';
import { createDatabase } from '../services/index/sqlite.js';
import { logger } from '../utils/logger.js';
import type { ToolResult, NoteFrontmatter } from '../types/index.js';

/**
 * Input schema for palace_revert
 */
export const revertSchema = z.object({
  path: z.string().describe('Note path to revert'),
  vault: z.string().optional().describe('Vault alias (defaults to default vault)'),
  to_version: z.number().describe('Version number to restore'),
  revert_scope: z
    .enum(['all', 'frontmatter', 'content'])
    .default('all')
    .describe('What to revert: all, frontmatter only, or content only'),
  dry_run: z.boolean().default(true).describe('Preview changes without modifying'),
  create_backup: z
    .boolean()
    .default(true)
    .describe('Save current as new version before revert'),
});

export type RevertInput = z.infer<typeof revertSchema>;

/**
 * Revert result
 */
interface RevertResult {
  success: boolean;
  path: string;
  reverted_from: number;
  reverted_to: number;
  backup_version?: number | undefined;
  changes_reverted: string[];
  dry_run: boolean;
  preview?: {
    current_frontmatter: Record<string, unknown>;
    target_frontmatter: Record<string, unknown>;
    content_changed: boolean;
  };
}

/**
 * Handler for palace_revert (internal)
 */
async function revertHandlerInternal(input: RevertInput): Promise<ToolResult<RevertResult>> {
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

    // Check read-only
    if (!input.dry_run && registry.isReadOnly(vault.alias)) {
      return {
        success: false,
        error: `Vault is read-only: ${vault.alias}`,
        code: 'VAULT_READ_ONLY',
      };
    }

    const palaceDir = join(vault.path, '.palace');
    const fullPath = join(vault.path, input.path);

    // Check if the note exists
    const currentNote = await readNote(input.path, { vaultPath: vault.path });
    if (!currentNote) {
      return {
        success: false,
        error: `Note not found: ${input.path}`,
        code: 'NOTE_NOT_FOUND',
      };
    }

    // Get the target version
    const targetVersion = await getVersion(palaceDir, input.path, input.to_version);
    if (!targetVersion) {
      return {
        success: false,
        error: `Version ${input.to_version} not found`,
        code: 'VERSION_NOT_FOUND',
      };
    }

    // Get current version number
    const versions = await listVersions(palaceDir, input.path);
    const currentVersion = versions.length > 0 ? versions[0]!.version : 0;

    // Determine what will be reverted
    const changesReverted: string[] = [];
    let revertedFrontmatter = currentNote.frontmatter;
    let revertedContent = currentNote.content;

    if (input.revert_scope === 'all' || input.revert_scope === 'frontmatter') {
      // Check if frontmatter is different
      const currentFm = JSON.stringify(currentNote.frontmatter);
      const targetFm = JSON.stringify(targetVersion.frontmatter);
      if (currentFm !== targetFm) {
        changesReverted.push('frontmatter');
        revertedFrontmatter = targetVersion.frontmatter as NoteFrontmatter;
      }
    }

    if (input.revert_scope === 'all' || input.revert_scope === 'content') {
      // Check if content is different
      if (currentNote.content !== targetVersion.body) {
        changesReverted.push('content');
        revertedContent = targetVersion.body;
      }
    }

    // If dry_run, return preview
    if (input.dry_run) {
      return {
        success: true,
        data: {
          success: true,
          path: input.path,
          reverted_from: currentVersion,
          reverted_to: input.to_version,
          changes_reverted: changesReverted,
          dry_run: true,
          preview: {
            current_frontmatter: currentNote.frontmatter,
            target_frontmatter: targetVersion.frontmatter,
            content_changed: changesReverted.includes('content'),
          },
        },
      };
    }

    // Create backup if requested
    let backupVersion: number | undefined;
    if (input.create_backup) {
      const savedVersion = await saveVersion(
        palaceDir,
        input.path,
        currentNote.raw,
        'improve',
        'revert-backup',
        {
          enabled: true,
          maxVersionsPerNote: vault.config.history.max_versions_per_note,
          maxAgeDays: vault.config.history.max_age_days,
          autoCleanup: vault.config.history.auto_cleanup,
          excludePatterns: [], // Don't exclude on revert - always save backup
        }
      );
      backupVersion = savedVersion ?? undefined;
    }

    // Build the reverted content
    // Update modified timestamp
    const now = new Date().toISOString();
    const updatedFrontmatter = {
      ...revertedFrontmatter,
      modified: now,
    };

    const revertedRaw = stringifyFrontmatter(updatedFrontmatter, revertedContent);

    // Write the reverted content
    await writeFile(fullPath, revertedRaw, 'utf-8');
    logger.info(`Reverted ${input.path} to version ${input.to_version}`);

    // Update the index
    try {
      const db = createDatabase(vault.indexPath);
      // Re-read the note to get the proper Note object for indexing
      const updatedNote = await readNote(input.path, { vaultPath: vault.path });
      if (updatedNote) {
        indexNote(db, updatedNote);
      }
      db.close();
    } catch (error) {
      logger.warn(`Failed to sync index after revert:`, error);
    }

    const result: RevertResult = {
      success: true,
      path: input.path,
      reverted_from: currentVersion,
      reverted_to: input.to_version,
      changes_reverted: changesReverted,
      dry_run: false,
    };

    if (backupVersion !== undefined) {
      result.backup_version = backupVersion;
    }

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to revert: ${error instanceof Error ? error.message : String(error)}`,
      code: 'REVERT_ERROR',
    };
  }
}

/**
 * Tool definition for palace_revert
 */
export const revertTool: Tool = {
  name: 'palace_revert',
  description:
    'Restore a note to a previous version. Can revert all content, frontmatter only, or content only. Creates backup before reverting by default.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Note path to revert',
      },
      vault: {
        type: 'string',
        description: 'Vault alias (defaults to default vault)',
      },
      to_version: {
        type: 'number',
        description: 'Version number to restore',
      },
      revert_scope: {
        type: 'string',
        enum: ['all', 'frontmatter', 'content'],
        description: 'What to revert (default: all)',
        default: 'all',
      },
      dry_run: {
        type: 'boolean',
        description: 'Preview changes without modifying (default: true)',
        default: true,
      },
      create_backup: {
        type: 'boolean',
        description: 'Save current as new version before revert (default: true)',
        default: true,
      },
    },
    required: ['path', 'to_version'],
  },
};

/**
 * Wrapper handler that validates input
 */
export async function revertHandler(
  args: Record<string, unknown>
): Promise<ToolResult<RevertResult>> {
  const parsed = revertSchema.safeParse(args);
  if (!parsed.success) {
    return {
      success: false,
      error: `Invalid input: ${parsed.error.message}`,
      code: 'VALIDATION_ERROR',
    };
  }

  return revertHandlerInternal(parsed.data);
}
