/**
 * palace_autolink - Automatically insert wiki-links in notes
 *
 * Phase 024: Added link_mode, stop_words, and domain_scope options
 */

import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolResult, LinkMode, DomainScope } from '../types/index.js';
import { readNote, listNotes } from '../services/vault/index.js';
import { updateNote } from '../services/vault/writer.js';
import { indexNote, getIndexManager } from '../services/index/index.js';
import {
  buildCompleteIndex,
  buildLinkableIndex,
  scanForMatches,
  autolinkContent,
  filterByLinkMode,
  filterByStopWords,
  filterByDomainScope,
  filterByLinkDensity,
  analyzeLinkDensity,
  DEFAULT_MIN_TITLE_LENGTH,
  DEFAULT_STOP_WORDS,
  type AliasConflict,
  type LinkDensityWarning,
} from '../services/autolink/index.js';
import { logger } from '../utils/logger.js';
import {
  resolveVaultParam,
  enforceWriteAccess,
  getVaultResultInfo,
} from '../utils/vault-param.js';

// Input schema (Phase 024: Added link_mode, stop_words, domain_scope, density controls)
const inputSchema = z.object({
  path: z.string().optional(),
  dry_run: z.boolean().optional().default(true),
  min_title_length: z.number().min(1).max(50).optional(),
  exclude_paths: z.array(z.string()).optional().default([]),
  include_aliases: z.boolean().optional().default(true),
  // Phase 024: New autolink options
  link_mode: z.enum(['all', 'first_per_section', 'first_per_note']).optional(),
  stop_words: z.array(z.string()).optional(),
  domain_scope: z.union([
    z.literal('any'),
    z.literal('same_domain'),
    z.array(z.string()),
  ]).optional(),
  // Phase 024: Link density controls
  max_links_per_paragraph: z.number().min(1).optional(),
  min_word_distance: z.number().min(1).optional(),
  // Phase 024: Link density warnings
  warn_density: z.boolean().optional().default(false),
  vault: z.string().optional().describe('Vault alias or path. Defaults to the default vault.'),
});

// Result type for each processed note
interface ProcessedNote {
  path: string;
  linksAdded: number;
  links: Array<{ text: string; target: string }>;
}

// Tool definition (Phase 024: Added new options)
export const autolinkTool: Tool = {
  name: 'palace_autolink',
  description:
    'Automatically insert wiki-links in notes by finding mentions of existing note titles. Supports first-occurrence-only linking, stop words, and domain scoping.',
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
        description: 'Minimum title length to match (uses vault config default)',
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
      link_mode: {
        type: 'string',
        enum: ['all', 'first_per_section', 'first_per_note'],
        description: 'Linking mode: all (link every occurrence), first_per_section (default), or first_per_note',
      },
      stop_words: {
        type: 'array',
        items: { type: 'string' },
        description: 'Terms to never link (merged with defaults and vault config)',
      },
      domain_scope: {
        oneOf: [
          { type: 'string', enum: ['any', 'same_domain'] },
          { type: 'array', items: { type: 'string' } },
        ],
        description: 'Domain scoping: any (default), same_domain (only same folder), or array of allowed domains',
      },
      max_links_per_paragraph: {
        type: 'number',
        description: 'Maximum links per paragraph (prevents link-heavy paragraphs)',
      },
      min_word_distance: {
        type: 'number',
        description: 'Minimum words between links (spaces out links for readability)',
      },
      warn_density: {
        type: 'boolean',
        description: 'Generate warnings when link density is high (default: false)',
      },
      vault: {
        type: 'string',
        description: 'Vault alias or path to process (defaults to default vault)',
      },
    },
    required: [],
  },
};

