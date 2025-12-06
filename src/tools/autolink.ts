/**
 * palace_autolink - Automatically insert wiki-links in notes
 */

import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolResult } from '../types/index.js';
import { readNote, listNotes } from '../services/vault/index.js';
import { updateNote } from '../services/vault/writer.js';
import { indexNote } from '../services/index/index.js';
import {
  buildCompleteIndex,
  scanForMatches,
  autolinkContent,
  DEFAULT_MIN_TITLE_LENGTH,
  type AliasConflict,
} from '../services/autolink/index.js';
import { logger } from '../utils/logger.js';

// Input schema
const inputSchema = z.object({
  path: z.string().optional(),
  dry_run: z.boolean().optional().default(true),
  min_title_length: z.number().min(1).max(50).optional().default(DEFAULT_MIN_TITLE_LENGTH),
  exclude_paths: z.array(z.string()).optional().default([]),
  include_aliases: z.boolean().optional().default(true),
});

// Result type for each processed note
interface ProcessedNote {
  path: string;
  linksAdded: number;
  links: Array<{ text: string; target: string }>;
}

// Tool definition
export const autolinkTool: Tool = {
  name: 'palace_autolink',
  description:
    'Automatically insert wiki-links in notes by finding mentions of existing note titles. Can process a single note, a directory, or the entire vault.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Note path or directory to process (default: entire vault)',
      },
      dry_run: {
        type: 'boolean',
        description: 'Preview changes without modifying files (default: true)',
      },
      min_title_length: {
        type: 'number',
        description: `Minimum title length to match (default: ${DEFAULT_MIN_TITLE_LENGTH})`,
      },
      exclude_paths: {
        type: 'array',
        items: { type: 'string' },
        description: 'Paths to exclude from processing',
      },
      include_aliases: {
        type: 'boolean',
        description: 'Include note aliases in matching (default: true)',
      },
    },
    required: [],
  },
};

// Tool handler
export async function autolinkHandler(
  args: Record<string, unknown>
): Promise<ToolResult> {
  // Validate input
  const parseResult = inputSchema.safeParse(args);
  if (!parseResult.success) {
    return {
      success: false,
      error: parseResult.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; '),
      code: 'VALIDATION_ERROR',
    };
  }

  const { path, dry_run, min_title_length, exclude_paths, include_aliases } = parseResult.data;

  try {
    // Build the linkable index
    logger.info(`Building linkable index (min_title_length: ${min_title_length}, include_aliases: ${include_aliases})`);

    let index;
    let conflicts: AliasConflict[] = [];

    if (include_aliases) {
      const result = await buildCompleteIndex(min_title_length);
      index = result.index;
      conflicts = result.conflicts;
    } else {
      // Import buildLinkableIndex directly
      const { buildLinkableIndex } = await import('../services/autolink/scanner.js');
      index = buildLinkableIndex(min_title_length);
    }

    logger.info(`Index built with ${index.size} linkable terms`);

    // Get notes to process
    let notePaths: string[] = [];

    if (path) {
      // Check if it's a single note or directory
      const note = await readNote(path);
      if (note) {
        notePaths = [path];
      } else {
        // Try as directory
        const entries = await listNotes(path);
        notePaths = entries.map((e) => e.path);
      }
    } else {
      // Process entire vault
      const entries = await listNotes('');
      notePaths = entries.map((e) => e.path);
    }

    // Filter excluded paths
    if (exclude_paths.length > 0) {
      notePaths = notePaths.filter((p) => {
        return !exclude_paths.some((excl) => p.startsWith(excl) || p === excl);
      });
    }

    logger.info(`Processing ${notePaths.length} notes (dry_run: ${dry_run})`);

    // Process each note
    const processed: ProcessedNote[] = [];
    let totalLinksAdded = 0;

    for (const notePath of notePaths) {
      const note = await readNote(notePath);
      if (!note) continue;

      // Scan for matches
      const matches = scanForMatches(note.content, index, notePath);
      if (matches.length === 0) continue;

      // Auto-link content
      const result = autolinkContent(note.content, matches);

      if (result.linksAdded.length > 0) {
        const processedNote: ProcessedNote = {
          path: notePath,
          linksAdded: result.linksAdded.length,
          links: result.linksAdded.map((m) => ({
            text: m.matchedText,
            target: m.target,
          })),
        };

        processed.push(processedNote);
        totalLinksAdded += result.linksAdded.length;

        // Apply changes if not dry run
        if (!dry_run) {
          const updatedNote = await updateNote(notePath, result.linkedContent);
          indexNote(updatedNote);
          logger.info(`Updated ${notePath} with ${result.linksAdded.length} links`);
        }
      }
    }

    return {
      success: true,
      data: {
        dry_run,
        notes_processed: notePaths.length,
        notes_modified: processed.length,
        total_links_added: totalLinksAdded,
        index_size: index.size,
        alias_conflicts: conflicts.length > 0 ? conflicts : undefined,
        changes: processed,
        message: dry_run
          ? `Preview: Would add ${totalLinksAdded} links across ${processed.length} notes`
          : `Added ${totalLinksAdded} links across ${processed.length} notes`,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      code: 'AUTOLINK_ERROR',
    };
  }
}
