/**
 * Time aggregation service (Phase 030)
 *
 * Queries and aggregates time entry notes for reporting.
 */

import Database from 'better-sqlite3';
import { readNote } from '../vault/reader.js';
import { formatDuration } from './storage.js';
import { logger } from '../../utils/logger.js';
import type { VaultIgnoreConfig } from '../../types/index.js';

export interface TimeFilter {
  project?: string | undefined;
  client?: string | undefined;
  category?: string | undefined;
  billable?: boolean | undefined;
  date_from?: string | undefined; // YYYY-MM-DD
  date_to?: string | undefined;
}

export type GroupBy = 'project' | 'client' | 'date' | 'category';

export interface AggregationEntry {
  path: string;
  description: string;
  duration_minutes: number;
  date: string;
}

export interface AggregationGroup {
  key: string;
  total_minutes: number;
  total_formatted: string;
  entry_count: number;
  entries?: AggregationEntry[] | undefined;
}

export interface AggregationResult {
  groups: AggregationGroup[];
  grand_total_minutes: number;
  grand_total_formatted: string;
  total_entries: number;
  filters_applied: Record<string, string>;
}

/**
 * Aggregate time entries with optional filtering and grouping
 */
export async function aggregateTime(
  db: Database.Database,
  vaultPath: string,
  filters: TimeFilter = {},
  groupBy: GroupBy = 'project',
  includeEntries = false,
  ignoreConfig?: VaultIgnoreConfig
): Promise<AggregationResult> {
  // Query all time_entry notes from the index
  const rows = db
    .prepare('SELECT path FROM notes WHERE type = ?')
    .all('time_entry') as { path: string }[];

  logger.debug(`Found ${rows.length} time entry notes`);

  // Read and filter entries
  const entries: Array<{
    path: string;
    project: string;
    client: string;
    category: string;
    duration_minutes: number;
    date: string;
    billable: boolean;
    description: string;
  }> = [];

  for (const row of rows) {
    const readOpts: { vaultPath: string; ignoreConfig?: VaultIgnoreConfig } = { vaultPath };
    if (ignoreConfig) readOpts.ignoreConfig = ignoreConfig;
    const note = await readNote(row.path, readOpts);
    if (!note) continue;

    const fm = note.frontmatter as Record<string, unknown>;
    const project = (fm.project as string) ?? 'Unknown';
    const client = (fm.client as string) ?? '';
    const category = (fm.category as string) ?? 'other';
    const duration = (fm.duration_minutes as number) ?? 0;
    const date = (fm.date as string) ?? '';
    const billable = fm.billable !== false;

    // Extract description from content (first paragraph after ## Description)
    const descMatch = note.content.match(/## Description\s*\n\s*\n(.*?)(?:\n\n|\n##|$)/s);
    const description = descMatch?.[1]?.trim() ?? '';

    // Apply filters
    if (filters.project && project.toLowerCase() !== filters.project.toLowerCase()) continue;
    if (filters.client && client.toLowerCase() !== filters.client.toLowerCase()) continue;
    if (filters.category && category !== filters.category) continue;
    if (filters.billable !== undefined && billable !== filters.billable) continue;
    if (filters.date_from && date < filters.date_from) continue;
    if (filters.date_to && date > filters.date_to) continue;

    entries.push({
      path: row.path,
      project,
      client,
      category,
      duration_minutes: duration,
      date,
      billable,
      description,
    });
  }

  // Group entries
  const groupMap = new Map<string, typeof entries>();
  for (const entry of entries) {
    let key: string;
    switch (groupBy) {
      case 'project':
        key = entry.project;
        break;
      case 'client':
        key = entry.client || '(no client)';
        break;
      case 'date':
        key = entry.date;
        break;
      case 'category':
        key = entry.category;
        break;
    }
    const group = groupMap.get(key) ?? [];
    group.push(entry);
    groupMap.set(key, group);
  }

  // Build result groups
  const groups: AggregationGroup[] = [];
  for (const [key, groupEntries] of groupMap) {
    const totalMinutes = groupEntries.reduce((sum, e) => sum + e.duration_minutes, 0);
    const group: AggregationGroup = {
      key,
      total_minutes: totalMinutes,
      total_formatted: formatDuration(totalMinutes),
      entry_count: groupEntries.length,
    };

    if (includeEntries) {
      group.entries = groupEntries.map((e) => ({
        path: e.path,
        description: e.description,
        duration_minutes: e.duration_minutes,
        date: e.date,
      }));
    }

    groups.push(group);
  }

  // Sort groups by total minutes descending
  groups.sort((a, b) => b.total_minutes - a.total_minutes);

  const grandTotal = entries.reduce((sum, e) => sum + e.duration_minutes, 0);

  // Build filters applied description
  const filtersApplied: Record<string, string> = {};
  if (filters.project) filtersApplied.project = filters.project;
  if (filters.client) filtersApplied.client = filters.client;
  if (filters.category) filtersApplied.category = filters.category;
  if (filters.billable !== undefined) filtersApplied.billable = String(filters.billable);
  if (filters.date_from) filtersApplied.date_from = filters.date_from;
  if (filters.date_to) filtersApplied.date_to = filters.date_to;

  return {
    groups,
    grand_total_minutes: grandTotal,
    grand_total_formatted: formatDuration(grandTotal),
    total_entries: entries.length,
    filters_applied: filtersApplied,
  };
}
