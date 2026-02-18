/**
 * Frontmatter Schema Validation (Phase 025)
 *
 * Validates note frontmatter against defined schemas.
 * Provides validation errors/warnings for metadata integrity.
 */

import { z } from 'zod';
import { normalizeType, type NoteType } from '../types/note-types.js';

/**
 * Validation severity levels
 */
export type ValidationSeverity = 'error' | 'warning' | 'info';

/**
 * Individual validation issue
 */
export interface ValidationIssue {
  field: string;
  message: string;
  severity: ValidationSeverity;
  value?: unknown;
  suggestion?: unknown;
}

/**
 * Validation result
 */
export interface FrontmatterValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  normalized: Record<string, unknown>;
}

/**
 * Base frontmatter schema (common to all note types)
 */
const baseFrontmatterSchema = z.object({
  // Type (validated separately for normalization)
  type: z.string().optional(),

  // Timestamps
  created: z.string().optional(),
  modified: z.string().optional(),

  // Provenance
  source: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  verified: z.boolean().optional(),

  // Organization
  tags: z.array(z.string()).optional(),
  related: z.array(z.string()).optional(),
  aliases: z.array(z.string()).optional(),
  domain: z.array(z.string()).optional(),

  // Status
  status: z.enum(['active', 'stub', 'archived']).optional(),

  // Phase 017 fields
  capture_type: z.enum(['source', 'knowledge', 'project']).optional(),
  note_type: z.string().optional(),

  // Source capture fields
  source_type: z.string().optional(),
  source_title: z.string().optional(),
  source_author: z.string().optional(),
  source_url: z.string().optional(),

  // Project/client context
  project: z.string().optional(),
  client: z.string().optional(),

  // Hub fields
  children_count: z.number().int().min(0).optional(),
  parent: z.string().optional(),

  // Tracking
  authors: z.array(z.string()).optional(),

  // Palace metadata
  palace: z
    .object({
      version: z.number().optional(),
    })
    .optional(),
});

/**
 * Required fields for specific note types
 */
const TYPE_REQUIRED_FIELDS: Partial<Record<NoteType, string[]>> = {
  stub: ['status'],
  hub: ['children_count'],
  research_hub: ['children_count'],
  command_hub: ['children_count'],
  infrastructure_hub: ['children_count'],
  project_hub: ['children_count'],
  pattern_hub: ['children_count'],
  troubleshooting_hub: ['children_count'],
  standard_hub: ['children_count'],
  client_hub: ['children_count'],
  daily: ['created'],
  standard: ['status'],
};

/**
 * Default values for optional fields
 */
export const FRONTMATTER_DEFAULTS: Record<string, unknown> = {
  verified: false,
  confidence: 0.5,
  status: 'active',
  tags: [],
  related: [],
  aliases: [],
};

/**
 * Validate a date string (ISO format)
 */
function isValidDate(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const date = new Date(value);
  return !isNaN(date.getTime());
}

/**
 * Validate that domain is an array of strings
 */
function isValidDomain(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return value.every((v) => typeof v === 'string');
}

/**
 * Validate frontmatter against schema
 */
