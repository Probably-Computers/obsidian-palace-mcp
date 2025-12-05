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
