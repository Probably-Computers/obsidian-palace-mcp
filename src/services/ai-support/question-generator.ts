/**
 * Question generator for AI support tools (Phase 017)
 *
 * Generates contextual clarifying questions based on missing
 * context and detected hints.
 *
 * Phase 017 changes:
 * - Removed scope/technologies questions
 * - Added capture_type and source_info questions
 */

import type {
  MissingContextType,
  ClarifyQuestion,
  DetectedContext,
  ClarifySuggestions,
  QuestionType,
} from '../../types/clarify.js';
import type { CaptureType } from '../../types/intent.js';

// Question templates by missing context type
const QUESTION_TEMPLATES: Record<
  MissingContextType,
  {
    question: string;
    type: QuestionType;
    baseOptions?: string[];
  }
> = {
  capture_type: {
    question:
      'What type of capture is this {topic}?',
    type: 'choice',
    baseOptions: ['Knowledge - Reusable information', 'Source - From a book/article/video', 'Project - Project-specific context'],
  },
  domain: {
    question: 'How should I categorize this {topic}?',
    type: 'choice',
  },
  project: {
    question: 'Which project is this {topic} for?',
    type: 'choice',
    baseOptions: ['Other'],
  },
  client: {
    question: 'Which client is this {topic} for?',
    type: 'choice',
    baseOptions: ['Other', 'Not client-specific'],
  },
  source_info: {
    question: 'What is the source of this {topic}?',
    type: 'text',
  },
};

/**
 * Generate a contextual topic description from title/content
 */
function getTopicDescription(title: string, _contentPreview: string): string {
  // Try to extract a meaningful topic from the title
  const titleLower = title.toLowerCase();

  // Common patterns to make more readable
  if (titleLower.includes('configuration') || titleLower.includes('config')) {
    return 'configuration';
  }
  if (titleLower.includes('troubleshooting') || titleLower.includes('debug')) {
    return 'troubleshooting guide';
  }
  if (titleLower.includes('guide') || titleLower.includes('tutorial')) {
    return 'guide';
  }
  if (titleLower.includes('command') || titleLower.includes('cli')) {
    return 'command reference';
  }
  if (titleLower.includes('pattern') || titleLower.includes('practice')) {
    return 'pattern';
  }

  // Default to a simplified version of the title
  return title.length > 30 ? `${title.slice(0, 30)}...` : title;
}

/**
 * Generate question for a specific missing context type
 */
function generateQuestionForField(
  field: MissingContextType,
  title: string,
  contentPreview: string,
  detected: DetectedContext,
  _reason: string
): ClarifyQuestion {
  const template = QUESTION_TEMPLATES[field];
  const topic = getTopicDescription(title, contentPreview);

  // Start with base question
  let question = template.question.replace('{topic}', topic);
  let options = template.baseOptions ? [...template.baseOptions] : undefined;
  let detectedHints: string[] = [];
  let defaultValue: string | undefined;

  // Customize based on field and detected context
  switch (field) {
    case 'capture_type':
      if (detected.capture_type) {
        detectedHints = detected.capture_type.indicators.slice(0, 3);
        if (detected.capture_type.confidence >= 0.6) {
          const typeMap: Record<CaptureType, string> = {
            knowledge: 'Knowledge - Reusable information',
            source: 'Source - From a book/article/video',
            project: 'Project - Project-specific context',
          };
          defaultValue = typeMap[detected.capture_type.likely];
        }
      }
      break;

    case 'domain':
      if (detected.domains.length > 0) {
        // Add detected domains as options
        const domainNames = detected.domains.map((d) => d.name);
        options = [...domainNames, 'Other'];
        detectedHints = domainNames.map(
          (d) => `Detected domain: ${d}`
        );

        if (detected.domains[0]!.confidence >= 0.6) {
          defaultValue = detected.domains[0]!.name;
        }
      } else {
        // Provide common domain options
        options = [
          'networking',
          'security',
          'database',
          'devops',
          'frontend',
          'backend',
          'testing',
          'Other',
        ];
      }
      break;

    case 'project':
      if (detected.projects.length > 0) {
        // Add detected projects as options
        const projectNames = detected.projects.map((p) => p.name);
        options = [...projectNames, ...(options ?? [])];
        detectedHints = projectNames.map((p) => `Detected project: ${p}`);

        // Set default to highest confidence project
        if (detected.projects[0]!.confidence >= 0.6) {
          defaultValue = detected.projects[0]!.name;
        }
      }
      break;

    case 'client':
      if (detected.clients.length > 0) {
        // Add detected clients as options
        const clientNames = detected.clients.map((c) => c.name);
        options = [...clientNames, ...(options ?? [])];
        detectedHints = clientNames.map((c) => `Detected client: ${c}`);

        if (detected.clients[0]!.confidence >= 0.6) {
          defaultValue = detected.clients[0]!.name;
        }
      }
      break;

    case 'source_info':
      // Source info is typically text input
      question = 'Please provide source details (title, author, URL if applicable):';
      break;
  }

  return {
    key: field,
    question,
    type: template.type,
    options: options?.length ? options : undefined,
    detected_hints: detectedHints.length > 0 ? detectedHints : undefined,
    default: defaultValue,
  };
}

