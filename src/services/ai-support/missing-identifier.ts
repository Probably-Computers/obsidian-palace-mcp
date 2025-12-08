/**
 * Missing context identifier for AI support tools
 *
 * Identifies what context is missing from a partial storage intent
 * to help AI ask the right clarifying questions.
 */

import type {
  MissingContextType,
  MissingContextResult,
  PartialStorageIntent,
  DetectedContext,
} from '../../types/clarify.js';
import type { IntentKnowledgeType } from '../../types/intent.js';

// Required fields by knowledge type
const REQUIRED_BY_TYPE: Record<IntentKnowledgeType, MissingContextType[]> = {
  // Layer 1 - Technical (never trapped in projects)
  technology: ['domain'],
  command: ['domain', 'technologies'],
  reference: ['domain'],

  // Layer 2 - Domain
  standard: ['domain', 'scope'],
  pattern: ['domain', 'scope'],
  research: ['domain', 'scope'],

  // Layer 3 - Contextual (always need context)
  decision: ['domain', 'scope', 'project'],
  configuration: ['domain', 'scope', 'technologies'],
  troubleshooting: ['domain', 'scope', 'technologies'],

  // Generic
  note: ['domain'],
};

// Scope-dependent requirements
const SCOPE_REQUIREMENTS: Record<string, MissingContextType[]> = {
  'project-specific': ['project'],
  general: [],
};

/**
 * Check if a field is complete in the intent
 */
function isFieldComplete(
  field: MissingContextType,
  intent: PartialStorageIntent
): boolean {
  switch (field) {
    case 'scope':
      return !!intent.scope;

    case 'project':
      // Only required if scope is project-specific
      if (intent.scope !== 'project-specific') return true;
      return !!intent.project;

    case 'client':
      // Optional unless explicitly needed
      return true;

    case 'technologies':
      // At least one technology should be specified for tech-related types
      return !!(intent.technologies && intent.technologies.length > 0);

    case 'domain':
      // At least one domain should be specified
      return !!(intent.domain && intent.domain.length > 0);

    default:
      return true;
  }
}

/**
 * Check if a field is partially complete
 */
function isFieldPartial(
  field: MissingContextType,
  intent: PartialStorageIntent,
  detected: DetectedContext | undefined
): boolean {
  switch (field) {
    case 'scope':
      // Partial if we have hints but no explicit value
      return !intent.scope && !!detected?.scope && detected.scope.confidence >= 0.5;

    case 'project':
      // Partial if we have hints but no explicit value
      return (
        !intent.project &&
        !!detected?.projects &&
        detected.projects.length > 0 &&
        detected.projects[0]!.confidence >= 0.5
      );

    case 'client':
      return (
        !intent.client &&
        !!detected?.clients &&
        detected.clients.length > 0 &&
        detected.clients[0]!.confidence >= 0.5
      );

    case 'technologies':
      // Partial if we detected some but none were specified
      return (
        (!intent.technologies || intent.technologies.length === 0) &&
        !!detected?.technologies &&
        detected.technologies.length > 0
      );

    case 'domain':
      // Partial if we detected some but none were specified
      return (
        (!intent.domain || intent.domain.length === 0) &&
        !!detected?.domains &&
        detected.domains.length > 0
      );

    default:
      return false;
  }
}

/**
 * Get reason why a field is missing
 */
