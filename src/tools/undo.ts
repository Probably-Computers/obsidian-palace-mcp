/**
 * palace_undo tool (Phase 028)
 *
 * Undo recent operations using operation tracking and version history
 */

import { z } from 'zod';
import { join } from 'path';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname } from 'path';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getVaultRegistry } from '../services/vault/index.js';
import {
  getOperation,
  getRecentOperations,
  type Operation,
} from '../services/operations/tracker.js';
import {
  getVersionContent,
  listVersions,
} from '../services/history/index.js';
import { indexNote, removeFromIndex } from '../services/index/sync.js';
import { readNote } from '../services/vault/index.js';
import { createDatabase } from '../services/index/sqlite.js';
import { logger } from '../utils/logger.js';
import type { ToolResult } from '../types/index.js';

/**
 * Input schema for palace_undo
 */
export const undoSchema = z.object({
  operation_id: z.string().optional().describe('Specific operation ID to undo'),
  vault: z.string().optional().describe('Vault alias (defaults to default vault)'),
  list: z.boolean().default(false).describe('List recent undoable operations'),
  limit: z.number().default(10).describe('Max operations to list'),
  dry_run: z.boolean().default(true).describe('Preview changes without modifying'),
});

export type UndoInput = z.infer<typeof undoSchema>;

/**
 * Operation listing entry
 */
interface UndoableOperation {
  id: string;
  type: string;
  timestamp: string;
  files_created: number;
  files_modified: number;
  files_deleted: number;
  undoable: boolean;
  reason?: string | undefined;
}

/**
 * Undo list result
 */
interface UndoListResult {
  operations: UndoableOperation[];
}

/**
 * Undo execution result
 */
interface UndoResult {
  success: boolean;
  operation_id: string;
  operation_type: string;
  files_deleted: string[];
  files_restored: string[];
  files_failed: string[];
  dry_run: boolean;
  warnings: string[];
}

/**
 * Handler for palace_undo (internal)
 */
