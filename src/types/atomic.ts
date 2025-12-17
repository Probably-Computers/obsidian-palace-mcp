/**
 * Types for atomic note system
 */

import type { AtomicConfig } from './index.js';

/**
 * Palace annotation for controlling split behavior
 * Phase 022: Annotations in HTML comments
 */
export type PalaceAnnotation = 'keep' | 'split' | null;

/**
 * Section information extracted from content
 */
export interface SectionInfo {
  title: string;
  startLine: number;
  endLine: number;
  lineCount: number;
  level: number;
  /** Phase 022: Palace annotation for this section */
  annotation?: PalaceAnnotation;
  /** Phase 022: Whether this section contains template/example content */
  isTemplateContent?: boolean;
}

/**
 * Sub-concept detected within a section
 */
export interface SubConcept {
  title: string;
  level: number;
  startLine: number;
  endLine: number;
  lineCount: number;
  parentSection?: string | undefined;
}

/**
 * Code block information
 */
export interface CodeBlockInfo {
  language: string;
  lineCount: number;
  startLine: number;
}

/**
 * Complete content analysis result
 */
export interface ContentAnalysis {
  lineCount: number;
  sectionCount: number;
  wordCount: number;
  contentLines: number;
  frontmatterLines: number;
  sections: SectionInfo[];
  largeSections: string[];
  subConcepts: SubConcept[];
  codeBlocks: CodeBlockInfo[];
  limits: AtomicConfig;
}

/**
 * Split decision result
 */
export interface SplitDecision {
  shouldSplit: boolean;
  reason: string;
  metrics: {
    lineCount: number;
    sectionCount: number;
    wordCount: number;
    largeSections: number;
    subConcepts: number;
  };
  violations: SplitViolation[];
  suggestedStrategy: SplitStrategy;
}

/**
 * Type of limit violation
 */
export interface SplitViolation {
  type: 'lines' | 'sections' | 'section_size' | 'sub_concepts';
  message: string;
  value: number;
  limit: number;
}

/**
 * Strategy for splitting content
 */
export type SplitStrategy =
  | 'none'
  | 'by_sections'
  | 'by_large_sections'
  | 'by_sub_concepts'
  | 'hierarchical';

/**
 * Result of splitting content
 */
export interface SplitResult {
  hub: HubContent;
  children: ChildContent[];
  linksUpdated: LinkUpdate[];
}

/**
 * Hub note content after split
 */
export interface HubContent {
  title: string;
  relativePath: string;
  content: string;
  frontmatter: HubFrontmatter;
}

/**
 * Child note content after split
 */
export interface ChildContent {
  title: string;
  relativePath: string;
  content: string;
  frontmatter: ChildFrontmatter;
  fromSection?: string;
}

/**
 * Hub frontmatter structure
 */
export interface HubFrontmatter {
  type: string;
  title: string;
  status: string;
  children_count: number;
  domain?: string[] | undefined;
  created: string;
  modified: string;
  palace: {
    version: number;
    layer?: string | undefined;
  };
  [key: string]: unknown;
}

/**
 * Child frontmatter structure
 * Phase 018: parent field removed - use inline links instead (Zettelkasten style)
 */
export interface ChildFrontmatter {
  type: string;
  title: string;
  status: string;
  domain?: string[] | undefined;
  created: string;
  modified: string;
  palace: {
    version: number;
    layer?: string | undefined;
  };
  [key: string]: unknown;
}

/**
 * Link update during split
 */
export interface LinkUpdate {
  fromPath: string;
  originalTarget: string;
  newTarget: string;
}

/**
 * Hub info for existing hubs
 */
export interface HubInfo {
  path: string;
  title: string;
  childrenCount: number;
  children: HubChild[];
}

/**
 * Child reference in hub
 */
export interface HubChild {
  path: string;
  title: string;
  summary?: string | undefined;
}

/**
 * Options for splitting content
 * Phase 018: hubFilename removed - derived from title automatically
 * Phase 022: Added hub_sections for sections that stay in hub
 */
export interface SplitOptions {
  /** Target directory for hub and children */
  targetDir: string;
  /** Title for the hub note */
  title: string;
  /** Original frontmatter to preserve */
  originalFrontmatter?: Record<string, unknown>;
  /** Strategy override */
  strategy?: SplitStrategy;
  /** Domain tags */
  domain?: string[];
  /** Knowledge layer */
  layer?: string;
  /** Phase 022: Section titles that should stay in hub (case-insensitive match) */
  hubSections?: string[];
}

/**
 * Options for hub manager operations
 * Phase 018: hubFilename removed - derived from title automatically
 */
export interface HubManagerOptions {
  /** Vault path */
  vaultPath: string;
}

/**
 * Result of hub operations
 */
export interface HubOperationResult {
  success: boolean;
  path: string;
  message: string;
  hub?: HubInfo;
}