export function validateFrontmatter(
  frontmatter: Record<string, unknown>,
  options: { strict?: boolean } = {}
): FrontmatterValidationResult {
  const issues: ValidationIssue[] = [];
  const normalized = { ...frontmatter };

  // 1. Validate type field
  if (frontmatter.type !== undefined) {
    const typeValidation = normalizeType(frontmatter.type, false);
    if (typeValidation !== frontmatter.type) {
      issues.push({
        field: 'type',
        message: `Invalid type value, normalized to '${typeValidation}'`,
        severity: 'warning',
        value: frontmatter.type,
        suggestion: typeValidation,
      });
      normalized.type = typeValidation;
    }
  }

  // 2. Validate timestamps
  if (frontmatter.created !== undefined && !isValidDate(frontmatter.created)) {
    issues.push({
      field: 'created',
      message: 'Invalid date format for created',
      severity: 'error',
      value: frontmatter.created,
      suggestion: new Date().toISOString(),
    });
  }

  if (frontmatter.modified !== undefined && !isValidDate(frontmatter.modified)) {
    issues.push({
      field: 'modified',
      message: 'Invalid date format for modified',
      severity: 'error',
      value: frontmatter.modified,
      suggestion: new Date().toISOString(),
    });
  }

  // 3. Validate confidence range
  if (frontmatter.confidence !== undefined) {
    const conf = frontmatter.confidence as number;
    if (typeof conf !== 'number' || conf < 0 || conf > 1) {
      issues.push({
        field: 'confidence',
        message: 'Confidence must be a number between 0 and 1',
        severity: 'error',
        value: conf,
        suggestion: Math.max(0, Math.min(1, Number(conf) || 0.5)),
      });
    }
  }

  // 4. Validate domain array
  if (frontmatter.domain !== undefined && !isValidDomain(frontmatter.domain)) {
    issues.push({
      field: 'domain',
      message: 'Domain must be an array of strings',
      severity: 'error',
      value: frontmatter.domain,
    });
    // Attempt to normalize
    if (typeof frontmatter.domain === 'string') {
      normalized.domain = [frontmatter.domain];
    } else if (Array.isArray(frontmatter.domain)) {
      normalized.domain = (frontmatter.domain as unknown[]).map(String);
    }
  }

  // 5. Validate tags array
  if (frontmatter.tags !== undefined && !Array.isArray(frontmatter.tags)) {
    issues.push({
      field: 'tags',
      message: 'Tags must be an array of strings',
      severity: 'error',
      value: frontmatter.tags,
    });
    if (typeof frontmatter.tags === 'string') {
      normalized.tags = [frontmatter.tags];
    }
  }

  // 6. Validate aliases array
  if (frontmatter.aliases !== undefined && !Array.isArray(frontmatter.aliases)) {
    issues.push({
      field: 'aliases',
      message: 'Aliases must be an array of strings',
      severity: 'error',
      value: frontmatter.aliases,
    });
    if (typeof frontmatter.aliases === 'string') {
      normalized.aliases = [frontmatter.aliases];
    }
  }

  // 7. Check required fields for type
  const noteType = normalized.type as NoteType | undefined;
  if (noteType && TYPE_REQUIRED_FIELDS[noteType]) {
    const required = TYPE_REQUIRED_FIELDS[noteType]!;
    for (const field of required) {
      if (frontmatter[field] === undefined) {
        issues.push({
          field,
          message: `Required field '${field}' missing for type '${noteType}'`,
          severity: options.strict ? 'error' : 'warning',
        });
      }
    }
  }

  // 8. Check for hub type without children_count
  if (noteType && (noteType.endsWith('_hub') || noteType === 'hub')) {
    if (frontmatter.children_count === undefined) {
      issues.push({
        field: 'children_count',
        message: 'Hub notes should have children_count',
        severity: 'warning',
        suggestion: 0,
      });
      normalized.children_count = 0;
    }
  }

  // 9. Validate children_count is non-negative integer
  if (frontmatter.children_count !== undefined) {
    const count = frontmatter.children_count as number;
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
      issues.push({
        field: 'children_count',
        message: 'children_count must be a non-negative integer',
        severity: 'error',
        value: count,
        suggestion: Math.max(0, Math.floor(Number(count) || 0)),
      });
    }
  }

  // 10. Validate status enum
  if (frontmatter.status !== undefined) {
    const validStatuses = ['active', 'stub', 'archived'];
    if (!validStatuses.includes(frontmatter.status as string)) {
      issues.push({
        field: 'status',
        message: `Invalid status value, must be one of: ${validStatuses.join(', ')}`,
        severity: 'error',
        value: frontmatter.status,
        suggestion: 'active',
      });
      normalized.status = 'active';
    }
  }

  // 11. Validate capture_type enum
  if (frontmatter.capture_type !== undefined) {
    const validCaptureTypes = ['source', 'knowledge', 'project'];
    if (!validCaptureTypes.includes(frontmatter.capture_type as string)) {
      issues.push({
        field: 'capture_type',
        message: `Invalid capture_type value, must be one of: ${validCaptureTypes.join(', ')}`,
        severity: 'error',
        value: frontmatter.capture_type,
      });
    }
  }

  // 12. Check for source capture without source_type
  if (frontmatter.capture_type === 'source' && !frontmatter.source_type) {
    issues.push({
      field: 'source_type',
      message: "source_type is required when capture_type is 'source'",
      severity: 'warning',
    });
  }

  // 13. Check for project capture without project/client
  if (frontmatter.capture_type === 'project') {
    if (!frontmatter.project && !frontmatter.client) {
      issues.push({
        field: 'project',
        message: "project or client is required when capture_type is 'project'",
        severity: 'warning',
      });
    }
  }

  // Use Zod for structural validation
  const zodResult = baseFrontmatterSchema.safeParse(frontmatter);
  if (!zodResult.success) {
    for (const issue of zodResult.error.issues) {
      // Avoid duplicating issues we already added
      const fieldPath = issue.path.join('.');
      if (!issues.some((i) => i.field === fieldPath)) {
        issues.push({
          field: fieldPath,
          message: issue.message,
          severity: 'error',
        });
      }
    }
  }

  return {
    valid: issues.filter((i) => i.severity === 'error').length === 0,
    issues,
    normalized,
  };
}

/**
 * Get required fields for a note type
 */
export function getRequiredFields(type: string): string[] {
  const normalizedType = normalizeType(type, false);
  return TYPE_REQUIRED_FIELDS[normalizedType] ?? [];
}

/**
 * Get the Zod schema for frontmatter (for external use)
 */
export function getFrontmatterSchema(): z.ZodObject<z.ZodRawShape> {
  return baseFrontmatterSchema as z.ZodObject<z.ZodRawShape>;
}

/**
 * Repair frontmatter by applying suggestions
 */
export function repairFrontmatter(
  frontmatter: Record<string, unknown>,
  issues: ValidationIssue[]
): Record<string, unknown> {
  const repaired = { ...frontmatter };

  for (const issue of issues) {
    if (issue.suggestion !== undefined) {
      repaired[issue.field] = issue.suggestion;
    }
  }

  return repaired;
}
