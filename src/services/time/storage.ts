/**
 * Time entry storage service (Phase 030)
 *
 * Creates and manages time entry notes in the vault.
 */

import Database from 'better-sqlite3';
import { writeFile, mkdir, stat } from 'fs/promises';
import { join } from 'path';
import { stringifyFrontmatter } from '../../utils/frontmatter.js';
import { readNote } from '../vault/reader.js';
import { indexNote } from '../index/sync.js';
import { logger } from '../../utils/logger.js';
import type { VaultIgnoreConfig } from '../../types/index.js';

export const TIME_CATEGORIES = [
  'development',
  'research',
  'meetings',
  'review',
  'documentation',
  'design',
  'admin',
  'business_dev',
  'professional_dev',
  'other',
] as const;

export type TimeCategory = (typeof TIME_CATEGORIES)[number];

export interface TimeEntryData {
  project: string;
  duration_minutes: number;
  description: string;
  date: string; // YYYY-MM-DD
  client?: string | undefined;
  category?: TimeCategory | undefined;
  billable?: boolean | undefined;
  work_items?: string[] | undefined;
  session_id?: string | undefined;
  source?: 'session' | 'manual' | 'estimate' | undefined;
  start_time?: string | undefined; // ISO 8601
  end_time?: string | undefined; // ISO 8601
}

export interface TimeEntryResult {
  path: string;
  title: string;
  duration_minutes: number;
  duration_formatted: string;
}

/**
 * Parse a flexible duration input into minutes
 */
export function parseDuration(input: string | number): number {
  if (typeof input === 'number') {
    if (input < 0 || !Number.isFinite(input)) {
      throw new Error(`Invalid duration: ${input}`);
    }
    return Math.round(input);
  }

  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Duration cannot be empty');
  }

  // Pure number string: treat as minutes
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return Math.round(parseFloat(trimmed));
  }

  // Hours only: "2h", "2.5h"
  const hoursOnly = trimmed.match(/^(\d+(?:\.\d+)?)h$/i);
  if (hoursOnly) {
    return Math.round(parseFloat(hoursOnly[1]!) * 60);
  }

  // Minutes only: "30m"
  const minutesOnly = trimmed.match(/^(\d+)m$/i);
  if (minutesOnly) {
    return parseInt(minutesOnly[1]!, 10);
  }

  // Hours and minutes: "2h 30m", "2h30m"
  const hoursAndMinutes = trimmed.match(/^(\d+)h\s*(\d+)m$/i);
  if (hoursAndMinutes) {
    const hours = parseInt(hoursAndMinutes[1]!, 10);
    const minutes = parseInt(hoursAndMinutes[2]!, 10);
    return hours * 60 + minutes;
  }

  throw new Error(`Invalid duration format: "${input}". Use minutes (120), hours (2h, 2.5h), or hours+minutes (2h 30m).`);
}

/**
 * Format minutes as a human-readable duration string
 */
export function formatDuration(minutes: number): string {
  if (minutes < 0) return '0m';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

/**
 * Create a time entry note in the vault
 */
export async function createTimeEntry(
  data: TimeEntryData,
  vaultPath: string,
  db: Database.Database,
  ignoreConfig?: VaultIgnoreConfig
): Promise<TimeEntryResult> {
  const { project, duration_minutes, description, date } = data;
  const category = data.category ?? 'other';
  const billable = data.billable ?? true;
  const source = data.source ?? 'manual';

  // Parse date components for path
  const [year, month] = date.split('-');
  const dirPath = `time/${year}/${month}`;
  const fullDirPath = join(vaultPath, dirPath);
  await mkdir(fullDirPath, { recursive: true });

  // Build filename: {date} - {project} - {category}.md
  const baseFilename = `${date} - ${project} - ${category}.md`;
  let filename = baseFilename;
  let filePath = join(dirPath, filename);

  // Handle filename conflicts with numeric suffix
  let suffix = 1;
  let exists = true;
  while (exists) {
    try {
      await stat(join(vaultPath, filePath));
      // File exists, try next suffix
      suffix++;
      filename = `${date} - ${project} - ${category} (${suffix}).md`;
      filePath = join(dirPath, filename);
    } catch {
      exists = false;
    }
  }

  // Build frontmatter
  const now = new Date().toISOString();
  const frontmatter: Record<string, unknown> = {
    type: 'time_entry',
    created: now,
    modified: now,
    project,
    duration_minutes,
    date,
    category,
    billable,
    source,
    tags: ['time-tracking', project.toLowerCase().replace(/\s+/g, '-')],
  };

  if (data.client) frontmatter.client = data.client;
  if (data.session_id) frontmatter.session_id = data.session_id;
  if (data.start_time) frontmatter.start_time = data.start_time;
  if (data.end_time) frontmatter.end_time = data.end_time;

  // Build content
  const durationStr = formatDuration(duration_minutes);
  let body = `# Time Entry\n\n`;
  body += `**Project**: ${project}\n`;
  if (data.client) body += `**Client**: ${data.client}\n`;
  body += `**Duration**: ${durationStr}\n`;
  body += `**Category**: ${category}\n`;
  body += `**Date**: ${date}\n`;
  body += `\n## Description\n\n${description}\n`;

  if (data.work_items && data.work_items.length > 0) {
    body += `\n## Work Items\n\n`;
    for (const item of data.work_items) {
      body += `- [[${item}]]\n`;
    }
  }

  // Write file
  const fileContent = stringifyFrontmatter(frontmatter, body);
  await writeFile(join(vaultPath, filePath), fileContent, 'utf-8');

  // Index the note
  const readOpts: { vaultPath: string; ignoreConfig?: VaultIgnoreConfig } = { vaultPath };
  if (ignoreConfig) readOpts.ignoreConfig = ignoreConfig;
  const note = await readNote(filePath, readOpts);
  if (note) {
    indexNote(db, note);
  }

  logger.info(`Created time entry: ${filePath} (${durationStr})`);

  return {
    path: filePath,
    title: `Time Entry: ${project} - ${category}`,
    duration_minutes,
    duration_formatted: durationStr,
  };
}