async function undoHandlerInternal(
  input: UndoInput
): Promise<ToolResult<UndoListResult | UndoResult>> {
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

    // List mode
    if (input.list) {
      return listUndoableOperations(vault.alias, input.limit);
    }

    // Undo mode - requires operation_id
    if (!input.operation_id) {
      return {
        success: false,
        error: 'operation_id is required when list is false',
        code: 'VALIDATION_ERROR',
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

    // Get the operation
    const operation = getOperation(input.operation_id);
    if (!operation) {
      return {
        success: false,
        error: `Operation not found: ${input.operation_id}`,
        code: 'OPERATION_NOT_FOUND',
      };
    }

    // Check if operation belongs to this vault
    if (operation.vaultAlias !== vault.alias) {
      return {
        success: false,
        error: `Operation belongs to vault '${operation.vaultAlias}', not '${vault.alias}'`,
        code: 'VAULT_MISMATCH',
      };
    }

    // Execute undo
    return executeUndo(operation, vault.path, palaceDir, input.dry_run);
  } catch (error) {
    return {
      success: false,
      error: `Failed to undo: ${error instanceof Error ? error.message : String(error)}`,
      code: 'UNDO_ERROR',
    };
  }
}

/**
 * List recent undoable operations
 */
function listUndoableOperations(
  vaultAlias: string,
  limit: number
): ToolResult<UndoListResult> {
  const operations = getRecentOperations(vaultAlias, limit);

  const undoableOps: UndoableOperation[] = operations.map((op) => {
    // Determine if operation is undoable
    const { undoable, reason } = checkUndoable(op);

    const entry: UndoableOperation = {
      id: op.id,
      type: op.type,
      timestamp: op.timestamp,
      files_created: op.filesCreated.length,
      files_modified: op.filesModified.length,
      files_deleted: op.filesDeleted.length,
      undoable,
    };

    if (reason !== undefined) {
      entry.reason = reason;
    }

    return entry;
  });

  return {
    success: true,
    data: { operations: undoableOps },
  };
}

/**
 * Check if an operation is undoable
 */
function checkUndoable(operation: Operation): { undoable: boolean; reason?: string } {
  // Store operations can be undone by deleting created files
  if (operation.type === 'store') {
    if (operation.filesCreated.length === 0) {
      return { undoable: false, reason: 'No files were created' };
    }
    return { undoable: true };
  }

  // Split operations can be undone by deleting created files (children) and restoring hub
  if (operation.type === 'split') {
    return { undoable: true };
  }

  // Improve operations can be undone by restoring from version history
  if (operation.type === 'improve') {
    if (operation.filesModified.length === 0) {
      return { undoable: false, reason: 'No files were modified' };
    }
    return { undoable: true };
  }

  // Delete operations can be undone by restoring from version history
  if (operation.type === 'delete') {
    if (operation.filesDeleted.length === 0) {
      return { undoable: false, reason: 'No files were deleted' };
    }
    return { undoable: true };
  }

  return { undoable: false, reason: `Unknown operation type: ${operation.type}` };
}

/**
 * Execute the undo operation
 */
async function executeUndo(
  operation: Operation,
  vaultPath: string,
  palaceDir: string,
  dryRun: boolean
): Promise<ToolResult<UndoResult>> {
  const filesDeleted: string[] = [];
  const filesRestored: string[] = [];
  const filesFailed: string[] = [];
  const warnings: string[] = [];

  // Check if operation is undoable
  const { undoable, reason } = checkUndoable(operation);
  if (!undoable) {
    return {
      success: false,
      error: `Operation cannot be undone: ${reason}`,
      code: 'NOT_UNDOABLE',
    };
  }

  // Handle different operation types
  switch (operation.type) {
    case 'store':
    case 'split':
      // Delete created files
      for (const path of operation.filesCreated) {
        const fullPath = join(vaultPath, path);
        if (existsSync(fullPath)) {
          if (!dryRun) {
            try {
              await unlink(fullPath);
              filesDeleted.push(path);

              // Remove from index
              try {
                const db = createDatabase(join(palaceDir, 'index.sqlite'));
                removeFromIndex(db, path);
                db.close();
              } catch (indexError) {
                warnings.push(`Failed to remove ${path} from index`);
              }
            } catch (error) {
              filesFailed.push(path);
              warnings.push(`Failed to delete ${path}: ${error instanceof Error ? error.message : String(error)}`);
            }
          } else {
            filesDeleted.push(path);
          }
        } else {
          warnings.push(`File no longer exists: ${path}`);
        }
      }

      // Restore modified files from history (for split operations that modify the hub)
      for (const path of operation.filesModified) {
        const restored = await restoreFromHistory(
          path,
          vaultPath,
          palaceDir,
          dryRun,
          warnings
        );
        if (restored) {
          filesRestored.push(path);
        } else {
          filesFailed.push(path);
        }
      }
      break;

    case 'improve':
      // Restore modified files from history
      for (const path of operation.filesModified) {
        const restored = await restoreFromHistory(
          path,
          vaultPath,
          palaceDir,
          dryRun,
          warnings
        );
        if (restored) {
          filesRestored.push(path);
        } else {
          filesFailed.push(path);
        }
      }
      break;

    case 'delete':
      // Restore deleted files from history
      for (const path of operation.filesDeleted) {
        const restored = await restoreFromHistory(
          path,
          vaultPath,
          palaceDir,
          dryRun,
          warnings
        );
        if (restored) {
          filesRestored.push(path);
        } else {
          filesFailed.push(path);
        }
      }
      break;
  }

  if (dryRun) {
    warnings.unshift('DRY RUN - no changes made. Set dry_run: false to execute.');
  }

  return {
    success: true,
    data: {
      success: filesFailed.length === 0,
      operation_id: operation.id,
      operation_type: operation.type,
      files_deleted: filesDeleted,
      files_restored: filesRestored,
      files_failed: filesFailed,
      dry_run: dryRun,
      warnings,
    },
  };
}

/**
 * Restore a file from version history
 */
async function restoreFromHistory(
  path: string,
  vaultPath: string,
  palaceDir: string,
  dryRun: boolean,
  warnings: string[]
): Promise<boolean> {
  const fullPath = join(vaultPath, path);

  // Get versions for this file
  const versions = await listVersions(palaceDir, path);

  if (versions.length === 0) {
    warnings.push(`No version history for ${path}`);
    return false;
  }

  // Get the most recent version (should be the state before the operation)
  const latestVersion = versions[0];
  if (!latestVersion) {
    warnings.push(`No version history for ${path}`);
    return false;
  }

  const content = await getVersionContent(palaceDir, path, latestVersion.version);
  if (!content) {
    warnings.push(`Failed to read version ${latestVersion.version} for ${path}`);
    return false;
  }

  if (!dryRun) {
    try {
      // Ensure directory exists
      await mkdir(dirname(fullPath), { recursive: true });

      // Write the restored content
      await writeFile(fullPath, content, 'utf-8');
      logger.info(`Restored ${path} from version ${latestVersion.version}`);

      // Update the index
      try {
        const db = createDatabase(join(palaceDir, 'index.sqlite'));
        // Re-read the note to get the proper Note object for indexing
        const restoredNote = await readNote(path, { vaultPath });
        if (restoredNote) {
          indexNote(db, restoredNote);
        }
        db.close();
      } catch (indexError) {
        warnings.push(`Failed to update index for ${path}`);
      }
    } catch (error) {
      warnings.push(`Failed to restore ${path}: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  return true;
}

/**
 * Tool definition for palace_undo
 */
export const undoTool: Tool = {
  name: 'palace_undo',
  description:
    'Undo recent operations by operation ID. Use list: true to see recent undoable operations. Supports undoing store, improve, split, and delete operations.',
  inputSchema: {
    type: 'object',
    properties: {
      operation_id: {
        type: 'string',
        description: 'Specific operation ID to undo',
      },
      vault: {
        type: 'string',
        description: 'Vault alias (defaults to default vault)',
      },
      list: {
        type: 'boolean',
        description: 'List recent undoable operations (default: false)',
        default: false,
      },
      limit: {
        type: 'number',
        description: 'Max operations to list (default: 10)',
        default: 10,
      },
      dry_run: {
        type: 'boolean',
        description: 'Preview changes without modifying (default: true)',
        default: true,
      },
    },
    required: [],
  },
};

/**
 * Wrapper handler that validates input
 */
export async function undoHandler(
  args: Record<string, unknown>
): Promise<ToolResult<UndoListResult | UndoResult>> {
  const parsed = undoSchema.safeParse(args);
  if (!parsed.success) {
    return {
      success: false,
      error: `Invalid input: ${parsed.error.message}`,
      code: 'VALIDATION_ERROR',
    };
  }

  return undoHandlerInternal(parsed.data);
}
