/**
 * palace_batch - Batch operations for multiple notes (Phase 027)
 *
 * Provides batch operations to:
 * - Select notes by glob pattern or query criteria
 * - Apply operations to all selected notes
 * - Preview changes with dry_run (default: true)
 * - Delete with explicit confirmation required
 */

import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolResult } from '../types/index.js';
import { resolveVaultParam, enforceWriteAccess, getVaultResultInfo } from '../utils/vault-param.js';
import { getIndexManager } from '../services/index/index.js';
import {
  selectNotes,
  validateSelectionCriteria,
  updateFrontmatter,
  addTags,
  removeTags,
  moveNotes,
  renameNotes,
  deleteNotes,
  type SelectCriteria,
  type BatchOperationResult,
} from '../services/batch/index.js';
import { logger } from '../utils/logger.js';

// Selection criteria schema
const selectSchema = z.object({
  glob: z.string().optional().describe('Glob pattern for file selection (e.g., "**/*.md", "projects/**/Related.md")'),
  type: z.string().optional().describe('Filter by note type'),
  tags: z.array(z.string()).optional().describe('Filter by tags (AND logic)'),
  domain: z.array(z.string()).optional().describe('Filter by domain'),
  path_prefix: z.string().optional().describe('Filter by path prefix'),
  exclude: z.array(z.string()).optional().describe('Patterns to exclude'),
});

// Operation schemas using discriminated union
const updateFrontmatterOpSchema = z.object({
  type: z.literal('update_frontmatter'),
  updates: z.record(z.any()).describe('Frontmatter fields to update'),
  merge: z.boolean().default(true).describe('Merge with existing (true) or replace fields (false)'),
});

const addTagsOpSchema = z.object({
  type: z.literal('add_tags'),
  tags: z.array(z.string()).describe('Tags to add'),
});

const removeTagsOpSchema = z.object({
  type: z.literal('remove_tags'),
  tags: z.array(z.string()).describe('Tags to remove'),
});

const moveOpSchema = z.object({
  type: z.literal('move'),
  destination: z.string().describe('Destination directory'),
  update_backlinks: z.boolean().default(true).describe('Update wiki-links in other notes'),
});

const renameOpSchema = z.object({
  type: z.literal('rename'),
  match: z.string().describe('Regex pattern to match in paths'),
  pattern: z.string().describe('Replacement pattern (supports $1, $2 captures)'),
  update_backlinks: z.boolean().default(true).describe('Update wiki-links in other notes'),
});

const deleteOpSchema = z.object({
  type: z.literal('delete'),
  handle_backlinks: z.enum(['remove', 'warn', 'ignore']).default('warn').describe('How to handle backlinks'),
});

// Combined operation schema
const operationSchema = z.discriminatedUnion('type', [
  updateFrontmatterOpSchema,
  addTagsOpSchema,
  removeTagsOpSchema,
  moveOpSchema,
  renameOpSchema,
  deleteOpSchema,
]);

// Main input schema
const inputSchema = z.object({
  vault: z.string().optional().describe('Vault alias (defaults to default vault)'),
  select: selectSchema.describe('Selection criteria for notes'),
  operation: operationSchema.describe('Operation to perform on selected notes'),
  dry_run: z.boolean().default(true).describe('Preview without making changes (default: true)'),
  confirm: z.boolean().default(false).describe('Required to be true for delete operations'),
  limit: z.number().optional().describe('Maximum number of notes to process'),
});

// Response type
interface BatchResponse {
  success: boolean;
  dry_run: boolean;
  selected_count: number;
  processed_count: number;
  affected_files: Array<{
    path: string;
    action: 'updated' | 'moved' | 'renamed' | 'deleted' | 'skipped';
    details?: Record<string, unknown>;
  }>;
  errors: Array<{ path: string; error: string }>;
  warnings: string[];
}

