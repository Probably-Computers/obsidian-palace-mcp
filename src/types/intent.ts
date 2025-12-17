/**
 * Intent-Based Storage Types (Phase 017 - Topic-Based Architecture)
 *
 * This module defines how AI expresses WHAT to store using a simplified
 * topic-driven model. The domain/topic directly becomes the folder path.
 *
 * Key principles:
 * - Only 3 capture types: source, knowledge, project
 * - Domain array IS the folder path (no type-to-folder mapping)
 * - AI observes vault structure and proposes paths
 * - System suggests, never dictates
 */

import { z } from 'zod';

// ============================================
// Core Capture Types (Only 3!)
// ============================================

/**
 * What kind of capture is this?
 * - 'source': Raw capture from a specific source (book, video, article)
 * - 'knowledge': Processed, reusable knowledge about a topic
 * - 'project': Project or client specific context
 */
export type CaptureType = 'source' | 'knowledge' | 'project';

/**
 * Source type for source captures
 */
export type SourceType =
  | 'book'
  | 'video'
  | 'article'
  | 'podcast'
  | 'conversation'
  | 'documentation'
  | 'other';

// ============================================
// Storage Intent (New Topic-Based Schema)
// ============================================

/**
 * Source information for source captures
 */
export interface SourceInfo {
  type: SourceType;
  title: string;
  author?: string | undefined;
  url?: string | undefined;
  date?: string | undefined;
}

/**
 * Storage intent - what the AI wants to store.
 *
 * The core principle: domain IS the folder path.
 * No more type-to-folder mapping or layer detection.
 */
export interface StorageIntent {
  /**
   * What kind of capture is this?
   */
  capture_type: CaptureType;

  /**
   * Topic hierarchy - THIS IS THE FOLDER PATH.
   * AI determines this by examining vault structure and proposing paths.
   *
   * Examples:
   * - ['networking', 'wireless', 'lora'] -> networking/wireless/lora/
   * - ['gardening', 'vegetables', 'tomatoes'] -> gardening/vegetables/tomatoes/
   */
  domain: string[];

  /**
   * Source information (required when capture_type is 'source')
   */
  source?: SourceInfo | undefined;

  /**
   * Project context (required when capture_type is 'project')
   */
  project?: string | undefined;

  /**
   * Client context (optional, for client-specific projects)
   */
  client?: string | undefined;

  /**
   * Explicit links to create to other notes.
   */
  references?: string[] | undefined;

  /**
   * Optional note type hint for frontmatter (not for path resolution).
   * This is purely for categorization within the note, not for folder structure.
   */
  note_type?: string | undefined;

  /**
   * Tags for additional categorization.
   */
  tags?: string[] | undefined;
}

// ============================================
// Source Provenance
// ============================================

/**
 * Source provenance for stored knowledge
 */
export interface StorageSource {
  origin: 'ai:research' | 'ai:artifact' | 'human' | `web:${string}`;
  confidence?: number; // 0.0 - 1.0
}

// ============================================
// Storage Options
// ============================================

/**
 * Options for storage operations
 */
export interface StorageOptions {
  vault?: string; // Specific vault alias
  create_stubs?: boolean; // Create stubs for unknown references (default: true)
  retroactive_link?: boolean; // Update existing notes (default: true)
  dry_run?: boolean; // Preview without saving
  autolink?: boolean; // Auto-link content (default: true)
  auto_split?: boolean; // Auto-split if exceeds atomic limits (default: true)
  force_atomic?: boolean; // DEPRECATED: Use auto_split: false instead (default: false)
  confirm_new_domain?: boolean; // Require confirmation for new top-level domains (default: true)
  // Phase 022: Per-operation split threshold overrides
  split_thresholds?: {
    max_lines?: number; // Override max lines limit
    max_sections?: number; // Override max sections limit
    section_max_lines?: number; // Override max lines per section
    min_section_lines?: number; // Override minimum section lines
    max_children?: number; // Override max children limit
    hub_sections?: string[]; // Sections that stay in hub (case-insensitive match)
  };
}

// ============================================
// Store Input/Output
// ============================================

/**
 * Full input for palace_store
 */
export interface PalaceStoreInput {
  title: string;
  content: string;
  intent: StorageIntent;
  options?: StorageOptions;
  source?: StorageSource;
}

/**
 * Resolution result from path resolver
 */
export interface VaultResolution {
  vault: string; // Vault alias
  vaultPath: string; // Full vault path
  relativePath: string; // Path relative to vault root
  fullPath: string; // Absolute file path
  filename: string; // Just the filename
  parentDir: string; // Parent directory path
  hubPath?: string; // Associated hub file if any
  isNewTopLevelDomain: boolean; // True if creating a new top-level domain
}

/**
 * Split result when content was atomically split
 */
