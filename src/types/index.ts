/**
 * Obsidian Palace MCP - Type Definitions
 *
 * Phase 017: Topic-Based Architecture
 * - Removed hardcoded knowledge types
 * - Domain/topic directly becomes folder path
 * - Only 3 capture types: source, knowledge, project
 *
 * Phase 025: Metadata Integrity
 * - Added canonical note types and validation
 */

import { CaptureType, SourceType } from './intent.js';

// Re-export intent types for convenience
export { CaptureType, SourceType } from './intent.js';

// Re-export note type validation (Phase 025)
export {
  VALID_NOTE_TYPES,
  BASE_NOTE_TYPES,
  type NoteType,
  type BaseNoteType,
  type TypeValidationResult,
  isValidNoteType,
  isHubType,
  getBaseType,
  getHubType,
  normalizeType,
  validateType,
  getValidTypes,
  getTypesGrouped,
} from './note-types.js';

// Source of knowledge (unchanged)
export type KnowledgeSource = 'claude' | 'user' | `web:${string}`;

/**
 * Note frontmatter schema (Phase 017)
 *
 * Phase 017 changes:
 * - Added 'capture_type' (source, knowledge, project)
 * - Added 'domain' (topic hierarchy as array)
 * - Added source_* fields for source captures
 * - 'type' kept for backward compatibility (deprecated)
 */
export interface NoteFrontmatter {
  // Phase 017: New capture classification
  capture_type?: CaptureType;
  domain?: string[]; // Topic hierarchy, e.g., ['networking', 'wireless', 'lora']


  // Source capture metadata (Phase 017)
  source_type?: SourceType;
  source_title?: string;
  source_author?: string;
  source_url?: string;

  // Project/client context
  project?: string;
  client?: string;

  // Timestamps
  created: string; // ISO date
  modified: string; // ISO date

  // Provenance
  source?: KnowledgeSource;
  confidence?: number; // 0.0 - 1.0
  verified?: boolean;

  // Organization
  tags?: string[];
  related?: string[]; // Wiki-link targets
  aliases?: string[];

  // Note metadata
  note_type?: string; // Optional categorization hint (not for path resolution)
  status?: 'active' | 'stub' | 'archived';

  // Tracking
  authors?: string[]; // Contributors to this note (e.g., ['ai:claude', 'human'])

  // Hub note fields
  children_count?: number;
  parent?: string;

  // Allow additional frontmatter fields
  [key: string]: unknown;
}

// Full note representation
export interface Note {
  path: string; // Relative to vault root
  filename: string;
  title: string;
  frontmatter: NoteFrontmatter;
  content: string; // Markdown body without frontmatter
  raw: string; // Full file content
}

// Note metadata (without content, for listings)
export interface NoteMetadata {
  path: string;
  filename: string;
  title: string;
  frontmatter: NoteFrontmatter;
}

// Link representation
export interface WikiLink {
  target: string; // The note being linked to
  display?: string; // Optional display text
  raw: string; // Original [[link|display]] text
}

// Graph link with direction
export interface GraphLink {
  source: string; // Source note path
  target: string; // Target note path (or title if unresolved)
  resolved: boolean; // Does target note exist?
}

// Graph node with link counts
export interface GraphNode {
  path: string;
  title: string;
  incomingCount: number;
  outgoingCount: number;
}

// Traversal result for multi-hop queries
export interface TraversalResult {
  depth: number;
  path: string[]; // Path from origin to this node
  note: NoteMetadata;
}

// Orphan types
export type OrphanType = 'no_incoming' | 'no_outgoing' | 'isolated';

// Relatedness methods
export type RelatednessMethod = 'links' | 'tags' | 'both';

// Related note result
export interface RelatedNote {
  note: NoteMetadata;
  score: number;
  sharedLinks?: string[];
  sharedTags?: string[];
}

// Search result
export interface SearchResult {
  note: NoteMetadata;
  score: number;
  matches?: SearchMatch[];
}

export interface SearchMatch {
  field: 'title' | 'content' | 'tags';
  snippet: string;
  positions?: number[];
}

// Directory listing entry
export interface DirectoryEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: DirectoryEntry[];
}

// Session tracking
export interface Session {
  id: string;
  date: string; // YYYY-MM-DD
  topic: string;
  context?: string;
  startedAt: string;
  entries: SessionEntry[];
}

export interface SessionEntry {
  timestamp: string;
  entry: string;
  notesCreated?: string[];
}

// Tool response types
export interface ToolSuccess<T = unknown> {
  success: true;
  data: T;
}

export interface ToolError {
  success: false;
  error: string;
  code?: string;
}

export type ToolResult<T = unknown> = ToolSuccess<T> | ToolError;

// Dataview query result
export interface DataviewResult {
  type: 'table' | 'list' | 'task';
  headers?: string[];
  rows: DataviewRow[];
}

