/**
 * Atomic note system - barrel export
 *
 * Provides atomic note management with enforced size limits,
 * hub patterns, and auto-splitting capabilities.
 */

// Analyzer
export {
  analyzeContent,
  isCodeHeavy,
  extractTitle,
  extractWikiLinks,
} from './analyzer.js';

// Decision engine
export {
  shouldSplit,
  needsSplit,
  analyzeForSplit,
} from './decision.js';

// Splitter
export {
  splitContent,
  splitBySections,
  splitByLargeSections,
  splitBySubConcepts,
  splitHierarchical,
  updateLinksInContent,
  validateSplitResult,
} from './splitter.js';

// Hub manager
export {
  createHub,
  getHubInfo,
  updateHub,
  addChild,
  removeChild,
  isHubPath,
  getHubPath,
  createChildNote,
} from './hub-manager.js';

// Re-export types
export type {
  ContentAnalysis,
  SectionInfo,
  SubConcept,
  CodeBlockInfo,
  SplitDecision,
  SplitViolation,
  SplitStrategy,
  SplitResult,
  SplitOptions,
  HubContent,
  ChildContent,
  HubFrontmatter,
  ChildFrontmatter,
  LinkUpdate,
  HubInfo,
  HubChild,
  HubOperationResult,
  HubManagerOptions,
} from '../../types/atomic.js';
