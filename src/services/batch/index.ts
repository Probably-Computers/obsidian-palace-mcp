/**
 * Batch operations service (Phase 027)
 *
 * Provides batch operations for multiple notes at once:
 * - Note selection by glob or query
 * - Bulk frontmatter updates
 * - Bulk tag operations
 * - Bulk move/rename
 * - Bulk delete
 */

export {
  selectNotes,
  validateSelectionCriteria,
  type SelectCriteria,
  type SelectedNote,
  type SelectionResult,
} from './selector.js';

export {
  updateFrontmatter,
  addTags,
  removeTags,
  moveNotes,
  renameNotes,
  deleteNotes,
  type OperationResult,
  type BatchOperationResult,
} from './operations.js';
