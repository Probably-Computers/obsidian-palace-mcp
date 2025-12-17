/**
 * Split decision engine for atomic note system
 *
 * Determines if content should be split and recommends a strategy.
 */

import type { AtomicConfig } from '../../types/index.js';
import type {
  ContentAnalysis,
  SplitDecision,
  SplitViolation,
  SplitStrategy,
} from '../../types/atomic.js';
import { analyzeContent, isCodeHeavy } from './analyzer.js';

/**
 * Default limits for atomic notes
 * Phase 018: Removed hub_filename - hub names are now derived from title
 * Phase 022: Added min_section_lines and max_children for configurable thresholds
 */
const DEFAULT_LIMITS: AtomicConfig = {
  max_lines: 200,
  max_sections: 6,
  section_max_lines: 50,
  auto_split: true,
  // Phase 022: New configurable thresholds
  min_section_lines: 5, // Minimum lines for section to be considered for splitting
  max_children: 10, // Maximum children to create
};

/**
 * Code-heavy content gets more lenient limits
 */
const CODE_HEAVY_MULTIPLIER = 1.5;

/**
 * Minimum sub-concepts to trigger sub-concept split
 */
const MIN_SUB_CONCEPTS_FOR_SPLIT = 3;

/**
 * Determine if content should be split and how
 */
export function shouldSplit(
  content: string,
  config: Partial<AtomicConfig> = {}
): SplitDecision {
  const limits = { ...DEFAULT_LIMITS, ...config };
  const analysis = analyzeContent(content, limits);

  // Adjust limits for code-heavy content
  const effectiveLimits = getEffectiveLimits(limits, analysis);

  // Check for violations
  const violations = checkViolations(analysis, effectiveLimits);

  // Determine if split is needed
  const shouldSplitContent = violations.length > 0;

  // Determine best strategy
  const suggestedStrategy = determineStrategy(analysis, violations);

  // Build reason message
  const reason = buildReason(violations, suggestedStrategy);

  return {
    shouldSplit: shouldSplitContent,
    reason,
    metrics: {
      lineCount: analysis.lineCount,
      sectionCount: analysis.sectionCount,
      wordCount: analysis.wordCount,
      largeSections: analysis.largeSections.length,
      subConcepts: analysis.subConcepts.length,
    },
    violations,
    suggestedStrategy,
  };
}

/**
 * Get effective limits, adjusting for code-heavy content
 */
function getEffectiveLimits(
  limits: AtomicConfig,
  analysis: ContentAnalysis
): AtomicConfig {
  if (isCodeHeavy(analysis)) {
    return {
      ...limits,
      max_lines: Math.floor(limits.max_lines * CODE_HEAVY_MULTIPLIER),
      section_max_lines: limits.section_max_lines
        ? Math.floor(limits.section_max_lines * CODE_HEAVY_MULTIPLIER)
        : undefined,
    };
  }
  return limits;
}

/**
 * Check all limit violations
 */
function checkViolations(
  analysis: ContentAnalysis,
  limits: AtomicConfig
): SplitViolation[] {
  const violations: SplitViolation[] = [];

  // Check total lines
  if (analysis.lineCount > limits.max_lines) {
    violations.push({
      type: 'lines',
      message: `Content exceeds max lines (${analysis.lineCount} > ${limits.max_lines})`,
      value: analysis.lineCount,
      limit: limits.max_lines,
    });
  }

  // Check section count
  if (analysis.sectionCount > limits.max_sections) {
    violations.push({
      type: 'sections',
      message: `Too many sections (${analysis.sectionCount} > ${limits.max_sections})`,
      value: analysis.sectionCount,
      limit: limits.max_sections,
    });
  }

  // Check for large sections
  if (limits.section_max_lines && analysis.largeSections.length > 0) {
    violations.push({
      type: 'section_size',
      message: `${analysis.largeSections.length} section(s) exceed max lines: ${analysis.largeSections.join(', ')}`,
      value: analysis.largeSections.length,
      limit: limits.section_max_lines,
    });
  }

  // Check for many sub-concepts
  if (analysis.subConcepts.length >= MIN_SUB_CONCEPTS_FOR_SPLIT) {
    violations.push({
      type: 'sub_concepts',
      message: `Many sub-concepts detected (${analysis.subConcepts.length})`,
      value: analysis.subConcepts.length,
      limit: MIN_SUB_CONCEPTS_FOR_SPLIT,
    });
  }

  return violations;
}

/**
 * Determine the best split strategy based on violations
 */
function determineStrategy(
  analysis: ContentAnalysis,
  violations: SplitViolation[]
): SplitStrategy {
  if (violations.length === 0) {
    return 'none';
  }

  // Check for specific violation patterns
  const hasLineViolation = violations.some((v) => v.type === 'lines');
  const hasSectionViolation = violations.some((v) => v.type === 'sections');
  const hasLargeSectionViolation = violations.some((v) => v.type === 'section_size');
  const hasSubConceptViolation = violations.some((v) => v.type === 'sub_concepts');

  // If too many sections, split by sections first
  if (hasSectionViolation && analysis.sectionCount > 3) {
    return 'by_sections';
  }

  // If large sections exist, extract them
  if (hasLargeSectionViolation && analysis.largeSections.length > 0) {
    return 'by_large_sections';
  }

  // If many sub-concepts, split by sub-concepts
  if (hasSubConceptViolation && analysis.subConcepts.length >= MIN_SUB_CONCEPTS_FOR_SPLIT) {
    return 'by_sub_concepts';
  }

  // Default to section-based split for line violations
  if (hasLineViolation && analysis.sectionCount >= 2) {
    return 'by_sections';
  }

  // For complex cases with multiple violations
  if (violations.length > 2) {
    return 'hierarchical';
  }

  // Default to section split if we have sections
  if (analysis.sectionCount >= 2) {
    return 'by_sections';
  }

  return 'by_sections';
}

/**
 * Build human-readable reason message
 */
function buildReason(violations: SplitViolation[], strategy: SplitStrategy): string {
  if (violations.length === 0) {
    return 'Content is within atomic limits';
  }

  const violationMessages = violations.map((v) => v.message);
  const strategyMessage = getStrategyMessage(strategy);

  return `${violationMessages.join('; ')}. ${strategyMessage}`;
}

/**
 * Get human-readable strategy description
 */
function getStrategyMessage(strategy: SplitStrategy): string {
  switch (strategy) {
    case 'none':
      return 'No split needed';
    case 'by_sections':
      return 'Recommended: Split by H2 sections';
    case 'by_large_sections':
      return 'Recommended: Extract large sections into separate notes';
    case 'by_sub_concepts':
      return 'Recommended: Split by sub-concepts (H3+ headings)';
    case 'hierarchical':
      return 'Recommended: Create hierarchical structure with sub-hubs';
    default:
      return 'Split recommended';
  }
}

/**
 * Check if content needs splitting based on config
 */
export function needsSplit(
  content: string,
  config: Partial<AtomicConfig> = {}
): boolean {
  const decision = shouldSplit(content, config);
  return decision.shouldSplit;
}

/**
 * Get analysis and decision together
 */
export function analyzeForSplit(
  content: string,
  config: Partial<AtomicConfig> = {}
): { analysis: ContentAnalysis; decision: SplitDecision } {
  const limits = { ...DEFAULT_LIMITS, ...config };
  const analysis = analyzeContent(content, limits);
  const decision = shouldSplit(content, config);

  return { analysis, decision };
}
