/**
 * Project context loader (Phase 031)
 *
 * Compositor service that aggregates data from existing services
 * to provide project context at brief/standard/deep depth levels.
 */

import Database from 'better-sqlite3';
import { queryNotesInVault } from '../index/query.js';
import { readNote } from '../vault/reader.js';
import type { ReadOptions } from '../vault/reader.js';
import { aggregateTime } from '../time/aggregator.js';
import { parseWorkItems, summarizeWorkItems } from './work-items.js';
import { logger } from '../../utils/logger.js';
import type { VaultIgnoreConfig, Note } from '../../types/index.js';
import type { WorkItem } from './work-items.js';
import type { AggregationResult } from '../time/aggregator.js';

export type ContextDepth = 'brief' | 'standard' | 'deep';

export interface ProjectContextOptions {
  depth: ContextDepth;
  lookback_days: number;
  include_time: boolean;
}

export interface BriefContext {
  project: string;
  client?: string;
  status?: string;
  priority?: string;
  path?: string;
  hub_path?: string;
  description?: string;
  last_modified?: string;
  work_items: { total: number; done: number; in_progress: number; blocked: number };
  time_summary?: { total_minutes: number; total_formatted: string };
  blockers: string[];
  sections_available: string[];
}

export interface StandardContext extends BriefContext {
  work_item_details?: WorkItem[];
  recent_changes?: Array<{ path: string; title: string; modified: string }>;
  knowledge_map?: string;
  time_by_category?: AggregationResult;
  decisions?: string;
}

export interface DeepContext extends StandardContext {
  hub_content?: string;
  session_history?: Array<{ path: string; date: string; topic?: string }>;
  related_projects?: Array<{ path: string; project: string; status?: string }>;
  stubs?: Array<{ path: string; title: string }>;
}

export type ProjectContext = BriefContext | StandardContext | DeepContext;

/**
 * Build ReadOptions, only including ignoreConfig if defined
 */
function buildReadOptions(vaultPath: string, ignoreConfig?: VaultIgnoreConfig): ReadOptions {
  const opts: ReadOptions = { vaultPath };
  if (ignoreConfig) opts.ignoreConfig = ignoreConfig;
  return opts;
}

/**
 * Discover the project hub note using a fallback chain
 */
async function discoverProjectHub(
  project: string,
  db: Database.Database,
  vaultPath: string,
  ignoreConfig?: VaultIgnoreConfig,
): Promise<Note | null> {
  const readOpts = buildReadOptions(vaultPath, ignoreConfig);

  // 1. Query by project field + hub type
  const hubNotes = queryNotesInVault(db, {
    type: 'project_hub',
    project,
    limit: 1,
  });
  if (hubNotes.length > 0) {
    return readNote(hubNotes[0]!.path, readOpts);
  }

  // 2. Query by project field + project type
  const projectNotes = queryNotesInVault(db, {
    type: 'project',
    project,
    limit: 1,
  });
  if (projectNotes.length > 0) {
    return readNote(projectNotes[0]!.path, readOpts);
  }

  // 3. Path-based search
  const slug = project.toLowerCase().replace(/\s+/g, '-');
  const pathNotes = queryNotesInVault(db, {
    path: `projects/${slug}/`,
    limit: 5,
    sortBy: 'modified',
    sortOrder: 'desc',
  });
  for (const note of pathNotes) {
    if (note.frontmatter.type === 'project_hub' || note.frontmatter.type === 'project') {
      return readNote(note.path, readOpts);
    }
  }
  if (pathNotes.length > 0) {
    return readNote(pathNotes[0]!.path, readOpts);
  }

  // 4. Title-based search (last resort)
  const titleNotes = queryNotesInVault(db, { limit: 50 });
  for (const note of titleNotes) {
    if (note.title?.toLowerCase() === project.toLowerCase()) {
      return readNote(note.path, readOpts);
    }
  }

  return null;
}

/**
 * Extract a named section from markdown content
 */
function extractSection(content: string, heading: string): string | undefined {
  const regex = new RegExp(`^## ${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n`, 'm');
  const match = regex.exec(content);
  if (!match) return undefined;

  const start = match.index + match[0].length;
  const nextH2 = content.indexOf('\n## ', start);
  const end = nextH2 === -1 ? content.length : nextH2;
  return content.slice(start, end).trim();
}

/**
 * Build a BriefContext, only setting optional fields if they have values
 */
