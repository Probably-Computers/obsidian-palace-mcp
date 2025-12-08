/**
 * Standards System Type Definitions
 *
 * Types for binding standards that AI must follow.
 */

// AI binding level for standards
export type BindingLevel = 'required' | 'recommended' | 'optional';

// Standard note frontmatter
export interface StandardFrontmatter {
  type: 'standard';
  title: string;
  domain?: string[] | undefined;
  ai_binding: BindingLevel;
  applies_to: string[];
  status?: 'active' | 'draft' | 'deprecated' | undefined;
  created: string;
  modified: string;
  tags?: string[] | undefined;
  aliases?: string[] | undefined;
}

// Loaded standard representation
export interface LoadedStandard {
  path: string;
  vault: string;
  title: string;
  binding: BindingLevel;
  applies_to: string[];
  domain: string[];
  content: string;
  summary: string;
  frontmatter: StandardFrontmatter;
}

// Standards loader options
export interface StandardsLoaderOptions {
  binding?: BindingLevel | 'all' | undefined;
  domain?: string[] | undefined;
  applies_to?: string | undefined;
  vault?: string | undefined;
  includeContent?: boolean | undefined;
}

// Standards cache entry
export interface StandardsCacheEntry {
  standards: LoadedStandard[];
  loadedAt: number;
  vaultAlias: string;
}

// Compliance violation
export interface ComplianceViolation {
  standard: string;
  requirement: string;
  actual: string;
  severity: 'error' | 'warning';
}

// Compliance warning
export interface ComplianceWarning {
  standard: string;
  message: string;
}

// Compliance report from validator
export interface ComplianceReport {
  compliant: boolean;
  violations: ComplianceViolation[];
  warnings: ComplianceWarning[];
  checked_against: string[];
}

// Standards output for palace_standards tool
export interface StandardsOutput {
  success: boolean;
  standards: Array<{
    path: string;
    vault: string;
    title: string;
    binding: BindingLevel;
    applies_to: string[];
    domain: string[];
    content: string;
    summary: string;
  }>;
  acknowledgment_required: boolean;
  acknowledgment_message?: string | undefined;
}

// Standards input for palace_standards tool
export interface StandardsInput {
  domain?: string[] | undefined;
  applies_to?: string | undefined;
  binding?: BindingLevel | 'all' | undefined;
  vault?: string | undefined;
}

// Standards validation input
export interface ValidateInput {
  path: string;
  vault?: string | undefined;
  standards?: string[] | undefined;
}
