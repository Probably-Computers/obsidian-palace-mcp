/**
 * Canonical Note Types and Validation (Phase 025)
 *
 * This module defines valid note types and provides validation/normalization
 * to prevent metadata corruption like double-suffixing (_hub_hub).
 */

import { logger } from '../utils/logger.js';

/**
 * Canonical note types allowed in the Palace
 */
export const VALID_NOTE_TYPES = [
  // Content types
  'research',
  'command',
  'infrastructure',
  'client',
  'project',
  'pattern',
  'troubleshooting',
  'standard',
  'daily',
  'time_entry',
  // Hub types (for split content)
  'research_hub',
  'command_hub',
  'infrastructure_hub',
  'client_hub',
  'project_hub',
  'pattern_hub',
  'troubleshooting_hub',
  'standard_hub',
  // Special types
  'stub',
  'hub', // Generic hub
] as const;

export type NoteType = (typeof VALID_NOTE_TYPES)[number];

/**
 * Base types (without _hub suffix)
 */
export const BASE_NOTE_TYPES = [
  'research',
  'command',
  'infrastructure',
  'client',
  'project',
  'pattern',
  'troubleshooting',
  'standard',
  'daily',
  'time_entry',
] as const;

export type BaseNoteType = (typeof BASE_NOTE_TYPES)[number];

/**
 * Map of common type mistakes to correct values
 */
const TYPE_CORRECTIONS: Record<string, NoteType> = {
  // Double suffix corrections
  research_hub_hub: 'research_hub',
  command_hub_hub: 'command_hub',
  infrastructure_hub_hub: 'infrastructure_hub',
  client_hub_hub: 'client_hub',
  project_hub_hub: 'project_hub',
  pattern_hub_hub: 'pattern_hub',
  troubleshooting_hub_hub: 'troubleshooting_hub',
  standard_hub_hub: 'standard_hub',
  hub_hub: 'hub',
  stub_stub: 'stub',
  // Common aliases
  note: 'research',
  knowledge: 'research',
  tech: 'infrastructure',
  technology: 'infrastructure',
  devops: 'infrastructure',
  ops: 'infrastructure',
  bug: 'troubleshooting',
  issue: 'troubleshooting',
  doc: 'research',
  documentation: 'research',
  log: 'daily',
  journal: 'daily',
  time: 'time_entry',
  timeentry: 'time_entry',
};

/**
 * Check if a type is valid
 */
export function isValidNoteType(type: unknown): type is NoteType {
  return typeof type === 'string' && VALID_NOTE_TYPES.includes(type as NoteType);
}

/**
 * Check if a type is a hub type
 */
export function isHubType(type: string): boolean {
  return type.endsWith('_hub') || type === 'hub';
}

/**
 * Get the base type from a hub type
 * e.g., 'research_hub' -> 'research'
 */
export function getBaseType(type: string): string {
  if (type === 'hub') return 'research';
  if (type.endsWith('_hub')) {
    return type.replace(/_hub$/, '');
  }
  return type;
}

/**
 * Get the hub type from a base type
 * e.g., 'research' -> 'research_hub'
 */
export function getHubType(type: string): NoteType {
  // Already a hub type
  if (type.endsWith('_hub') || type === 'hub') {
    return normalizeType(type);
  }
  // Convert to hub type
  const hubType = `${type}_hub`;
  if (isValidNoteType(hubType)) {
    return hubType;
  }
  // Default to generic hub
  return 'hub';
}

/**
 * Normalize a type value to a valid NoteType
 *
 * This function:
 * 1. Removes double suffixes (_hub_hub, _stub_stub)
 * 2. Maps common mistakes to correct values
 * 3. Falls back to 'research' for unknown types
 *
 * @param type - The type value to normalize
 * @param logWarnings - Whether to log warnings for corrections (default: true)
 * @returns A valid NoteType
 */
export function normalizeType(type: unknown, logWarnings = true): NoteType {
  // Handle non-string values
  if (type === null || type === undefined) {
    return 'research';
  }
  if (typeof type !== 'string') {
    if (logWarnings) {
      logger.warn(`Invalid type value (not a string): ${JSON.stringify(type)}, defaulting to 'research'`);
    }
    return 'research';
  }

  // Lowercase and trim
  let normalized = type.toLowerCase().trim();

  // Remove any triple or more suffixes first (paranoid fix)
  normalized = normalized.replace(/(_hub){2,}/g, '_hub');
  normalized = normalized.replace(/(_stub){2,}/g, '_stub');

  // Remove double suffixes
  normalized = normalized.replace(/_hub_hub$/, '_hub');
  normalized = normalized.replace(/_stub_stub$/, '_stub');
  normalized = normalized.replace(/_hub_stub$/, '_stub'); // Edge case
  normalized = normalized.replace(/_stub_hub$/, '_hub'); // Edge case

  // Check if already valid
  if (isValidNoteType(normalized)) {
    // Log if we made corrections
    if (normalized !== type.toLowerCase().trim() && logWarnings) {
      logger.warn(`Normalized type '${type}' to '${normalized}'`);
    }
    return normalized;
  }

  // Check correction map
  const corrected = TYPE_CORRECTIONS[normalized];
  if (corrected) {
    if (logWarnings) {
      logger.warn(`Corrected type '${type}' to '${corrected}'`);
    }
    return corrected;
  }

  // Check if it's a valid base type with _hub suffix we don't recognize
  if (normalized.endsWith('_hub')) {
    const base = normalized.replace(/_hub$/, '');
    if (BASE_NOTE_TYPES.includes(base as BaseNoteType)) {
      const hubType = `${base}_hub` as NoteType;
      if (isValidNoteType(hubType)) {
        if (logWarnings && normalized !== hubType) {
          logger.warn(`Normalized type '${type}' to '${hubType}'`);
        }
        return hubType;
      }
    }
  }

  // Unknown type - fall back to research
  if (logWarnings) {
    logger.warn(`Unknown type '${type}', defaulting to 'research'`);
  }
  return 'research';
}

/**
 * Validate a type without normalizing (returns validation result)
 */
export interface TypeValidationResult {
  valid: boolean;
  type: NoteType;
  original: unknown;
  corrected: boolean;
  correction?: string | undefined;
}

export function validateType(type: unknown): TypeValidationResult {
  const original = type;
  const normalized = normalizeType(type, false);
  const isOriginalValid =
    typeof type === 'string' && type.toLowerCase().trim() === normalized;

  return {
    valid: isOriginalValid,
    type: normalized,
    original,
    corrected: !isOriginalValid,
    correction: !isOriginalValid
      ? `'${String(type)}' -> '${normalized}'`
      : undefined,
  };
}

/**
 * Get all valid types as an array (useful for documentation)
 */
export function getValidTypes(): readonly string[] {
  return VALID_NOTE_TYPES;
}

/**
 * Get valid types grouped by category
 */
export function getTypesGrouped(): {
  content: readonly string[];
  hub: readonly string[];
  special: readonly string[];
} {
  return {
    content: BASE_NOTE_TYPES,
    hub: VALID_NOTE_TYPES.filter((t) => t.endsWith('_hub')),
    special: ['stub', 'hub', 'daily'],
  };
}