function buildBriefContext(
  project: string,
  fm: Record<string, unknown>,
  hub: Note,
  items: WorkItem[],
  options: ProjectContextOptions,
): BriefContext {
  const summary = summarizeWorkItems(items);
  const blockers = items
    .filter((i) => !i.checked && i.blocked_by)
    .map((i) => i.blocked_by!);

  const brief: BriefContext = {
    project: (fm.project as string) ?? project,
    work_items: {
      total: summary.total,
      done: summary.done,
      in_progress: summary.in_progress,
      blocked: summary.blocked,
    },
    blockers,
    sections_available: buildSectionsAvailable(hub.content, options),
  };

  const clientVal = fm.client as string | undefined;
  if (clientVal) brief.client = clientVal;

  const statusVal = fm.status as string | undefined;
  if (statusVal) brief.status = statusVal;

  const priorityVal = fm.priority as string | undefined;
  if (priorityVal) brief.priority = priorityVal;

  brief.path = hub.path.replace(/[^/]+$/, '');
  brief.hub_path = hub.path;

  const desc = hub.content.split('\n\n')[0]?.replace(/^#.*\n?/, '').trim();
  if (desc) brief.description = desc;

  const modifiedVal = fm.modified as string | undefined;
  if (modifiedVal) brief.last_modified = modifiedVal;

  return brief;
}

/**
 * Load project context at specified depth
 */
export async function loadProjectContext(
  project: string,
  db: Database.Database,
  vaultPath: string,
  options: ProjectContextOptions,
  ignoreConfig?: VaultIgnoreConfig,
): Promise<ProjectContext> {
  const hub = await discoverProjectHub(project, db, vaultPath, ignoreConfig);

  if (!hub) {
    return {
      project,
      work_items: { total: 0, done: 0, in_progress: 0, blocked: 0 },
      blockers: [],
      sections_available: [],
    };
  }

  const fm = hub.frontmatter as Record<string, unknown>;
  const items = parseWorkItems(hub.content);
  const brief = buildBriefContext(project, fm, hub, items, options);

  // Time summary for brief
  if (options.include_time) {
    const lookbackDate = getLookbackDate(options.lookback_days);
    try {
      const timeResult = await aggregateTime(db, vaultPath, {
        project: (fm.project as string) ?? project,
        date_from: lookbackDate,
      }, 'project', false, ignoreConfig);
      if (timeResult.grand_total_minutes > 0) {
        brief.time_summary = {
          total_minutes: timeResult.grand_total_minutes,
          total_formatted: timeResult.grand_total_formatted,
        };
      }
    } catch {
      logger.debug('Time aggregation failed for project context');
    }
  }

  if (options.depth === 'brief') return brief;

  // Standard depth
  const lookbackDate = getLookbackDate(options.lookback_days);
  const standard: StandardContext = { ...brief };

  standard.work_item_details = items;

  // Recent changes
  const recentNotes = queryNotesInVault(db, {
    project: (fm.project as string) ?? project,
    modifiedAfter: lookbackDate,
    sortBy: 'modified',
    sortOrder: 'desc',
    limit: 20,
  });
  if (recentNotes.length > 0) {
    standard.recent_changes = recentNotes.map((n) => ({
      path: n.path,
      title: n.title,
      modified: n.frontmatter.modified,
    }));
  }

  // Knowledge Map
  const knowledgeMap = extractSection(hub.content, 'Knowledge Map');
  if (knowledgeMap) standard.knowledge_map = knowledgeMap;

  // Time by category
  if (options.include_time) {
    try {
      const timeByCat = await aggregateTime(db, vaultPath, {
        project: (fm.project as string) ?? project,
        date_from: lookbackDate,
      }, 'category', false, ignoreConfig);
      if (timeByCat.total_entries > 0) {
        standard.time_by_category = timeByCat;
      }
    } catch {
      logger.debug('Time by category aggregation failed');
    }
  }

  // Decisions
  const decisions = extractSection(hub.content, 'Notes & Decisions')
    ?? extractSection(hub.content, 'Decisions');
  if (decisions) standard.decisions = decisions;

  if (options.depth === 'standard') return standard;

  // Deep depth
  const deep: DeepContext = { ...standard };

  deep.hub_content = hub.content;

  // Session history (daily notes mentioning project)
  const dailyNotes = queryNotesInVault(db, {
    type: 'daily',
    modifiedAfter: lookbackDate,
    sortBy: 'modified',
    sortOrder: 'desc',
    limit: 10,
  });
  if (dailyNotes.length > 0) {
    deep.session_history = dailyNotes.map((n) => ({
      path: n.path,
      date: n.frontmatter.modified,
      topic: n.title,
    }));
  }

  // Related projects
  const relatedProjects = queryNotesInVault(db, {
    type: 'project_hub',
    limit: 10,
  });
  const otherProjects = relatedProjects.filter((n) => n.path !== hub.path);
  if (otherProjects.length > 0) {
    deep.related_projects = otherProjects.map((n) => ({
      path: n.path,
      project: n.title,
    }));
  }

  // Stubs in project path
  const projectPath = hub.path.replace(/[^/]+$/, '');
  if (projectPath) {
    const stubs = queryNotesInVault(db, {
      type: 'stub',
      path: projectPath,
      limit: 20,
    });
    if (stubs.length > 0) {
      deep.stubs = stubs.map((n) => ({ path: n.path, title: n.title }));
    }
  }

  return deep;
}

/**
 * Load brief context for all projects
 */
export async function loadAllProjectsBrief(
  db: Database.Database,
  vaultPath: string,
  ignoreConfig?: VaultIgnoreConfig,
): Promise<BriefContext[]> {
  const readOpts = buildReadOptions(vaultPath, ignoreConfig);

  // Find all project hubs
  const projectHubs = queryNotesInVault(db, {
    type: 'project_hub',
    limit: 100,
    sortBy: 'modified',
    sortOrder: 'desc',
  });

  // Also find standalone project notes
  const projectNotes = queryNotesInVault(db, {
    type: 'project',
    limit: 100,
    sortBy: 'modified',
    sortOrder: 'desc',
  });

  // Deduplicate by project name
  const seen = new Set<string>();
  const allNotes = [...projectHubs, ...projectNotes];
  const unique = allNotes.filter((n) => {
    const key = n.title?.toLowerCase() ?? n.path;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const results: BriefContext[] = [];

  for (const meta of unique) {
    const note = await readNote(meta.path, readOpts);
    if (!note) continue;

    const fm = note.frontmatter as Record<string, unknown>;
    const items = parseWorkItems(note.content);
    const summary = summarizeWorkItems(items);
    const blockers = items
      .filter((i) => !i.checked && i.blocked_by)
      .map((i) => i.blocked_by!);

    const ctx: BriefContext = {
      project: (fm.project as string) ?? note.title,
      path: note.path.replace(/[^/]+$/, ''),
      hub_path: note.path,
      work_items: {
        total: summary.total,
        done: summary.done,
        in_progress: summary.in_progress,
        blocked: summary.blocked,
      },
      blockers,
      sections_available: [],
    };

    const clientVal = fm.client as string | undefined;
    if (clientVal) ctx.client = clientVal;

    const statusVal = fm.status as string | undefined;
    if (statusVal) ctx.status = statusVal;

    const priorityVal = fm.priority as string | undefined;
    if (priorityVal) ctx.priority = priorityVal;

    const modifiedVal = fm.modified as string | undefined;
    if (modifiedVal) ctx.last_modified = modifiedVal;

    results.push(ctx);
  }

  // Sort: in_progress first, then by last_modified
  const statusOrder: Record<string, number> = {
    in_progress: 0,
    blocked: 1,
    review: 2,
    todo: 3,
    backlog: 4,
    on_hold: 5,
    done: 6,
    cancelled: 7,
  };

  results.sort((a, b) => {
    const aPri = statusOrder[a.status ?? 'backlog'] ?? 4;
    const bPri = statusOrder[b.status ?? 'backlog'] ?? 4;
    if (aPri !== bPri) return aPri - bPri;
    return (b.last_modified ?? '').localeCompare(a.last_modified ?? '');
  });

  return results;
}

function getLookbackDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function buildSectionsAvailable(content: string, options: ProjectContextOptions): string[] {
  const sections: string[] = [];
  if (/- \[[ xX]\]/.test(content)) sections.push('work_items');
  if (content.includes('## Knowledge Map')) sections.push('knowledge_map');
  if (content.includes('## Notes & Decisions') || content.includes('## Decisions'))
    sections.push('decisions');
  if (options.include_time) sections.push('time_detail');
  return sections;
}