// Tool definition
export const batchTool: Tool = {
  name: 'palace_batch',
  description: `Batch operations for multiple notes at once.

IMPORTANT: dry_run defaults to true - set dry_run: false to actually make changes.
Delete operations require confirm: true in addition to dry_run: false.

Selection methods:
- glob: Match files by pattern (e.g., "**/*.md", "projects/**/Related.md")
- type: Filter by note type
- tags: Filter by tags (AND logic)
- domain: Filter by domain path prefix
- path_prefix: Filter by path prefix
- exclude: Patterns to exclude from selection

Operations:
- update_frontmatter: Modify frontmatter fields
- add_tags: Add tags to selected notes
- remove_tags: Remove tags from selected notes
- move: Move notes to a new directory
- rename: Rename notes using regex pattern replacement
- delete: Delete selected notes (requires confirm: true)`,
  inputSchema: {
    type: 'object',
    properties: {
      vault: {
        type: 'string',
        description: 'Vault alias (defaults to default vault)',
      },
      select: {
        type: 'object',
        description: 'Selection criteria',
        properties: {
          glob: { type: 'string', description: 'Glob pattern (e.g., "**/*.md")' },
          type: { type: 'string', description: 'Filter by note type' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Filter by tags' },
          domain: { type: 'array', items: { type: 'string' }, description: 'Filter by domain' },
          path_prefix: { type: 'string', description: 'Filter by path prefix' },
          exclude: { type: 'array', items: { type: 'string' }, description: 'Patterns to exclude' },
        },
      },
      operation: {
        type: 'object',
        description: 'Operation to perform',
        properties: {
          type: {
            type: 'string',
            enum: ['update_frontmatter', 'add_tags', 'remove_tags', 'move', 'rename', 'delete'],
          },
        },
        required: ['type'],
      },
      dry_run: {
        type: 'boolean',
        description: 'Preview without changes (default: true)',
      },
      confirm: {
        type: 'boolean',
        description: 'Required for delete operations',
      },
      limit: {
        type: 'number',
        description: 'Maximum notes to process',
      },
    },
    required: ['select', 'operation'],
  },
};

// Tool handler
export async function batchHandler(args: Record<string, unknown>): Promise<ToolResult<BatchResponse>> {
  // Validate input
  const parseResult = inputSchema.safeParse(args);
  if (!parseResult.success) {
    return {
      success: false,
      error: parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      code: 'VALIDATION_ERROR',
    };
  }

  const {
    vault: vaultParam,
    select: selectCriteria,
    operation,
    dry_run: dryRun,
    confirm,
    limit,
  } = parseResult.data;

  try {
    // Validate selection criteria
    const selectionErrors = validateSelectionCriteria(selectCriteria as SelectCriteria);
    if (selectionErrors.length > 0) {
      return {
        success: false,
        error: selectionErrors.join('; '),
        code: 'VALIDATION_ERROR',
      };
    }

    // Check delete confirmation
    if (operation.type === 'delete' && !dryRun && !confirm) {
      return {
        success: false,
        error: 'Delete operation requires confirm: true when dry_run is false',
        code: 'CONFIRMATION_REQUIRED',
      };
    }

    // Resolve vault
    const vault = resolveVaultParam(vaultParam);
    enforceWriteAccess(vault);

    // Get database
    const manager = getIndexManager();
    const db = await manager.getIndex(vault.alias);

    // Select notes
    const selection = await selectNotes(selectCriteria as SelectCriteria, vault.path, db);

    if (selection.count === 0) {
      return {
        success: true,
        data: {
          ...getVaultResultInfo(vault),
          success: true,
          dry_run: dryRun,
          selected_count: 0,
          processed_count: 0,
          affected_files: [],
          errors: [],
          warnings: ['No notes matched the selection criteria'],
        } as BatchResponse,
      };
    }

    // Apply limit if specified
    let notesToProcess = selection.notes;
    if (limit && limit > 0 && notesToProcess.length > limit) {
      notesToProcess = notesToProcess.slice(0, limit);
    }

    logger.info(`Batch operation: ${operation.type} on ${notesToProcess.length} notes (dry_run: ${dryRun})`);

    // Execute operation
    let result: BatchOperationResult;

    switch (operation.type) {
      case 'update_frontmatter':
        result = await updateFrontmatter(
          notesToProcess,
          operation.updates,
          operation.merge,
          vault.path,
          db,
          dryRun
        );
        break;

      case 'add_tags':
        result = await addTags(notesToProcess, operation.tags, vault.path, db, dryRun);
        break;

      case 'remove_tags':
        result = await removeTags(notesToProcess, operation.tags, vault.path, db, dryRun);
        break;

      case 'move':
        result = await moveNotes(
          notesToProcess,
          operation.destination,
          operation.update_backlinks,
          vault.path,
          db,
          dryRun
        );
        break;

      case 'rename':
        result = await renameNotes(
          notesToProcess,
          operation.match,
          operation.pattern,
          operation.update_backlinks,
          vault.path,
          db,
          dryRun
        );
        break;

      case 'delete':
        result = await deleteNotes(
          notesToProcess,
          operation.handle_backlinks,
          vault.path,
          db,
          dryRun
        );
        break;

      default:
        return {
          success: false,
          error: `Unknown operation type: ${(operation as { type: string }).type}`,
          code: 'INVALID_OPERATION',
        };
    }

    // Build response
    const response: BatchResponse = {
      ...getVaultResultInfo(vault),
      success: result.success,
      dry_run: dryRun,
      selected_count: selection.count,
      processed_count: result.processed,
      affected_files: result.results.map((r) => {
        const file: { path: string; action: 'updated' | 'moved' | 'renamed' | 'deleted' | 'skipped'; details?: Record<string, unknown> } = {
          path: r.path,
          action: r.action,
        };
        if (r.details) {
          file.details = r.details;
        }
        return file;
      }),
      errors: result.errors,
      warnings: [...selection.warnings, ...result.warnings],
    };

    // Add dry_run reminder if applicable
    if (dryRun && result.processed > 0) {
      response.warnings.push('DRY RUN: No changes were made. Set dry_run: false to apply changes.');
    }

    return {
      success: true,
      data: response,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      code: 'BATCH_ERROR',
    };
  }
}
