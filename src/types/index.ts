/**
 * Obsidian Palace MCP - Type Definitions
 */

// Knowledge types supported by the palace
export type KnowledgeType =
  | 'research'
  | 'command'
  | 'infrastructure'
  | 'client'
  | 'project'
  | 'pattern'
  | 'troubleshooting';

// Source of knowledge
export type KnowledgeSource = 'claude' | 'user' | `web:${string}`;

// Note frontmatter schema
export interface NoteFrontmatter {
  type: KnowledgeType;
  created: string; // ISO date
  modified: string; // ISO date
  source?: KnowledgeSource;
  confidence?: number; // 0.0 - 1.0
  verified?: boolean;
  tags?: string[];
  related?: string[]; // Wiki-link targets
  aliases?: string[];
  authors?: string[]; // Contributors to this note (e.g., ['ai:claude', 'human'])
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

// Structure mapping for a knowledge type
export interface StructureMapping {
  path: string;
  hub_file?: string | undefined;
  ai_binding?: 'required' | 'recommended' | 'optional' | undefined;
  subpaths?: Record<string, string> | undefined;
}

// Per-vault structure configuration
export interface VaultStructure {
  technology?: StructureMapping | undefined;
  command?: StructureMapping | undefined;
  standard?: StructureMapping | undefined;
  pattern?: StructureMapping | undefined;
  reference?: StructureMapping | undefined;
  research?: StructureMapping | undefined;
  project?: StructureMapping | undefined;
  client?: StructureMapping | undefined;
  decision?: StructureMapping | undefined;
  configuration?: StructureMapping | undefined;
  troubleshooting?: StructureMapping | undefined;
  note?: StructureMapping | undefined;
  [key: string]: StructureMapping | undefined;
}

// Vault ignore configuration
export interface VaultIgnoreConfig {
  patterns: string[];
  marker_file: string;
  frontmatter_key: string;
}

// Atomic note configuration
export interface AtomicConfig {
  max_lines: number;
  max_sections: number;
  section_max_lines?: number | undefined;
  hub_filename: string;
  auto_split: boolean;
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
