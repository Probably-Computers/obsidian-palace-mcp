/**
 * Intent-Based Storage Types (Phase 011)
 *
 * These types define how AI expresses WHAT to store, allowing the MCP
 * to determine WHERE based on vault configuration.
 */

import { z } from 'zod';

// Knowledge types supported for intent-based storage
export type IntentKnowledgeType =
  | 'technology'
  | 'command'
  | 'reference'
  | 'standard'
  | 'pattern'
  | 'research'
  | 'decision'
  | 'configuration'
  | 'troubleshooting'
  | 'note';

// Knowledge layer enumeration
export enum KnowledgeLayer {
  TECHNICAL = 'technical', // Layer 1: technologies/, commands/, reference/
  DOMAIN = 'domain', // Layer 2: standards/, patterns/, research/
  CONTEXTUAL = 'contextual', // Layer 3: projects/, clients/, products/
}

// Storage intent - what the AI wants to store
export interface StorageIntent {
  // What kind of knowledge
  knowledge_type: IntentKnowledgeType;

  // Classification
  domain: string[]; // e.g., ["kubernetes", "networking"]
  tags?: string[] | undefined;

  // Scope determination
  scope: 'general' | 'project-specific';

  // Context (used when scope is project-specific)
  project?: string | undefined;
  client?: string | undefined;
  product?: string | undefined;

  // Graph connections
  technologies?: string[] | undefined; // Technologies to link/stub
  references?: string[] | undefined; // Explicit links to create
  parent?: string | undefined; // Parent hub if known
}

// Source provenance for stored knowledge
export interface StorageSource {
  origin: 'ai:research' | 'ai:artifact' | 'human' | `web:${string}`;
  confidence?: number | undefined; // 0.0 - 1.0
}

// Options for storage operations
export interface StorageOptions {
  vault?: string; // Specific vault alias
  create_stubs?: boolean; // Create stubs for unknown tech (default: true)
  retroactive_link?: boolean; // Update existing notes (default: true)
  expand_if_stub?: boolean; // Expand existing stub (default: true)
  dry_run?: boolean; // Preview without saving
  autolink?: boolean; // Auto-link content (default: true)
  force_atomic?: boolean; // Skip atomic splitting (default: false)
}

// Full input for palace_store
export interface PalaceStoreInput {
  title: string;
  content: string;
  intent: StorageIntent;
  options?: StorageOptions;
  source?: StorageSource;
}

// Resolution result from path resolver
export interface VaultResolution {
  vault: string; // Vault alias
  vaultPath: string; // Full vault path
  relativePath: string; // Path relative to vault root
  fullPath: string; // Absolute file path
  filename: string; // Just the filename
  parentDir: string; // Parent directory path
  hubPath?: string | undefined; // Associated hub file if any
  layer: KnowledgeLayer; // Determined knowledge layer
}

// Split result when content was atomically split
export interface AtomicSplitResult {
  hub_path: string;
  children_paths: string[];
  children_count: number;
}

// Output from palace_store
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

  // Stubs created for mentioned technologies
  stubs_created?: string[] | undefined;

  // Links added to/from existing notes
  links_added?: {
    to_existing: string[];
    from_existing: string[];
  } | undefined;

  // If existing stub was expanded instead of creating new
  expanded_stub?: string | undefined;

  // If content was split into hub + children
  split_result?: AtomicSplitResult | undefined;

  // Summary message
  message: string;
}

// Check result recommendation
export type CheckRecommendation =
  | 'create_new' // No matches found
  | 'expand_stub' // Found stub to expand
  | 'improve_existing' // Good match exists
  | 'reference_existing'; // Exact match, just reference it

// Match from palace_check
export interface CheckMatch {
  path: string;
  vault: string;
  title: string;
  status: 'active' | 'stub';
  confidence: number;
  relevance: number;
  summary: string;
  last_modified: string;
}

// Suggestions from palace_check
export interface CheckSuggestions {
  should_expand_stub: boolean;
  stub_path?: string | undefined;
  missing_technologies: string[];
  similar_titles: string[];
}

// Output from palace_check
export interface PalaceCheckOutput {
  found: boolean;
  vault: string;
  vaultPath: string;
  matches: CheckMatch[];
  suggestions: CheckSuggestions;
  recommendation: CheckRecommendation;
}

// Improvement mode for palace_improve
export type ImprovementMode =
  | 'append' // Add to end
  | 'append_section' // Add as new section
  | 'update_section' // Update specific section
  | 'merge' // Intelligently merge
  | 'replace' // Full replacement
  | 'frontmatter'; // Update frontmatter only

// Input for palace_improve
export interface PalaceImproveInput {
  path: string;
  mode: ImprovementMode;
  content?: string;
  section?: string; // Section name for update_section mode
  frontmatter?: Record<string, unknown>;
  autolink?: boolean;
  author?: string; // Author of this update (added to authors array)
  vault?: string;
}

// Output from palace_improve
export interface PalaceImproveOutput {
  success: boolean;
  vault: string;
  vaultPath: string;
  path: string;
  mode: ImprovementMode;
  changes: {
    lines_added?: number | undefined;
    lines_removed?: number | undefined;
    sections_modified?: string[] | undefined;
    frontmatter_updated?: string[] | undefined;
    links_added?: number | undefined;
    atomic_warning?: string | undefined;
  };
  version: number; // New palace.version
  message: string;
}

// Stub note metadata
export interface StubMetadata {
  path: string;
  title: string;
  stub_context: string; // Why was this stub created
  created: string; // ISO date
  mentioned_in: string[]; // Notes that mention this stub
}

// ============================================
// Zod Schemas for Validation
// ============================================

export const intentKnowledgeTypeSchema = z.enum([
  'technology',
  'command',
  'reference',
  'standard',
  'pattern',
  'research',
  'decision',
  'configuration',
  'troubleshooting',
  'note',
]);

export const storageIntentSchema = z.object({
  knowledge_type: intentKnowledgeTypeSchema,
  domain: z.array(z.string()).min(1, 'At least one domain is required'),
  tags: z.array(z.string()).optional(),
  scope: z.enum(['general', 'project-specific']),
  project: z.string().optional(),
  client: z.string().optional(),
  product: z.string().optional(),
  technologies: z.array(z.string()).optional(),
  references: z.array(z.string()).optional(),
  parent: z.string().optional(),
});

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
  expand_if_stub: z.boolean().optional().default(true),
  dry_run: z.boolean().optional().default(false),
  autolink: z.boolean().optional().default(true),
  force_atomic: z.boolean().optional().default(false),
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
]);

export const palaceImproveInputSchema = z.object({
  path: z.string().min(1, 'Path is required'),
  mode: improvementModeSchema,
  content: z.string().optional(),
  section: z.string().optional(),
  frontmatter: z.record(z.unknown()).optional(),
  autolink: z.boolean().optional().default(true),
  author: z.string().optional(),
  vault: z.string().optional(),
});

export const palaceCheckInputSchema = z.object({
  query: z.string().min(1, 'Query is required'),
  knowledge_type: intentKnowledgeTypeSchema.optional(),
  domain: z.array(z.string()).optional(),
  include_stubs: z.boolean().optional().default(true),
  vault: z.string().optional(),
});