export interface AtomicSplitResult {
  hub_path: string;
  children_paths: string[];
  children_count: number;
}

/**
 * Output from palace_store
 */
export interface PalaceStoreOutput {
  success: boolean;
  vault: string;
  vaultPath: string;

  // What was created
  created: {
    path: string;
    title: string;
    type: 'atomic' | 'hub';
  };

  // Domain information
  domain: {
    path: string; // The domain path used
    is_new: boolean; // Whether this is a new domain
    level: number; // Domain depth (1 = top-level)
  };

  // Stubs created for referenced notes
  stubs_created?: string[] | undefined;

  // Links added to/from existing notes
  links_added?: {
    to_existing: string[];
    from_existing: string[];
  } | undefined;

  // If content was split into hub + children
  split_result?: AtomicSplitResult | undefined;

  // Warning if content exceeds atomic limits but auto_split is disabled
  atomic_warning?: string | undefined;

  // Phase 023: Operation tracking
  operation_id?: string | undefined;

  // Phase 023: Cleanup suggestions after major operations
  cleanup_suggestions?: CleanupSuggestions | undefined;

  // Summary message
  message: string;
}

/**
 * Cleanup suggestions after major operations
 */
export interface CleanupSuggestions {
  orphaned_files?: string[] | undefined; // Files that might need deletion
  stale_children?: string[] | undefined; // Children from replaced content
  broken_links?: string[] | undefined; // Files with broken links after operation
  message?: string | undefined; // Summary of cleanup recommendations
}

// ============================================
// Check Types (with Domain Suggestions)
// ============================================

/**
 * Check result recommendation
 */
export type CheckRecommendation =
  | 'create_new' // No matches found
  | 'expand_stub' // Found stub to expand
  | 'improve_existing' // Good match exists
  | 'reference_existing'; // Exact match, just reference it

/**
 * Match from palace_check
 */
export interface CheckMatch {
  path: string;
  vault: string;
  title: string;
  status: 'active' | 'stub';
  confidence: number;
  relevance: number;
  summary: string;
  last_modified: string;
  domain?: string[] | undefined; // The domain path of the match
}

/**
 * Domain suggestion for new knowledge
 */
export interface DomainSuggestion {
  path: string[]; // Suggested domain path
  confidence: number; // How confident we are in this suggestion
  reason: string; // Why this is suggested
  exists: boolean; // Whether this domain already exists
  note_count?: number | undefined; // Number of notes in this domain
}

/**
 * Suggestions from palace_check
 */
export interface CheckSuggestions {
  should_expand_stub: boolean;
  stub_path?: string | undefined;
  similar_titles: string[];
  // NEW: Domain suggestions
  suggested_domains: DomainSuggestion[];
}

/**
 * Output from palace_check
 */
export interface PalaceCheckOutput {
  found: boolean;
  vault: string;
  vaultPath: string;
  matches: CheckMatch[];
  suggestions: CheckSuggestions;
  recommendation: CheckRecommendation;
}

// ============================================
// Improve Types
// ============================================

/**
 * Improvement mode for palace_improve
 */
export type ImprovementMode =
  | 'append' // Add to end
  | 'append_section' // Add as new section
  | 'update_section' // Update specific section
  | 'merge' // Intelligently merge
  | 'replace' // Full replacement
  | 'frontmatter' // Update frontmatter only
  | 'consolidate'; // Phase 022: Merge children back into hub

/**
 * Input for palace_improve
 */
export interface PalaceImproveInput {
  path: string;
  mode: ImprovementMode;
  content?: string;
  section?: string; // Section name for update_section mode
  frontmatter?: Record<string, unknown>;
  autolink?: boolean;
  auto_split?: boolean; // Auto-split if exceeds atomic limits (default: true)
  author?: string; // Author of this update
  vault?: string;
  // Phase 022: Consolidation options
  delete_children?: boolean; // Delete child files after consolidation (default: true)
}

/**
 * Output from palace_improve
 */
export interface PalaceImproveOutput {
  success: boolean;
  vault: string;
  vaultPath: string;
  path: string;
  mode: ImprovementMode;
  changes: {
    lines_added?: number;
    lines_removed?: number;
    sections_modified?: string[];
    frontmatter_updated?: string[];
    links_added?: number;
    atomic_warning?: string;
    // Phase 022: Consolidation changes
    children_consolidated?: number;
    children_deleted?: string[];
  };
  version: number; // New palace.version
  message: string;
  // If content was auto-split into hub + children
  split_result?: AtomicSplitResult | undefined;
  // Phase 022: If content was consolidated from children
  consolidation_result?: {
    children_merged: string[];
    children_deleted: string[];
    sections_added: string[];
  } | undefined;

  // Phase 023: Operation tracking
  operation_id?: string | undefined;

