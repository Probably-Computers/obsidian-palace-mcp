/**
 * palace_standards - Load and query binding standards
 *
 * Returns standards that AI should follow, filtered by domain and applies_to.
 */

import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolResult } from '../types/index.js';
import type { StandardsOutput } from '../types/standards.js';
import { loadStandards } from '../services/standards/index.js';

// Input schema
const inputSchema = z.object({
  domain: z
    .array(z.string())
    .optional()
    .describe('Filter standards by domain (e.g., ["git", "code-style"])'),
  applies_to: z
    .string()
    .optional()
    .describe('Filter by what the standard applies to (e.g., "typescript", "all")'),
  binding: z
    .enum(['required', 'recommended', 'optional', 'all'])
    .optional()
    .default('all')
    .describe('Filter by binding level'),
  vault: z
    .string()
    .optional()
    .describe('Vault alias to load standards from (defaults to standards_source or default vault)'),
  include_content: z
    .boolean()
    .optional()
    .default(true)
    .describe('Include full content for required standards'),
});

// Tool definition
export const standardsTool: Tool = {
  name: 'palace_standards',
  description: `Load binding standards that AI should follow. Returns standards notes with ai_binding frontmatter.

Standards are notes with type: standard and ai_binding: required|recommended|optional.

Use this at session start to load required standards, or query specific standards by domain/applies_to.`,
  inputSchema: {
    type: 'object',
    properties: {
      domain: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter standards by domain (e.g., ["git", "code-style"])',
      },
      applies_to: {
        type: 'string',
        description: 'Filter by what the standard applies to (e.g., "typescript", "all")',
      },
      binding: {
        type: 'string',
        enum: ['required', 'recommended', 'optional', 'all'],
        description: 'Filter by binding level (default: all)',
      },
      vault: {
        type: 'string',
        description: 'Vault alias to load standards from',
      },
      include_content: {
        type: 'boolean',
        description: 'Include full content for required standards (default: true)',
      },
    },
  },
};

// Tool handler
export async function standardsHandler(args: Record<string, unknown>): Promise<ToolResult> {
  // Validate input
  const parseResult = inputSchema.safeParse(args);
  if (!parseResult.success) {
    return {
      success: false,
      error: parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      code: 'VALIDATION_ERROR',
    };
  }

  const input = parseResult.data;

  try {
    // Load standards based on filters
    const standards = await loadStandards({
      binding: input.binding,
      domain: input.domain,
      applies_to: input.applies_to,
      vault: input.vault,
    });

    // Check if acknowledgment is required (any required standards exist)
    const hasRequired = standards.some((s) => s.binding === 'required');

    // Build output
    const output: StandardsOutput = {
      success: true,
      standards: standards.map((s) => ({
        path: s.path,
        vault: s.vault,
        title: s.title,
        binding: s.binding,
        applies_to: s.applies_to,
        domain: s.domain,
        // Include full content for required standards or if explicitly requested
        content: s.binding === 'required' || input.include_content ? s.content : '',
        summary: s.summary,
      })),
      acknowledgment_required: hasRequired,
    };

    // Add acknowledgment message if required standards exist
    if (hasRequired) {
      const requiredTitles = standards
        .filter((s) => s.binding === 'required')
        .map((s) => s.title);

      output.acknowledgment_message =
        `Please acknowledge that you have read and will follow these required standards: ${requiredTitles.join(', ')}`;
    }

    return {
      success: true,
      data: output,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      code: 'STANDARDS_ERROR',
    };
  }
}

/**
 * palace_standards_validate - Validate a note against standards
 */

const validateInputSchema = z.object({
  path: z.string().describe('Path to the note to validate'),
  vault: z.string().optional().describe('Vault alias'),
  standards: z
    .array(z.string())
    .optional()
    .describe('Specific standard paths to validate against'),
});

export const standardsValidateTool: Tool = {
  name: 'palace_standards_validate',
  description: `Validate a note against applicable standards. Returns a compliance report with violations and warnings.`,
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the note to validate',
      },
      vault: {
        type: 'string',
        description: 'Vault alias',
      },
      standards: {
        type: 'array',
        items: { type: 'string' },
        description: 'Specific standard paths to validate against',
      },
    },
    required: ['path'],
  },
};

export async function standardsValidateHandler(
  args: Record<string, unknown>
): Promise<ToolResult> {
  // Validate input
  const parseResult = validateInputSchema.safeParse(args);
  if (!parseResult.success) {
    return {
      success: false,
      error: parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      code: 'VALIDATION_ERROR',
    };
  }

  const input = parseResult.data;

  try {
    // Import validator to avoid circular dependency
    const { validateCompliance } = await import('../services/standards/validator.js');

    const validateOptions: { vault?: string; standards?: string[] } = {};
    if (input.vault) validateOptions.vault = input.vault;
    if (input.standards) validateOptions.standards = input.standards;

    const report = await validateCompliance(input.path, validateOptions);

    return {
      success: true,
      data: {
        path: input.path,
        compliant: report.compliant,
        violations: report.violations,
        warnings: report.warnings,
        checked_against: report.checked_against,
        message: report.compliant
          ? 'Note is compliant with all applicable standards'
          : `Note has ${report.violations.length} violation(s) and ${report.warnings.length} warning(s)`,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      code: 'VALIDATION_ERROR',
    };
  }
}
