/**
 * AI Support Services (Phase 017)
 *
 * Exports for context detection, missing identification,
 * and question generation.
 */

// Context detector
export {
  detectContext,
  detectDomains,
  detectProjects,
  detectClients,
  detectCaptureType,
  buildDomainVocabulary,
  buildProjectVocabulary,
  buildClientVocabulary,
} from './context-detector.js';

// Missing identifier
export {
  identifyMissing,
  isIntentComplete,
  prioritizeMissing,
} from './missing-identifier.js';

// Question generator
export {
  generateQuestions,
  generateSuggestions,
  calculateConfidence,
  generateSummaryMessage,
} from './question-generator.js';
