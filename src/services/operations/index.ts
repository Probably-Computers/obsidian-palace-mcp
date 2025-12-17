/**
 * Operations service exports
 *
 * Phase 023: Note Lifecycle Management
 */

export {
  startOperation,
  trackFileCreated,
  trackFileModified,
  trackFileDeleted,
  getOperation,
  getRecentOperations,
  getFilesCreatedByOperation,
  getOperationSummary,
  clearOperations,
  type Operation,
  type OperationType,
} from './tracker.js';

export {
  generateCleanupSuggestions,
  generateReplaceCleanupSuggestions,
  generateDeletionCleanupSuggestions,
} from './cleanup.js';
