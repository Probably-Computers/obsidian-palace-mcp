/**
 * Session tracking tools - palace_session_start, palace_session_log, palace_session_end
 * Creates and manages daily session logs for AI work tracking
 */

import { z } from 'zod';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolResult, Session, SessionEntry, ResolvedVault } from '../types/index.js';
import { logger } from '../utils/logger.js';
import {
  resolveVaultParam,
  enforceWriteAccess,
  getVaultResultInfo,
} from '../utils/vault-param.js';
import { getIndexManager } from '../services/index/manager.js';
import { createTimeEntry, formatDuration, TIME_CATEGORIES } from '../services/time/storage.js';
import type { TimeEntryData } from '../services/time/storage.js';

// Current session state (in-memory for simplicity)
let currentSession: (Session & { vault: ResolvedVault }) | null = null;

/**
 * Get today's date in YYYY-MM-DD format
 */
function getToday(): string {
  return new Date().toISOString().split('T')[0]!;
}

/**
 * Get current time in HH:MM format
 */
function getTime(): string {
  return new Date().toISOString().split('T')[1]!.slice(0, 5);
}

/**
 * Get the path to today's daily log file
 */
function getDailyLogPath(date: string, vaultPath: string): string {
  return join(vaultPath, 'daily', `${date}.md`);
}

/**
 * Ensure the daily directory exists
 */