  // Phase 023: Cleanup suggestions after major operations
  cleanup_suggestions?: CleanupSuggestions | undefined;
}

// ============================================
// Stub Types
// ============================================

/**
 * Stub note metadata
 */
export interface StubMetadata {
  path: string;
  title: string;
  stub_context: string; // Why was this stub created
  created: string; // ISO date
  mentioned_in: string[]; // Notes that mention this stub
}

// ============================================
// Domain Types (New for Phase 017)
// ============================================

/**
 * Domain information tracked in database
 */
export interface Domain {
  id: number;
  vault: string;
  path: string; // Full path like 'networking/wireless/lora'
  level: number; // Depth (1 = top-level)
  parentPath?: string; // Parent domain path
  noteCount: number;
  created: string;
  lastUsed: string;
}

/**
 * Domain discovery result
 */
export interface DiscoveredDomain {
  path: string;
  level: number;
  noteCount: number;
  children: DiscoveredDomain[];
}

// ============================================
// Zod Schemas for Validation
// ============================================

export const captureTypeSchema = z.enum(['source', 'knowledge', 'project']);

export const sourceTypeSchema = z.enum([
  'book',
  'video',
  'article',
  'podcast',
  'conversation',
  'documentation',
  'other',
]);

export const sourceInfoSchema = z.object({
  type: sourceTypeSchema,
  title: z.string().min(1, 'Source title is required'),
  author: z.string().optional(),
  url: z.string().url().optional(),
  date: z.string().optional(),
});

export const storageIntentSchema = z
  .object({
    capture_type: captureTypeSchema,
    domain: z.array(z.string()).min(1, 'At least one domain is required'),
    source: sourceInfoSchema.optional(),
    project: z.string().optional(),
    client: z.string().optional(),
    references: z.array(z.string()).optional(),
    note_type: z.string().optional(),
    tags: z.array(z.string()).optional(),
  })
  .refine(
    (data) => {
      // If capture_type is 'source', source info is required
      if (data.capture_type === 'source' && !data.source) {
        return false;
      }
      return true;
    },
    {
      message: "Source information is required when capture_type is 'source'",
    }
  )
  .refine(
    (data) => {
      // If capture_type is 'project', project or client is required
      if (data.capture_type === 'project' && !data.project && !data.client) {
        return false;
      }
      return true;
    },
    {
      message:
        "Project or client name is required when capture_type is 'project'",
    }
  );

export const storageSourceSchema = z.object({
  origin: z.union([
    z.literal('ai:research'),
    z.literal('ai:artifact'),
    z.literal('human'),
    z.string().regex(/^web:.+$/),
  ]),
  confidence: z.number().min(0).max(1).optional(),
});

export const storageOptionsSchema = z.object({
  vault: z.string().optional(),
  create_stubs: z.boolean().optional().default(true),
  retroactive_link: z.boolean().optional().default(true),
  dry_run: z.boolean().optional().default(false),
  autolink: z.boolean().optional().default(true),
  auto_split: z.boolean().optional().default(true),
  force_atomic: z.boolean().optional().default(false), // DEPRECATED: Use auto_split: false
  confirm_new_domain: z.boolean().optional().default(true),
  // Phase 022: Per-operation split threshold overrides
  split_thresholds: z.object({
    max_lines: z.number().optional(),
    max_sections: z.number().optional(),
    section_max_lines: z.number().optional(),
    min_section_lines: z.number().optional(),
    max_children: z.number().optional(),
    hub_sections: z.array(z.string()).optional(),
  }).optional(),
});

export const palaceStoreInputSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  content: z.string().min(1, 'Content is required'),
  intent: storageIntentSchema,
  options: storageOptionsSchema.optional(),
  source: storageSourceSchema.optional(),
});

export const improvementModeSchema = z.enum([
  'append',
  'append_section',
  'update_section',
  'merge',
  'replace',
  'frontmatter',
  'consolidate', // Phase 022: Merge children back into hub
]);

export const palaceImproveInputSchema = z.object({
  path: z.string().min(1, 'Path is required'),
  mode: improvementModeSchema,
  content: z.string().optional(),
  section: z.string().optional(),
  frontmatter: z.record(z.unknown()).optional(),
  autolink: z.boolean().optional().default(true),
  auto_split: z.boolean().optional().default(true),
  author: z.string().optional(),
  vault: z.string().optional(),
  // Phase 022: Consolidation options
  delete_children: z.boolean().optional().default(true),
});

export const palaceCheckInputSchema = z.object({
  query: z.string().min(1, 'Query is required'),
  domain: z.array(z.string()).optional(),
  path_filter: z.string().optional(),
  include_stubs: z.boolean().optional().default(true),
  vault: z.string().optional(),
});

