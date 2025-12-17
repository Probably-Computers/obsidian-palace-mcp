/**
 * Operation tracking service
 *
 * Phase 023: Note Lifecycle Management
 * - Tracks files created/modified per operation
 * - Enables cleanup by operation ID
 * - Stores operation metadata for audit/undo purposes
 */

import { randomUUID } from 'crypto';
import { logger } from '../../utils/logger.js';

/**
 * Operation types
 */
export type OperationType = 'store' | 'improve' | 'split' | 'delete';

/**
 * Operation metadata
 */
export interface Operation {
  id: string;
  type: OperationType;
  timestamp: string;
  vaultAlias: string;
  filesCreated: string[];
  filesModified: string[];
  filesDeleted: string[];
  metadata?: Record<string, unknown> | undefined;
}

/**
 * In-memory operation store
 * Operations are kept in memory for the session
 * This is sufficient for undo/cleanup within a session
 */
const operationStore = new Map<string, Operation>();

/**
 * Per-vault operation history (most recent first)
 */
const vaultOperations = new Map<string, string[]>();

/**
 * Maximum operations to keep per vault
 */
const MAX_OPERATIONS_PER_VAULT = 100;

/**
 * Start a new operation
 */
export function startOperation(
  type: OperationType,
  vaultAlias: string,
  metadata?: Record<string, unknown>
): Operation {
  const operation: Operation = {
    id: randomUUID(),
    type,
    timestamp: new Date().toISOString(),
    vaultAlias,
    filesCreated: [],
    filesModified: [],
    filesDeleted: [],
    metadata,
  };

  operationStore.set(operation.id, operation);

  // Add to vault history
  const history = vaultOperations.get(vaultAlias) ?? [];
  history.unshift(operation.id);

  // Trim old operations
  if (history.length > MAX_OPERATIONS_PER_VAULT) {
    const removed = history.splice(MAX_OPERATIONS_PER_VAULT);
    for (const id of removed) {
      operationStore.delete(id);
    }
  }

  vaultOperations.set(vaultAlias, history);

  logger.debug(`Started operation ${operation.id} (${type}) for vault ${vaultAlias}`);

  return operation;
}

/**
 * Track a file creation in the current operation
 */
export function trackFileCreated(operationId: string, filePath: string): void {
  const operation = operationStore.get(operationId);
  if (operation) {
    operation.filesCreated.push(filePath);
    logger.debug(`Tracked file creation: ${filePath} in operation ${operationId}`);
  }
}

/**
 * Track a file modification in the current operation
 */
export function trackFileModified(operationId: string, filePath: string): void {
  const operation = operationStore.get(operationId);
  if (operation) {
    // Avoid duplicates
    if (!operation.filesModified.includes(filePath)) {
      operation.filesModified.push(filePath);
      logger.debug(`Tracked file modification: ${filePath} in operation ${operationId}`);
    }
  }
}

/**
 * Track a file deletion in the current operation
 */
export function trackFileDeleted(operationId: string, filePath: string): void {
  const operation = operationStore.get(operationId);
  if (operation) {
    operation.filesDeleted.push(filePath);
    logger.debug(`Tracked file deletion: ${filePath} in operation ${operationId}`);
  }
}

/**
 * Get operation by ID
 */
export function getOperation(operationId: string): Operation | undefined {
  return operationStore.get(operationId);
}

/**
 * Get recent operations for a vault
 */
export function getRecentOperations(vaultAlias: string, limit = 10): Operation[] {
  const history = vaultOperations.get(vaultAlias) ?? [];
  const operations: Operation[] = [];

  for (const id of history.slice(0, limit)) {
    const op = operationStore.get(id);
    if (op) {
      operations.push(op);
    }
  }

  return operations;
}

/**
 * Get all files created by an operation (for cleanup)
 */
export function getFilesCreatedByOperation(operationId: string): string[] {
  const operation = operationStore.get(operationId);
  return operation?.filesCreated ?? [];
}

/**
 * Get operation summary for response
 */
export function getOperationSummary(operationId: string): {
  operation_id: string;
  type: OperationType;
  files_created: number;
  files_modified: number;
  files_deleted: number;
} | null {
  const operation = operationStore.get(operationId);
  if (!operation) return null;

  return {
    operation_id: operation.id,
    type: operation.type,
    files_created: operation.filesCreated.length,
    files_modified: operation.filesModified.length,
    files_deleted: operation.filesDeleted.length,
  };
}

/**
 * Clear all operations (useful for testing)
 */
export function clearOperations(): void {
  operationStore.clear();
  vaultOperations.clear();
}
