/**
 * Autolink scanner - finds linkable terms in content
 */

import Database from 'better-sqlite3';
import { logger } from '../../utils/logger.js';

// Minimum title length to consider for auto-linking (avoid common short words)
export const DEFAULT_MIN_TITLE_LENGTH = 3;

// Common words to exclude from auto-linking even if they match note titles
const COMMON_WORD_BLOCKLIST = new Set([
  'the', 'and', 'but', 'for', 'not', 'you', 'all', 'can', 'had', 'her',
  'was', 'one', 'our', 'out', 'are', 'has', 'his', 'how', 'its', 'may',
  'new', 'now', 'old', 'see', 'way', 'who', 'did', 'get', 'let', 'put',
  'say', 'she', 'too', 'use', 'set', 'run', 'add', 'end', 'own', 'day',
  // Hub filenames should never be linked as titles
  '_index', 'index', 'readme', 'overview',
]);

/**
 * Linkable title from the vault
 */
export interface LinkableTitle {
  title: string;        // Canonical note title
  path: string;         // Note path
  aliases: string[];    // Alternative names
}

/**
 * Match found in content
 */
export interface AutolinkMatch {
  start: number;        // Match start position
  end: number;          // Match end position
  matchedText: string;  // Original text that matched
  target: string;       // Note title to link to
  path: string;         // Note path
}

/**
 * Build lookup index from all notes in the database
 */
export function buildTitleIndex(db: Database.Database): Map<string, LinkableTitle> {
  const index = new Map<string, LinkableTitle>();

  // Get all notes with their titles and paths
  const notes = db.prepare(`
    SELECT path, title FROM notes WHERE title IS NOT NULL
  `).all() as { path: string; title: string }[];

  for (const note of notes) {
    const titleLower = note.title.toLowerCase();

    // Skip titles that are too short or in blocklist
    if (note.title.length >= DEFAULT_MIN_TITLE_LENGTH && !COMMON_WORD_BLOCKLIST.has(titleLower)) {
      index.set(titleLower, {
        title: note.title,
        path: note.path,
        aliases: [], // Will be populated by aliases service
      });
    }
  }

  logger.debug(`Built title index with ${index.size} entries`);
  return index;
}

/**
 * Build combined index including aliases
 */
export function buildLinkableIndex(
  db: Database.Database,
  minTitleLength: number = DEFAULT_MIN_TITLE_LENGTH
): Map<string, LinkableTitle> {
  const index = new Map<string, LinkableTitle>();

  // Get all notes with their titles
  const notes = db.prepare(`
    SELECT path, title FROM notes WHERE title IS NOT NULL
  `).all() as { path: string; title: string }[];

  // Build base index from titles
  const titleToLinkable = new Map<string, LinkableTitle>();

  for (const note of notes) {
    if (note.title.length < minTitleLength) continue;
    if (COMMON_WORD_BLOCKLIST.has(note.title.toLowerCase())) continue;

    const linkable: LinkableTitle = {
      title: note.title,
      path: note.path,
      aliases: [],
    };

    titleToLinkable.set(note.path, linkable);
    index.set(note.title.toLowerCase(), linkable);
  }

  // Note: Aliases are loaded separately via aliases.ts service
  // They will be merged into this index when needed

  logger.debug(`Built linkable index with ${index.size} entries`);
  return index;
}

/**
 * Scan content for linkable terms
 * Returns matches sorted by position (for later reverse-order insertion)
 */
export function scanForMatches(
  content: string,
  index: Map<string, LinkableTitle>,
  selfPath?: string, // Path of the note being scanned (to avoid self-linking)
): AutolinkMatch[] {
  const matches: AutolinkMatch[] = [];

  // Sort titles by length (longest first) to match longer phrases first
  const sortedTitles = Array.from(index.entries())
    .sort((a, b) => b[0].length - a[0].length);

  // Create a set of ranges already matched (to avoid overlapping)
  const matchedRanges: Array<{ start: number; end: number }> = [];

  for (const [titleLower, linkable] of sortedTitles) {
    // Skip self-linking
    if (selfPath && linkable.path === selfPath) continue;

    // Find all occurrences of this title (case-insensitive, word boundaries)
    const regex = createWordBoundaryRegex(titleLower);
    let match;

    while ((match = regex.exec(content)) !== null) {
      const start = match.index;
      const end = start + match[0].length;

      // Check for overlapping matches
      const overlaps = matchedRanges.some(
        range => (start >= range.start && start < range.end) ||
                 (end > range.start && end <= range.end) ||
                 (start <= range.start && end >= range.end)
      );

      if (!overlaps) {
        matches.push({
          start,
          end,
          matchedText: match[0],
          target: linkable.title,
          path: linkable.path,
        });
        matchedRanges.push({ start, end });
      }
    }
  }

  // Sort by position (ascending) for easier processing
  matches.sort((a, b) => a.start - b.start);

  return matches;
}

/**
 * Create regex for word boundary matching (case-insensitive)
 */
function createWordBoundaryRegex(term: string): RegExp {
  // Escape regex special characters
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Match at word boundaries
  return new RegExp(`\\b${escaped}\\b`, 'gi');
}
