/**
 * Standards validator for compliance checking
 *
 * Validates notes against applicable standards.
 */

import { readNote } from '../vault/reader.js';
import { getVaultRegistry } from '../vault/registry.js';
import { loadStandards } from './loader.js';
import { logger } from '../../utils/logger.js';
import type {
  ComplianceReport,
  ComplianceViolation,
  ComplianceWarning,
  LoadedStandard,
} from '../../types/standards.js';
import type { Note } from '../../types/index.js';

/**
 * Validation rule types
 */
type ValidationRule = {
  pattern: RegExp;
  message: string;
  severity: 'error' | 'warning';
};

/**
 * Extract validation rules from standard content
 */
function extractValidationRules(standard: LoadedStandard): ValidationRule[] {
  const rules: ValidationRule[] = [];
  const content = standard.content;

  // Look for "## Requirements" section
  const requirementsMatch = content.match(/## Requirements\s*([\s\S]*?)(?=\n##|$)/i);
  if (!requirementsMatch) {
    return rules;
  }

  const requirementsSection = requirementsMatch[1] ?? '';

  // Extract bullet points as potential rules
  const bulletPoints = requirementsSection.match(/^[-*]\s+(.+)$/gm) || [];

  for (const bullet of bulletPoints) {
    const text = bullet.replace(/^[-*]\s+/, '').trim();

    // Try to extract patterns from requirements
    // Format: "Must have X" or "Must include X"
    const mustMatch = text.match(/^must\s+(?:have|include|contain|use)\s+(.+)/i);
    if (mustMatch) {
      const required = mustMatch[1];
      if (required) {
        // Create a simple contains check
        rules.push({
          pattern: new RegExp(escapeRegex(required), 'i'),
          message: `Missing required: ${required}`,
          severity: 'error',
        });
      }
    }

    // Format: "Should have X" or "Should include X"
    const shouldMatch = text.match(/^should\s+(?:have|include|contain|use)\s+(.+)/i);
    if (shouldMatch) {
      const recommended = shouldMatch[1];
      if (recommended) {
        rules.push({
          pattern: new RegExp(escapeRegex(recommended), 'i'),
          message: `Recommended: ${recommended}`,
          severity: 'warning',
        });
      }
    }
  }

  return rules;
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Check if standard applies to a note
 */
function standardApplies(standard: LoadedStandard, note: Note): boolean {
  const appliesTo = standard.applies_to;

  // 'all' applies to everything
  if (appliesTo.includes('all')) {
    return true;
  }

  // Check by capture_type
  const captureType = note.frontmatter.capture_type;
  if (captureType && appliesTo.includes(captureType)) {
    return true;
  }

  // Check by domain in frontmatter
  const noteDomain = note.frontmatter.domain;
  if (Array.isArray(noteDomain)) {
    for (const d of noteDomain) {
      if (appliesTo.includes(d)) {
        return true;
      }
    }
  }

  // Check by path patterns
  for (const pattern of appliesTo) {
    if (pattern.startsWith('path:')) {
      const pathPattern = pattern.slice(5);
      if (note.path.startsWith(pathPattern)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Validate frontmatter requirements
 */
function validateFrontmatter(
  note: Note,
  standard: LoadedStandard
): { violations: ComplianceViolation[]; warnings: ComplianceWarning[] } {
  const violations: ComplianceViolation[] = [];
  const warnings: ComplianceWarning[] = [];

  const content = standard.content;
  const fm = note.frontmatter as unknown as Record<string, unknown>;

  // Look for frontmatter requirements in the standard
  const frontmatterMatch = content.match(
    /## (?:Frontmatter|Metadata)\s+Requirements?\s*([\s\S]*?)(?=\n##|$)/i
  );

  if (!frontmatterMatch) {
    return { violations, warnings };
  }

  const section = frontmatterMatch[1] ?? '';
  const bulletPoints = section.match(/^[-*]\s+`?(\w+)`?\s*[:-]\s*(.+)$/gm) || [];

  for (const bullet of bulletPoints) {
    const match = bullet.match(/^[-*]\s+`?(\w+)`?\s*[:-]\s*(.+)$/);
    if (!match) continue;

    const field = match[1];
    const requirement = match[2]?.toLowerCase() ?? '';

    if (!field) continue;

    // Check if field is required
    if (requirement.includes('required')) {
      if (fm[field] === undefined || fm[field] === null || fm[field] === '') {
        violations.push({
          standard: standard.path,
          requirement: `Field '${field}' is required`,
          actual: 'Missing',
          severity: 'error',
        });
      }
    }

    // Check if field should exist (recommended)
    if (requirement.includes('recommended') || requirement.includes('should')) {
      if (fm[field] === undefined || fm[field] === null || fm[field] === '') {
        warnings.push({
          standard: standard.path,
          message: `Field '${field}' is recommended`,
        });
      }
    }
  }

  return { violations, warnings };
}

/**
 * Validate content against a standard
 */
function validateContent(
  note: Note,
  standard: LoadedStandard
): { violations: ComplianceViolation[]; warnings: ComplianceWarning[] } {
  const violations: ComplianceViolation[] = [];
  const warnings: ComplianceWarning[] = [];

  const rules = extractValidationRules(standard);

  for (const rule of rules) {
    const matches = rule.pattern.test(note.content) || rule.pattern.test(note.raw);

    if (!matches) {
      if (rule.severity === 'error') {
        violations.push({
          standard: standard.path,
          requirement: rule.message,
          actual: 'Not found',
          severity: 'error',
        });
      } else {
        warnings.push({
          standard: standard.path,
          message: rule.message,
        });
      }
    }
  }

  return { violations, warnings };
}

/**
 * Validate a note against applicable standards
 */
export async function validateCompliance(
  notePath: string,
  options: {
    vault?: string;
    standards?: string[];
  } = {}
): Promise<ComplianceReport> {
  const registry = getVaultRegistry();
  const vault = options.vault
    ? registry.requireVault(options.vault)
    : registry.getDefaultVault();

  // Read the note
  const note = await readNote(notePath, {
    vaultPath: vault.path,
    ignoreConfig: vault.config.ignore,
  });

  if (!note) {
    return {
      compliant: false,
      violations: [
        {
          standard: 'system',
          requirement: 'Note must exist',
          actual: 'Not found',
          severity: 'error',
        },
      ],
      warnings: [],
      checked_against: [],
    };
  }

  // Load applicable standards
  let standards: LoadedStandard[];

  if (options.standards && options.standards.length > 0) {
    // Load specific standards by path
    const allStandards = await loadStandards({ vault: vault.alias });
    standards = allStandards.filter((s) =>
      options.standards!.some((path) => s.path === path || s.path.endsWith(path))
    );
  } else {
    // Load all standards and filter by applicability
    const allStandards = await loadStandards({ vault: vault.alias });
    standards = allStandards.filter((s) => standardApplies(s, note));
  }

  logger.debug(`Validating ${notePath} against ${standards.length} standards`);

  // Collect all violations and warnings
  const violations: ComplianceViolation[] = [];
  const warnings: ComplianceWarning[] = [];
  const checkedAgainst: string[] = [];

  for (const standard of standards) {
    checkedAgainst.push(standard.path);

    // Validate frontmatter
    const fmResult = validateFrontmatter(note, standard);
    violations.push(...fmResult.violations);
    warnings.push(...fmResult.warnings);

    // Validate content
    const contentResult = validateContent(note, standard);
    violations.push(...contentResult.violations);
    warnings.push(...contentResult.warnings);
  }

  return {
    compliant: violations.length === 0,
    violations,
    warnings,
    checked_against: checkedAgainst,
  };
}

/**
 * Check if a note is compliant (simple boolean check)
 */
export async function isCompliant(
  notePath: string,
  options: { vault?: string } = {}
): Promise<boolean> {
  const report = await validateCompliance(notePath, options);
  return report.compliant;
}

/**
 * Validate multiple notes at once
 */
export async function validateMultiple(
  notePaths: string[],
  options: { vault?: string } = {}
): Promise<Map<string, ComplianceReport>> {
  const results = new Map<string, ComplianceReport>();

  for (const path of notePaths) {
    const report = await validateCompliance(path, options);
    results.set(path, report);
  }

  return results;
}
