/**
 * Metadata services (Phase 025)
 *
 * Services for metadata validation, analysis, and repair.
 */

export {
  analyzeDomains,
  suggestDomainConsolidation,
  getDomainStats,
  type DomainUsage,
  type DomainSimilarity,
  type DomainAnalysisResult,
} from './domain-analyzer.js';

export {
  checkIndexSync,
  repairIndexSync,
  fullReindex,
  type IndexDesync,
  type IndexSyncResult,
} from './index-sync.js';