async function ensureDailyDir(vaultPath: string): Promise<void> {
  const dailyDir = join(vaultPath, 'daily');
  try {
    await mkdir(dailyDir, { recursive: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }
  }
}

/**
 * Read the current daily log content, or return null if it doesn't exist
 */
async function readDailyLog(date: string, vaultPath: string): Promise<string | null> {
  const logPath = getDailyLogPath(date, vaultPath);
  try {
    return await readFile(logPath, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Count sessions in existing daily log
 */
function countSessions(content: string): number {
  const matches = content.match(/^## Session \d+:/gm);
  return matches ? matches.length : 0;
}

/**
 * Create initial daily log content
 */
function createDailyLogContent(date: string): string {
  return `---
type: daily
date: ${date}
sessions: 0
---

# ${date}
`;
}

/**
 * Format a session section for the daily log
 */
function formatSessionSection(session: Session, sessionNumber: number): string {
  let section = `\n## Session ${sessionNumber}: ${session.topic}\n`;
  section += `**Started**: ${session.startedAt.split('T')[1]?.slice(0, 5) || getTime()}\n`;

  if (session.context) {
    section += `**Context**: ${session.context}\n`;
  }

  section += `\n### Log\n`;

  for (const entry of session.entries) {
    const time = entry.timestamp.split('T')[1]?.slice(0, 5) || getTime();
    section += `- ${time} - ${entry.entry}\n`;
  }

  // Add notes created section if any entries have notes
  const allNotes = session.entries
    .flatMap((e) => e.notesCreated || [])
    .filter((note, index, arr) => arr.indexOf(note) === index);

  if (allNotes.length > 0) {
    section += `\n### Notes Created\n`;
    for (const note of allNotes) {
      section += `- [[${note.replace(/\.md$/, '')}]]\n`;
    }
  }

  return section;
}

/**
 * Update the sessions count in frontmatter
 */
function updateSessionsCount(content: string, count: number): string {
  return content.replace(/^sessions: \d+$/m, `sessions: ${count}`);
}

// ============================================================================
// palace_session_start
// ============================================================================

const startInputSchema = z.object({
  topic: z.string().min(1, 'Topic is required'),
  context: z.string().optional(),
  vault: z.string().optional().describe('Vault alias or path. Defaults to the default vault.'),
});

export const sessionStartTool: Tool = {
  name: 'palace_session_start',
  description: `Start a new session in today's daily log. Creates a session entry to track your research and work. Use this at the beginning of a focused work period.`,
  inputSchema: {
    type: 'object',
    properties: {
      topic: {
        type: 'string',
        description: 'What this session is about (e.g., "Kubernetes networking research")',
      },
      context: {
        type: 'string',
        description: 'Additional context (e.g., client name, project name)',
      },
      vault: {
        type: 'string',
        description: 'Vault alias or path to store the session in (defaults to default vault)',
      },
    },
    required: ['topic'],
  },
};

export async function sessionStartHandler(args: Record<string, unknown>): Promise<ToolResult> {
  const parseResult = startInputSchema.safeParse(args);
  if (!parseResult.success) {
    return {
      success: false,
      error: parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      code: 'VALIDATION_ERROR',
    };
  }

  const { topic, context, vault: vaultParam } = parseResult.data;

  try {
    // Resolve and validate vault
    const vault = resolveVaultParam(vaultParam);
    enforceWriteAccess(vault);

    await ensureDailyDir(vault.path);

    const today = getToday();
    const now = new Date().toISOString();

    // Create new session
    const session: Session = {
      id: `session-${Date.now()}`,
      date: today,
      topic,
      startedAt: now,
      entries: [],
    };
    if (context) {
      session.context = context;
    }
    currentSession = { ...session, vault };

    // Read or create daily log
    let content = await readDailyLog(today, vault.path);
    if (!content) {
      content = createDailyLogContent(today);
    }

    // Count existing sessions and add new one
    const sessionNumber = countSessions(content) + 1;
    const sessionSection = formatSessionSection(session, sessionNumber);

    // Update content
    content = updateSessionsCount(content, sessionNumber);
    content += sessionSection;

    // Write back
    const logPath = getDailyLogPath(today, vault.path);
    await writeFile(logPath, content, 'utf-8');

    logger.info(`Started session ${sessionNumber}: ${topic}`);

    return {
      success: true,
      data: {
        ...getVaultResultInfo(vault),
        sessionId: session.id,
        sessionNumber,
        topic,
        context,
        date: today,
        logPath: `daily/${today}.md`,
        message: `Started session ${sessionNumber}: "${topic}"`,
      },
    };
  } catch (error) {
    currentSession = null;
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      code: 'SESSION_ERROR',
    };
  }
}

// ============================================================================
// palace_session_log
// ============================================================================

const logInputSchema = z.object({
  entry: z.string().min(1, 'Entry is required'),
  notes_created: z.array(z.string()).optional().default([]),
});

export const sessionLogTool: Tool = {
  name: 'palace_session_log',
  description: `Add an entry to the current session log. Use this to track what you've learned, discovered, or created during the session.`,
  inputSchema: {
    type: 'object',
    properties: {
      entry: {
        type: 'string',
        description: 'What happened or was learned',
      },
      notes_created: {
        type: 'array',
        items: { type: 'string' },
        description: 'Paths of notes created during this entry',
      },
    },
    required: ['entry'],
  },
};

export async function sessionLogHandler(args: Record<string, unknown>): Promise<ToolResult> {
  const parseResult = logInputSchema.safeParse(args);
  if (!parseResult.success) {
    return {
      success: false,
      error: parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      code: 'VALIDATION_ERROR',
    };
  }

  const { entry, notes_created } = parseResult.data;

  // Check if we have an active session
  if (!currentSession) {
    return {
      success: false,
      error: 'No active session. Use palace_session_start first.',
      code: 'NO_SESSION',
    };
  }

  try {
    const vault = currentSession.vault;
    const now = new Date().toISOString();
    const time = now.split('T')[1]!.slice(0, 5);

    // Create the entry
    const sessionEntry: SessionEntry = {
      timestamp: now,
      entry,
    };
    if (notes_created.length > 0) {
      sessionEntry.notesCreated = notes_created;
    }

    // Add to current session
    currentSession.entries.push(sessionEntry);

    // Read daily log
    const today = currentSession.date;
    let content = await readDailyLog(today, vault.path);

    if (!content) {
      return {
        success: false,
        error: 'Daily log file not found',
        code: 'FILE_NOT_FOUND',
      };
    }

    // Find the current session's Log section and append the entry
    const logEntry = `- ${time} - ${entry}`;

    // Find the last "### Log" section and append after it
    const logSectionRegex = /### Log\n((?:- .+\n)*)/g;
    let lastMatch: RegExpExecArray | null = null;
    let match: RegExpExecArray | null;

    while ((match = logSectionRegex.exec(content)) !== null) {
      lastMatch = match;
    }

    if (lastMatch) {
      // Insert new entry after existing log entries
      const insertPos = lastMatch.index + lastMatch[0].length;
      content = content.slice(0, insertPos) + logEntry + '\n' + content.slice(insertPos);
    }

    // If notes were created, update the Notes Created section
    if (notes_created.length > 0) {
      const notesSection = content.match(/### Notes Created\n((?:- .+\n)*)/);

      if (notesSection) {
        // Append to existing Notes Created section
        const insertPos = notesSection.index! + notesSection[0].length;
        const newNotes = notes_created.map((n) => `- [[${n.replace(/\.md$/, '')}]]`).join('\n');
        content = content.slice(0, insertPos) + newNotes + '\n' + content.slice(insertPos);
      } else {
        // Add Notes Created section at end
        const newNotes = notes_created.map((n) => `- [[${n.replace(/\.md$/, '')}]]`).join('\n');
        content += `\n### Notes Created\n${newNotes}\n`;
      }
    }

    // Write back
    const logPath = getDailyLogPath(today, vault.path);
    await writeFile(logPath, content, 'utf-8');

    logger.debug(`Added session log entry: ${entry}`);

    return {
      success: true,
      data: {
        ...getVaultResultInfo(vault),
        sessionId: currentSession.id,
        entryNumber: currentSession.entries.length,
        timestamp: time,
        entry,
        notesCreated: notes_created,
        message: `Logged: "${entry}"`,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      code: 'LOG_ERROR',
    };
  }
}

// ============================================================================
// palace_session_end
// ============================================================================

const endInputSchema = z.object({
  project: z.string().optional().describe('Project name for time entry'),
  client: z.string().optional().describe('Client name for time entry'),
  category: z.string().optional().describe('Time category (development, research, meetings, etc.)'),
  billable: z.boolean().optional().default(true).describe('Whether time is billable'),
});

export const sessionEndTool: Tool = {
  name: 'palace_session_end',
  description: `End the current session, calculate duration, and optionally create a time entry. Use this to close a work session started with palace_session_start.`,
  inputSchema: {
    type: 'object',
    properties: {
      project: {
        type: 'string',
        description: 'If set, creates a time entry for this session under the given project',
      },
      client: {
        type: 'string',
        description: 'Client name for the time entry',
      },
      category: {
        type: 'string',
        description: 'Time category',
        enum: [...TIME_CATEGORIES],
      },
      billable: {
        type: 'boolean',
        description: 'Whether this time is billable (default: true)',
      },
    },
  },
};

export async function sessionEndHandler(args: Record<string, unknown>): Promise<ToolResult> {
  const parseResult = endInputSchema.safeParse(args);
  if (!parseResult.success) {
    return {
      success: false,
      error: parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      code: 'VALIDATION_ERROR',
    };
  }

  if (!currentSession) {
    return {
      success: false,
      error: 'No active session. Use palace_session_start first.',
      code: 'NO_SESSION',
    };
  }

  const { project, client, category, billable } = parseResult.data;

  try {
    const vault = currentSession.vault;
    const now = new Date();
    const endTime = now.toISOString();
    const endTimeStr = endTime.split('T')[1]!.slice(0, 5);

    // Calculate duration in minutes
    const startMs = Date.parse(currentSession.startedAt);
    const durationMinutes = Math.round((now.getTime() - startMs) / 60000);

    // Read daily log and insert end time + duration
    const today = currentSession.date;
    let content = await readDailyLog(today, vault.path);

    if (content) {
      // Find the last session section and add ended/duration info
      // Look for the session's "**Started**" line and insert after it
      const sessionRegex = /(\*\*Started\*\*: \d{2}:\d{2}\n)/g;
      let lastStartMatch: RegExpExecArray | null = null;
      let match: RegExpExecArray | null;
      while ((match = sessionRegex.exec(content)) !== null) {
        lastStartMatch = match;
      }

      if (lastStartMatch) {
        const insertPos = lastStartMatch.index + lastStartMatch[0].length;
        const endInfo = `**Ended**: ${endTimeStr}\n**Duration**: ${formatDuration(durationMinutes)}\n`;
        content = content.slice(0, insertPos) + endInfo + content.slice(insertPos);
      }

      const logPath = getDailyLogPath(today, vault.path);
      await writeFile(logPath, content, 'utf-8');
    }

    // Create time entry if project is specified
    let timeEntryPath: string | undefined;
    if (project) {
      const manager = getIndexManager();
      const db = await manager.getIndex(vault.alias);

      const sessionSummary = currentSession.entries.map((e) => e.entry).join('; ');
      const description = sessionSummary || `Session: ${currentSession.topic}`;

      const entryData: TimeEntryData = {
        project,
        duration_minutes: durationMinutes,
        description,
        date: today,
        billable,
        session_id: currentSession.id,
        source: 'session',
        start_time: currentSession.startedAt,
        end_time: endTime,
      };
      if (client) entryData.client = client;
      if (category) entryData.category = category as typeof TIME_CATEGORIES[number];

      const result = await createTimeEntry(
        entryData,
        vault.path,
        db,
        vault.config.ignore
      );

      timeEntryPath = result.path;
    }

    logger.info(`Ended session: ${currentSession.topic} (${formatDuration(durationMinutes)})`);

    const result = {
      ...getVaultResultInfo(vault),
      sessionId: currentSession.id,
      topic: currentSession.topic,
      duration_minutes: durationMinutes,
      duration_formatted: formatDuration(durationMinutes),
      entries_count: currentSession.entries.length,
      time_entry_path: timeEntryPath,
      message: `Session ended: "${currentSession.topic}" (${formatDuration(durationMinutes)})`,
    };

    // Clear the session
    currentSession = null;

    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      code: 'SESSION_END_ERROR',
    };
  }
}

/**
 * Get the current session (for testing or internal use)
 */
export function getCurrentSession(): Session | null {
  return currentSession;
}

/**
 * Clear the current session (for testing)
 */
export function clearSession(): void {
  currentSession = null;
}
