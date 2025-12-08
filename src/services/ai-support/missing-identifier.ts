/**
 * Missing context identifier for AI support tools (Phase 017)
 *
 * Identifies what context is missing from a partial storage intent
 * to help AI ask the right clarifying questions.
 *
 * Phase 017 changes:
 * - Simplified to 3 capture types: source, knowledge, project
 * - Removed scope/technologies requirements
 * - Added source_info and capture_type requirements
 */

import type {
  MissingContextType,
  MissingContextResult,
  PartialStorageIntent,
  DetectedContext,
} from '../../types/clarify.js';
import type { CaptureType } from '../../types/intent.js';

// Required fields by capture type
const REQUIRED_BY_CAPTURE_TYPE: Record<CaptureType, MissingContextType[]> = {
  source: ['domain', 'source_info'],
  knowledge: ['domain'],
  project: ['domain', 'project'],
};

/**
 * Check if a field is complete in the intent
 */
function isFieldComplete(
  field: MissingContextType,
  intent: PartialStorageIntent
): boolean {
  switch (field) {
    case 'capture_type':
      return !!intent.capture_type;

    case 'domain':
      // At least one domain should be specified
      return !!(intent.domain && intent.domain.length > 0);

    case 'project':
      // Only required if capture_type is project
      if (intent.capture_type !== 'project') return true;
      return !!intent.project;

    case 'client':
      // Optional unless explicitly needed
      return true;

    case 'source_info':
      // Only required if capture_type is source
      if (intent.capture_type !== 'source') return true;
      return !!intent.source;

    default:
      return true;
  }
}

/**
 * Check if a field is partially complete (has hints from detection)
 */
function isFieldPartial(
  field: MissingContextType,
  intent: PartialStorageIntent,
  detected: DetectedContext | undefined
): boolean {
  switch (field) {
    case 'capture_type':
      // Partial if we have hints but no explicit value
      return !intent.capture_type && !!detected?.capture_type && detected.capture_type.confidence >= 0.5;

    case 'domain':
      // Partial if we detected some but none were specified
      return (
        (!intent.domain || intent.domain.length === 0) &&
        !!detected?.domains &&
        detected.domains.length > 0
      );

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

    case 'source_info':
      // No detection for source info yet
      return false;

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
    case 'capture_type':
      if (detected?.capture_type && detected.capture_type.confidence >= 0.5) {
        return `Detected ${detected.capture_type.likely} capture type (${Math.round(detected.capture_type.confidence * 100)}% confidence) but needs confirmation`;
      }
      return 'Unable to determine if this is a source capture, knowledge, or project context';

    case 'domain':
      if (detected?.domains && detected.domains.length > 0) {
        const domains = detected.domains.map((d) => d.name).join(', ');
        return `Detected domains (${domains}) but should confirm categorization`;
      }
      return 'Domain/topic path is required for proper organization';

    case 'project':
      if (detected?.projects && detected.projects.length > 0) {
        const top = detected.projects[0]!;
        return `Possible project "${top.name}" detected but needs confirmation`;
      }
      return 'Project context capture requires a project name';

    case 'client':
      if (detected?.clients && detected.clients.length > 0) {
        const top = detected.clients[0]!;
        return `Possible client "${top.name}" detected but needs confirmation`;
      }
      return 'Client context could help with organization';

    case 'source_info':
      return 'Source captures require source information (type, title, author)';

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

  // First, check if capture_type is known
  const captureType = intent.capture_type ?? 'knowledge';
  const requiredFields: MissingContextType[] = ['capture_type', ...REQUIRED_BY_CAPTURE_TYPE[captureType]];

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

  // If capture_type not set but detected as 'project', mark project as partial
  if (!intent.capture_type && detected?.capture_type?.likely === 'project') {
    if (!partial.includes('project') && !complete.includes('project') && !missing.includes('project')) {
      partial.push('project');
      reasons['project'] = 'Project name may be needed if capture type is confirmed as project';
    }
  }

  // If capture_type not set but detected as 'source', mark source_info as partial
  if (!intent.capture_type && detected?.capture_type?.likely === 'source') {
    if (!partial.includes('source_info') && !complete.includes('source_info') && !missing.includes('source_info')) {
      partial.push('source_info');
      reasons['source_info'] = 'Source info may be needed if capture type is confirmed as source';
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
  const captureType = intent.capture_type ?? 'knowledge';
  const requiredFields = ['capture_type', ...REQUIRED_BY_CAPTURE_TYPE[captureType]] as MissingContextType[];

  for (const field of requiredFields) {
    if (!isFieldComplete(field, intent)) {
      // In non-strict mode, capture_type can default to 'knowledge'
      if (!strict && field === 'capture_type') continue;
      return false;
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
  // Priority order: capture_type first (determines other requirements),
  // then domain, then project/client, then source_info
  const priority: MissingContextType[] = [
    'capture_type',
    'domain',
    'project',
    'client',
    'source_info',
  ];

  const combined = [...missing, ...partial];
  return priority.filter((field) => combined.includes(field));
}