function getMissingReason(
  field: MissingContextType,
  intent: PartialStorageIntent,
  detected: DetectedContext | undefined
): string {
  switch (field) {
    case 'scope':
      if (detected?.scope && detected.scope.confidence >= 0.5) {
        return `Detected ${detected.scope.likely} scope (${Math.round(detected.scope.confidence * 100)}% confidence) but needs confirmation`;
      }
      return 'Unable to determine if this is general knowledge or project-specific';

    case 'project':
      if (detected?.projects && detected.projects.length > 0) {
        const top = detected.projects[0]!;
        return `Possible project "${top.name}" detected but needs confirmation`;
      }
      return 'Project-specific scope requires a project name';

    case 'client':
      if (detected?.clients && detected.clients.length > 0) {
        const top = detected.clients[0]!;
        return `Possible client "${top.name}" detected but needs confirmation`;
      }
      return 'Client context could help with organization';

    case 'technologies':
      if (detected?.technologies && detected.technologies.length > 0) {
        const techs = detected.technologies.map((t) => t.name).join(', ');
        return `Detected technologies (${techs}) but should confirm which to link`;
      }
      return 'Knowledge type typically requires technology links';

    case 'domain':
      if (detected?.domains && detected.domains.length > 0) {
        const domains = detected.domains.map((d) => d.name).join(', ');
        return `Detected domains (${domains}) but should confirm categorization`;
      }
      return 'Domain categorization is required for proper organization';

    default:
      return 'This field is required';
  }
}

/**
 * Identify missing context from a partial storage intent
 */
export function identifyMissing(
  intent: PartialStorageIntent,
  detected?: DetectedContext
): MissingContextResult {
  const missing: MissingContextType[] = [];
  const partial: MissingContextType[] = [];
  const complete: MissingContextType[] = [];
  const reasons: Record<MissingContextType, string> = {} as Record<
    MissingContextType,
    string
  >;

  // Get required fields for this knowledge type
  const knowledgeType = intent.knowledge_type ?? 'note';
  const requiredFields = REQUIRED_BY_TYPE[knowledgeType] ?? ['domain'];

  // Add scope-dependent requirements
  if (intent.scope) {
    const scopeReqs = SCOPE_REQUIREMENTS[intent.scope] ?? [];
    for (const field of scopeReqs) {
      if (!requiredFields.includes(field)) {
        requiredFields.push(field);
      }
    }
  }

  // Check each required field
  for (const field of requiredFields) {
    if (isFieldComplete(field, intent)) {
      complete.push(field);
    } else if (isFieldPartial(field, intent, detected)) {
      partial.push(field);
      reasons[field] = getMissingReason(field, intent, detected);
    } else {
      missing.push(field);
      reasons[field] = getMissingReason(field, intent, detected);
    }
  }

  // Special case: if scope is missing, we might need to ask about project
  // even if project isn't in required fields yet
  if (!intent.scope && detected?.scope?.likely === 'project-specific') {
    if (!missing.includes('project') && !partial.includes('project')) {
      partial.push('scope');
      reasons['scope'] = 'Scope appears project-specific but should confirm';

      // Also mark project as partial if not already
      if (!partial.includes('project') && !complete.includes('project')) {
        partial.push('project');
        reasons['project'] = 'Project name may be needed if scope is confirmed as project-specific';
      }
    }
  }

  return {
    missing,
    partial,
    complete,
    reasons,
  };
}

/**
 * Check if an intent is complete enough to proceed with storage
 */
export function isIntentComplete(
  intent: PartialStorageIntent,
  strict = false
): boolean {
  const knowledgeType = intent.knowledge_type ?? 'note';
  const requiredFields = REQUIRED_BY_TYPE[knowledgeType] ?? ['domain'];

  for (const field of requiredFields) {
    if (!isFieldComplete(field, intent)) {
      return false;
    }
  }

  // In strict mode, also check scope-dependent requirements
  if (strict && intent.scope) {
    const scopeReqs = SCOPE_REQUIREMENTS[intent.scope] ?? [];
    for (const field of scopeReqs) {
      if (!isFieldComplete(field, intent)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Get recommended priority order for missing fields
 */
export function prioritizeMissing(
  missing: MissingContextType[],
  partial: MissingContextType[]
): MissingContextType[] {
  // Priority order: scope first (determines other requirements),
  // then domain, then project/client, then technologies
  const priority: MissingContextType[] = [
    'scope',
    'domain',
    'project',
    'client',
    'technologies',
  ];

  const combined = [...missing, ...partial];
  return priority.filter((field) => combined.includes(field));
}