/**
 * Generate all questions for missing/partial fields
 */
export function generateQuestions(
  missing: MissingContextType[],
  partial: MissingContextType[],
  title: string,
  contentPreview: string,
  detected: DetectedContext,
  reasons: Record<MissingContextType, string>
): ClarifyQuestion[] {
  const questions: ClarifyQuestion[] = [];

  // Generate questions for missing fields first (higher priority)
  for (const field of missing) {
    const reason = reasons[field] ?? '';
    questions.push(
      generateQuestionForField(field, title, contentPreview, detected, reason)
    );
  }

  // Then for partial fields (have hints but need confirmation)
  for (const field of partial) {
    const reason = reasons[field] ?? '';
    questions.push(
      generateQuestionForField(field, title, contentPreview, detected, reason)
    );
  }

  return questions;
}

/**
 * Generate suggestions based on detected context (Phase 017)
 */
export function generateSuggestions(detected: DetectedContext): ClarifySuggestions {
  const suggestions: ClarifySuggestions = {};

  // Suggest capture_type if confident enough
  if (detected.capture_type && detected.capture_type.confidence >= 0.5) {
    suggestions.capture_type = detected.capture_type.likely;
  }

  // Suggest project if confident enough
  if (detected.projects.length > 0 && detected.projects[0]!.confidence >= 0.5) {
    suggestions.project = detected.projects[0]!.name;
  }

  // Suggest client if confident enough
  if (detected.clients.length > 0 && detected.clients[0]!.confidence >= 0.5) {
    suggestions.client = detected.clients[0]!.name;
  }

  // Suggest domains (all with confidence >= 0.5)
  const confidentDomains = detected.domains
    .filter((d) => d.confidence >= 0.5)
    .map((d) => d.name);
  if (confidentDomains.length > 0) {
    suggestions.domain = confidentDomains;
  }

  return suggestions;
}

/**
 * Calculate overall confidence in the detection (Phase 017)
 */
export function calculateConfidence(
  detected: DetectedContext,
  missing: MissingContextType[],
  _partial: MissingContextType[]
): { overall: number; per_field: Record<string, number> } {
  const perField: Record<string, number> = {};

  // Capture type confidence
  perField['capture_type'] = detected.capture_type?.confidence ?? 0;

  // Domain confidence (highest detected)
  perField['domain'] =
    detected.domains.length > 0 ? detected.domains[0]!.confidence : 0;

  // Project confidence (highest detected)
  perField['project'] =
    detected.projects.length > 0 ? detected.projects[0]!.confidence : 0;

  // Client confidence (highest detected)
  perField['client'] =
    detected.clients.length > 0 ? detected.clients[0]!.confidence : 0;

  // Calculate overall confidence
  // Weight by importance and penalize missing fields
  const weights = {
    capture_type: 0.3,
    domain: 0.35,
    project: 0.2,
    client: 0.15,
  };

  let overall = 0;
  let totalWeight = 0;

  for (const [field, weight] of Object.entries(weights)) {
    const confidence = perField[field] ?? 0;

    // Penalize if field is missing
    if (missing.includes(field as MissingContextType)) {
      overall += confidence * weight * 0.5;
    } else {
      overall += confidence * weight;
    }
    totalWeight += weight;
  }

  overall = overall / totalWeight;

  return {
    overall: Math.round(overall * 100) / 100,
    per_field: Object.fromEntries(
      Object.entries(perField).map(([k, v]) => [k, Math.round(v * 100) / 100])
    ),
  };
}

/**
 * Generate a summary message based on detection results
 */
export function generateSummaryMessage(
  questions: ClarifyQuestion[],
  _suggestions: ClarifySuggestions,
  overall: number
): string {
  if (questions.length === 0) {
    return 'Context detection complete. All fields have sufficient information.';
  }

  const fieldNames = questions.map((q) => q.key);

  if (overall >= 0.7) {
    return `High confidence detection. Please confirm: ${fieldNames.join(', ')}`;
  } else if (overall >= 0.4) {
    return `Partial context detected. Need clarification on: ${fieldNames.join(', ')}`;
  } else {
    return `Limited context detected. Please provide: ${fieldNames.join(', ')}`;
  }
}
