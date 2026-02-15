/**
 * History service exports (Phase 028)
 */

export {
  // Storage functions
  saveVersion,
  getLatestVersionNumber,
  listVersions,
  getVersion,
  getVersionContent,
  cleanupOldVersions,
  deleteAllVersions,
  getHistoryStats,
  // Path utilities
  getPathHash,
  getHistoryDir,
  getNoteHistoryDir,
  // Types and defaults
  DEFAULT_HISTORY_CONFIG,
  type VersionMetadata,
  type VersionEntry,
  type HistoryConfig,
} from './storage.js';

export {
  // Diff generation
  generateDiff,
  formatUnifiedDiff,
  generateFrontmatterDiff,
  formatFrontmatterDiff,
  generateChangeSummary,
  // Types
  type DiffLine,
  type DiffLineType,
  type DiffHunk,
  type DiffResult,
  type FrontmatterDiff,
} from './diff.js';