// Tool handler (Phase 024: Integrated new filtering options)
export async function autolinkHandler(args: Record<string, unknown>): Promise<ToolResult> {
  // Validate input
  const parseResult = inputSchema.safeParse(args);
  if (!parseResult.success) {
    return {
      success: false,
      error: parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      code: 'VALIDATION_ERROR',
    };
  }

  const {
    path,
    dry_run,
    min_title_length: minTitleLengthParam,
    exclude_paths,
    include_aliases,
    link_mode: linkModeParam,
    stop_words: stopWordsParam,
    domain_scope: domainScopeParam,
    max_links_per_paragraph: maxLinksParam,
    min_word_distance: minDistanceParam,
    warn_density: warnDensity,
    vault: vaultParam,
  } = parseResult.data;

  try {
    // Resolve and validate vault (enforce write access if not dry run)
    const vault = resolveVaultParam(vaultParam);
    if (!dry_run) {
      enforceWriteAccess(vault);
    }

    // Get effective autolink configuration (merge param overrides with vault config)
    const vaultAutolink = vault.config.autolink;
    const linkMode: LinkMode = linkModeParam ?? vaultAutolink.link_mode;
    const domainScope: DomainScope = domainScopeParam ?? vaultAutolink.domain_scope;
    const minTitleLength = minTitleLengthParam ?? vaultAutolink.min_title_length ?? DEFAULT_MIN_TITLE_LENGTH;

    // Build effective stop word list
    let effectiveStopWords: string[];
    if (vaultAutolink.stop_words_override) {
      // Vault config override replaces defaults entirely
      effectiveStopWords = [...vaultAutolink.stop_words_override];
    } else {
      // Merge defaults with vault config additions
      effectiveStopWords = [...DEFAULT_STOP_WORDS];
      if (vaultAutolink.stop_words) {
        effectiveStopWords.push(...vaultAutolink.stop_words);
      }
    }
    // Add per-call stop words
    if (stopWordsParam) {
      effectiveStopWords.push(...stopWordsParam);
    }

    // Get effective link density options
    const maxLinksPerParagraph = maxLinksParam ?? vaultAutolink.max_links_per_paragraph;
    const minWordDistance = minDistanceParam ?? vaultAutolink.min_word_distance;

    const readOptions = {
      vaultPath: vault.path,
      ignoreConfig: vault.config.ignore,
    };

    // Get the database for this vault
    const manager = getIndexManager();
    const db = await manager.getIndex(vault.alias);

    // Build the linkable index
    logger.info(
      `Building linkable index (min_title_length: ${minTitleLength}, include_aliases: ${include_aliases}, link_mode: ${linkMode})`
    );

    let index;
    let conflicts: AliasConflict[] = [];

    if (include_aliases) {
      const result = await buildCompleteIndex(db, minTitleLength);
      index = result.index;
      conflicts = result.conflicts;
    } else {
      index = buildLinkableIndex(db, minTitleLength);
    }

    logger.info(`Index built with ${index.size} linkable terms`);

    // Get notes to process
    let notePaths: string[] = [];

    if (path) {
      // Check if it's a single note or directory
      const note = await readNote(path, readOptions);
      if (note) {
        notePaths = [path];
      } else {
        // Try as directory
        const entries = await listNotes(path, false, readOptions);
        notePaths = entries.map((e) => e.path);
      }
    } else {
      // Process entire vault
      const entries = await listNotes('', true, readOptions);
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
    let totalMatchesFound = 0;
    let totalFiltered = 0;
    const densityWarnings: Array<{ path: string; warnings: LinkDensityWarning[] }> = [];

    for (const notePath of notePaths) {
      const note = await readNote(notePath, readOptions);
      if (!note) continue;

      // Scan for matches
      let matches = scanForMatches(note.content, index, notePath);
      if (matches.length === 0) continue;

      totalMatchesFound += matches.length;

      // Phase 024: Apply filters
      // 1. Filter by stop words
      matches = filterByStopWords(matches, effectiveStopWords);

      // 2. Filter by domain scope
      matches = filterByDomainScope(matches, notePath, domainScope);

      // 3. Filter by link mode (first_per_section, first_per_note, or all)
      matches = filterByLinkMode(matches, linkMode, note.content);

      // 4. Filter by link density (max per paragraph, min word distance)
      if (maxLinksPerParagraph || minWordDistance) {
        matches = filterByLinkDensity(matches, note.content, {
          maxLinksPerParagraph,
          minWordDistance,
        });
      }

      totalFiltered += totalMatchesFound - matches.length;

      if (matches.length === 0) continue;

      // Phase 024: Analyze link density and generate warnings if requested
      if (warnDensity) {
        const warnings = analyzeLinkDensity(note.content, matches, {
          maxLinksPerParagraph: maxLinksPerParagraph ?? 5,
          minAverageWordDistance: minWordDistance ?? 10,
        });
        if (warnings.length > 0) {
          densityWarnings.push({ path: notePath, warnings });
        }
      }

      // Auto-link content with filtered matches
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
          const updatedNote = await updateNote(notePath, result.linkedContent, {}, readOptions);
          indexNote(db, updatedNote);
          logger.info(`Updated ${notePath} with ${result.linksAdded.length} links`);
        }
      }
    }

    return {
      success: true,
      data: {
        ...getVaultResultInfo(vault),
        dry_run,
        notes_processed: notePaths.length,
        notes_modified: processed.length,
        total_links_added: totalLinksAdded,
        total_matches_found: totalMatchesFound,
        total_filtered: totalFiltered,
        index_size: index.size,
        // Phase 024: Include effective configuration
        config: {
          link_mode: linkMode,
          domain_scope: domainScope,
          stop_words_count: effectiveStopWords.length,
          min_title_length: minTitleLength,
          max_links_per_paragraph: maxLinksPerParagraph,
          min_word_distance: minWordDistance,
        },
        alias_conflicts: conflicts.length > 0 ? conflicts : undefined,
        density_warnings: densityWarnings.length > 0 ? densityWarnings : undefined,
        changes: processed,
        message: dry_run
          ? `Preview: Would add ${totalLinksAdded} links across ${processed.length} notes (filtered ${totalFiltered} from ${totalMatchesFound} potential matches)${densityWarnings.length > 0 ? ` [${densityWarnings.length} notes have density warnings]` : ''}`
          : `Added ${totalLinksAdded} links across ${processed.length} notes (filtered ${totalFiltered} from ${totalMatchesFound} potential matches)${densityWarnings.length > 0 ? ` [${densityWarnings.length} notes have density warnings]` : ''}`,
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
