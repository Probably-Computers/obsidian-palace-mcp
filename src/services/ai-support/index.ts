/**
 * AI Support Services
 *
 * Exports for context detection, missing identification,
 * and question generation.
 */

// Context detector
export {
  detectContext,
  detectTechnologies,
  detectProjects,
  detectClients,
  detectScope,
  detectDomains,
  buildTechVocabulary,
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