export type DataviewRow = Record<string, unknown>;

// Configuration
export interface PalaceConfig {
  vaultPath: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  watchEnabled: boolean;
  indexPath?: string;
}

// ============================================
// Multi-Vault Configuration Types (v2.0)
// ============================================

// Vault access mode
export type VaultAccessMode = 'rw' | 'ro';

// Global config vault entry
export interface GlobalVaultEntry {
  path: string;
  alias: string;
  mode: VaultAccessMode;
  default?: boolean | undefined;
  description?: string | undefined;
}

// Cross-vault settings
export interface CrossVaultSettings {
  search: boolean;
  link_format: string;
  standards_source?: string | undefined;
}

// Global settings
export interface GlobalSettings {
  log_level: 'debug' | 'info' | 'warn' | 'error';
  watch_enabled: boolean;
  auto_index: boolean;
}

// Global configuration (~/.config/palace/config.yaml)
export interface GlobalConfig {
  version: number;
  vaults: GlobalVaultEntry[];
  cross_vault: CrossVaultSettings;
  settings: GlobalSettings;
}

/**
 * Structure configuration (Phase 017 - Simplified)
 *
 * Only defines special folder locations, NOT knowledge type mappings.
 * Knowledge goes to its domain path directly.
 */
export interface VaultStructure {
  // Special folders (not knowledge type mappings)
  sources?: string; // Where source captures go (default: 'sources/')
  projects?: string; // Where project context goes (default: 'projects/')
  clients?: string; // Where client context goes (default: 'clients/')
  daily?: string; // Where session logs go (default: 'daily/')
  standards?: string; // Where AI binding standards live (default: 'standards/')
}

// Vault ignore configuration
export interface VaultIgnoreConfig {
  patterns: string[];
  marker_file: string;
  frontmatter_key: string;
}

// Atomic note configuration
// Phase 018: Removed hub_filename - hub names are now derived from title
// Phase 022: Added min_section_lines, max_children, and hub_sections
export interface AtomicConfig {
  max_lines: number;
  max_sections: number;
  section_max_lines?: number | undefined;
  auto_split: boolean;
  // Phase 022: New configurable thresholds
  min_section_lines?: number | undefined; // Minimum lines for section to be split (default: 5)
  max_children?: number | undefined; // Maximum children to create (default: 10)
  // Phase 022: Sections that should stay in hub during splits (case-insensitive match)
  hub_sections?: string[] | undefined; // e.g., ['Quick Reference', 'Summary', 'Overview']
}

// Stub configuration
export interface StubConfig {
  auto_create: boolean;
  min_confidence: number;
}

// Graph integrity configuration
export interface GraphConfig {
  require_technology_links: boolean;
  warn_orphan_depth: number;
  retroactive_linking: boolean;
}

// Autolink configuration (Phase 024)
export type LinkMode = 'all' | 'first_per_section' | 'first_per_note';
export type DomainScope = 'any' | 'same_domain' | string[];

export interface AutolinkConfig {
  link_mode: LinkMode;
  stop_words?: string[] | undefined; // Additional stop words (merged with defaults)
  stop_words_override?: string[] | undefined; // Complete replacement of stop words
  domain_scope: DomainScope;
  min_title_length: number;
  max_links_per_paragraph?: number | undefined; // Limit link density
  min_word_distance?: number | undefined; // Minimum words between links
}

// History configuration (Phase 028)
export interface HistoryConfig {
  enabled: boolean;
  max_versions_per_note: number;
  max_age_days: number;
  auto_cleanup: boolean;
  exclude_patterns: string[];
}

// Per-vault info section
export interface VaultInfo {
  name: string;
  description?: string | undefined;
  mode?: VaultAccessMode | undefined;
}

// Per-vault configuration ({vault}/.palace.yaml)
export interface VaultConfig {
  vault: VaultInfo;
  structure: VaultStructure;
  ignore: VaultIgnoreConfig;
  atomic: AtomicConfig;
  stubs: StubConfig;
  graph: GraphConfig;
  autolink: AutolinkConfig; // Phase 024
  history: HistoryConfig; // Phase 028
}

// Resolved vault with both global and per-vault config
export interface ResolvedVault {
  alias: string;
  path: string;
  mode: VaultAccessMode;
  isDefault: boolean;
  description?: string | undefined;
  config: VaultConfig;
  indexPath: string;
}

// Vault registry interface
export interface VaultRegistry {
  vaults: Map<string, ResolvedVault>;
  defaultVault: string;
  getVault(aliasOrPath: string): ResolvedVault | undefined;
  getDefaultVault(): ResolvedVault;
  listVaults(): ResolvedVault[];
  isReadOnly(aliasOrPath: string): boolean;
}
