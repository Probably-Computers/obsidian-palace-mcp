/**
 * Autolink scanner - finds linkable terms in content
 *
 * Phase 024: Added link mode filtering, stop words, and domain scoping
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
  '_index', 'index', 'readme',
]);

/**
 * Default stop words - generic terms that create visual clutter when linked
 * These are commonly used section headers or generic concepts
 */
export const DEFAULT_STOP_WORDS: string[] = [
  // Common section headers
  'overview',
  'introduction',
  'summary',
  'conclusion',
  'references',
  'related',
  'notes',
  'examples',
  'appendix',
  // Generic concepts
  'documentation',
  'configuration',
  'deployment',
  'development',
  'implementation',
  'architecture',
  'performance',
  'security',
  'testing',
  'installation',
  'setup',
  'usage',
  'requirements',
  'prerequisites',
  'troubleshooting',
  'faq',
];

/**
 * Link mode options for controlling how many times a term is linked
 */
export type LinkMode = 'all' | 'first_per_section' | 'first_per_note';

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

/**
 * Find section boundaries (H2 headers) in content
 * Returns array of character positions where new sections start
 */
function findSectionBoundaries(content: string): number[] {
  const boundaries: number[] = [0]; // Start of document is first section
  const regex = /^##\s+/gm;
  let match;

  while ((match = regex.exec(content)) !== null) {
    boundaries.push(match.index);
  }

  return boundaries;
}

/**
 * Get the section index for a given position in the content
 */
function getSectionIndex(position: number, boundaries: number[]): number {
  for (let i = boundaries.length - 1; i >= 0; i--) {
    if (position >= boundaries[i]!) {
      return i;
    }
  }
  return 0;
}

/**
 * Filter matches based on link mode
 *
 * @param matches - All found matches
 * @param mode - Link mode: 'all', 'first_per_section', or 'first_per_note'
 * @param content - Original content (needed for section detection)
 * @returns Filtered matches based on mode
 */
export function filterByLinkMode(
  matches: AutolinkMatch[],
  mode: LinkMode,
  content: string,
): AutolinkMatch[] {
  if (mode === 'all') {
    return matches;
  }

  // Sort by position to process in order
  const sortedMatches = [...matches].sort((a, b) => a.start - b.start);

  if (mode === 'first_per_note') {
    // Keep only the first occurrence of each target
    const seen = new Set<string>();
    return sortedMatches.filter((match) => {
      const key = match.target.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  if (mode === 'first_per_section') {
    // Keep only the first occurrence of each target per section
    const boundaries = findSectionBoundaries(content);
    const seenPerSection = new Map<number, Set<string>>();

    return sortedMatches.filter((match) => {
      const sectionIndex = getSectionIndex(match.start, boundaries);
      const key = match.target.toLowerCase();

      if (!seenPerSection.has(sectionIndex)) {
        seenPerSection.set(sectionIndex, new Set());
      }

      const seen = seenPerSection.get(sectionIndex)!;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  return matches;
}

/**
 * Parse a stop word entry - could be a plain string or a regex pattern
 * Regex patterns are enclosed in forward slashes: /pattern/flags
 *
 * @param entry - Stop word entry (string or /regex/flags)
 * @returns Object with type and matcher
 */
function parseStopWordEntry(entry: string): { type: 'string' | 'regex'; value: string; regex?: RegExp } {
  // Check if it's a regex pattern: /pattern/ or /pattern/flags
  const regexMatch = entry.match(/^\/(.+)\/([gimsuy]*)$/);
  if (regexMatch) {
    try {
      // Always add 'i' flag for case-insensitive matching unless already present
      const flags = regexMatch[2]!.includes('i') ? regexMatch[2]! : regexMatch[2]! + 'i';
      return {
        type: 'regex',
        value: entry,
        regex: new RegExp(regexMatch[1]!, flags),
      };
    } catch {
      // Invalid regex, treat as string
      logger.warn(`Invalid regex stop word pattern: ${entry}, treating as literal string`);
      return { type: 'string', value: entry.toLowerCase() };
    }
  }
  return { type: 'string', value: entry.toLowerCase() };
}

/**
 * Filter out matches that are in the stop word list
 * Supports both plain strings and regex patterns (enclosed in /pattern/flags)
 *
 * @param matches - All found matches
 * @param stopWords - Array of stop words (case-insensitive strings or /regex/flags patterns)
 * @returns Matches without stop word targets
 */
export function filterByStopWords(
  matches: AutolinkMatch[],
  stopWords: string[],
): AutolinkMatch[] {
  if (stopWords.length === 0) {
    return matches;
  }

  // Parse stop words into strings and regex patterns
  const parsedStopWords = stopWords.map(parseStopWordEntry);
  const stringStopWords = new Set(
    parsedStopWords.filter((p) => p.type === 'string').map((p) => p.value)
  );
  const regexStopWords = parsedStopWords
    .filter((p) => p.type === 'regex' && p.regex)
    .map((p) => p.regex!);

  return matches.filter((match) => {
    const targetLower = match.target.toLowerCase();

    // Check string stop words
    if (stringStopWords.has(targetLower)) {
      return false;
    }

    // Check regex stop words
    for (const regex of regexStopWords) {
      if (regex.test(match.target)) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Filter matches by domain scope
 *
 * @param matches - All found matches
 * @param sourcePath - Path of the note being linked
 * @param scope - 'any', 'same_domain', or array of allowed domains
 * @returns Filtered matches based on domain scope
 */
export function filterByDomainScope(
  matches: AutolinkMatch[],
  sourcePath: string,
  scope: 'any' | 'same_domain' | string[],
): AutolinkMatch[] {
  if (scope === 'any') {
    return matches;
  }

  // Extract domain from path (first directory component)
  const getTopDomain = (path: string): string => {
    const parts = path.split('/');
    return parts.length > 1 ? parts[0]!.toLowerCase() : '';
  };

  const sourceDomain = getTopDomain(sourcePath);

  if (scope === 'same_domain') {
    return matches.filter((match) => {
      const targetDomain = getTopDomain(match.path);
      // Allow if same domain or either has no domain (root level)
      return !sourceDomain || !targetDomain || sourceDomain === targetDomain;
    });
  }

  // Explicit domain list
  const allowedDomains = new Set(scope.map((d) => d.toLowerCase()));
  return matches.filter((match) => {
    const targetDomain = getTopDomain(match.path);
    return !targetDomain || allowedDomains.has(targetDomain);
  });
}

/**
 * Link density options for controlling how close links can be
 */
export interface LinkDensityOptions {
  maxLinksPerParagraph?: number | undefined;
  minWordDistance?: number | undefined;
}

/**
 * Find paragraph boundaries in content
 * Paragraphs are separated by blank lines
 */
function findParagraphBoundaries(content: string): Array<{ start: number; end: number }> {
  const paragraphs: Array<{ start: number; end: number }> = [];
  const regex = /(?:^|\n\n)([^\n]+(?:\n[^\n]+)*)/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    const start = match.index === 0 ? 0 : match.index + 2; // Skip the \n\n
    const end = start + match[1]!.length;
    paragraphs.push({ start, end });
  }

  // Handle edge case where content doesn't match the pattern
  if (paragraphs.length === 0 && content.length > 0) {
    paragraphs.push({ start: 0, end: content.length });
  }

  return paragraphs;
}

/**
 * Get paragraph index for a position
 */
function getParagraphIndex(
  position: number,
  paragraphs: Array<{ start: number; end: number }>,
): number {
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i]!;
    if (position >= p.start && position < p.end) {
      return i;
    }
  }
  return paragraphs.length - 1;
}

/**
 * Count words before a position in content
 */
function countWordsBefore(content: string, position: number): number {
  const textBefore = content.slice(0, position);
  const words = textBefore.split(/\s+/).filter((w) => w.length > 0);
  return words.length;
}

/**
 * Filter matches by link density constraints
 *
 * @param matches - All found matches (should already be sorted by position)
 * @param content - Original content
 * @param options - Density constraints
 * @returns Filtered matches respecting density limits
 */
export function filterByLinkDensity(
  matches: AutolinkMatch[],
  content: string,
  options: LinkDensityOptions,
): AutolinkMatch[] {
  const { maxLinksPerParagraph, minWordDistance } = options;

  if (!maxLinksPerParagraph && !minWordDistance) {
    return matches;
  }

  // Sort by position to process in order
  const sortedMatches = [...matches].sort((a, b) => a.start - b.start);
  const result: AutolinkMatch[] = [];

  // Track links per paragraph
  const paragraphs = maxLinksPerParagraph ? findParagraphBoundaries(content) : [];
  const linksPerParagraph = new Map<number, number>();

  // Track last link position for word distance
  let lastLinkPosition: number | null = null;

  for (const match of sortedMatches) {
    // Check paragraph limit
    if (maxLinksPerParagraph) {
      const paragraphIdx = getParagraphIndex(match.start, paragraphs);
      const currentCount = linksPerParagraph.get(paragraphIdx) ?? 0;
      if (currentCount >= maxLinksPerParagraph) {
        continue; // Skip this match - paragraph has enough links
      }
    }

    // Check word distance
    if (minWordDistance && lastLinkPosition !== null) {
      const wordsAtLast = countWordsBefore(content, lastLinkPosition);
      const wordsAtCurrent = countWordsBefore(content, match.start);
      const wordsBetween = wordsAtCurrent - wordsAtLast;

      if (wordsBetween < minWordDistance) {
        continue; // Skip this match - too close to last link
      }
    }

    // This match passes all filters
    result.push(match);

    // Update tracking
    if (maxLinksPerParagraph) {
      const paragraphIdx = getParagraphIndex(match.start, paragraphs);
      linksPerParagraph.set(paragraphIdx, (linksPerParagraph.get(paragraphIdx) ?? 0) + 1);
    }
    lastLinkPosition = match.end;
  }

  return result;
}

/**
 * Link density warning result
 */
export interface LinkDensityWarning {
  type: 'high_density' | 'paragraph_overload' | 'clustered_links';
  message: string;
  details: {
    paragraph?: number;
    linkCount?: number;
    threshold?: number;
    averageDistance?: number;
  };
}

/**
 * Default thresholds for link density warnings
 */
const DENSITY_WARNING_THRESHOLDS = {
  maxLinksPerParagraph: 5,   // Warn if any paragraph has more than this
  minAverageWordDistance: 10, // Warn if average distance between links is less than this
  highDensityRatio: 0.1,     // Warn if more than 10% of words are links
};

/**
 * Analyze content for excessive link density and generate warnings
 *
 * @param content - Content to analyze
 * @param matches - Matches that would be applied (after all filters)
 * @param options - Optional custom thresholds
 * @returns Array of warnings (empty if density is acceptable)
 */
export function analyzeLinkDensity(
  content: string,
  matches: AutolinkMatch[],
  options?: {
    maxLinksPerParagraph?: number;
    minAverageWordDistance?: number;
    highDensityRatio?: number;
  },
): LinkDensityWarning[] {
  const warnings: LinkDensityWarning[] = [];

  if (matches.length === 0) {
    return warnings;
  }

  const thresholds = {
    ...DENSITY_WARNING_THRESHOLDS,
    ...options,
  };

  // Count total words in content
  const totalWords = content.split(/\s+/).filter((w) => w.length > 0).length;

  // Check overall density ratio
  const densityRatio = matches.length / totalWords;
  if (densityRatio > thresholds.highDensityRatio) {
    warnings.push({
      type: 'high_density',
      message: `High link density: ${matches.length} links in ${totalWords} words (${(densityRatio * 100).toFixed(1)}% of words would be linked)`,
      details: {
        linkCount: matches.length,
        threshold: thresholds.highDensityRatio,
      },
    });
  }

  // Check per-paragraph density
  const paragraphs = findParagraphBoundaries(content);
  const linksPerParagraph = new Map<number, number>();

  for (const match of matches) {
    const paragraphIdx = getParagraphIndex(match.start, paragraphs);
    linksPerParagraph.set(paragraphIdx, (linksPerParagraph.get(paragraphIdx) ?? 0) + 1);
  }

  for (const [paragraphIdx, count] of linksPerParagraph) {
    if (count > thresholds.maxLinksPerParagraph) {
      warnings.push({
        type: 'paragraph_overload',
        message: `Paragraph ${paragraphIdx + 1} has ${count} links (threshold: ${thresholds.maxLinksPerParagraph})`,
        details: {
          paragraph: paragraphIdx + 1,
          linkCount: count,
          threshold: thresholds.maxLinksPerParagraph,
        },
      });
    }
  }

  // Check for clustered links (average word distance)
  if (matches.length > 1) {
    const sortedMatches = [...matches].sort((a, b) => a.start - b.start);
    let totalDistance = 0;

    for (let i = 1; i < sortedMatches.length; i++) {
      const wordsAtPrev = countWordsBefore(content, sortedMatches[i - 1]!.end);
      const wordsAtCurrent = countWordsBefore(content, sortedMatches[i]!.start);
      totalDistance += wordsAtCurrent - wordsAtPrev;
    }

    const averageDistance = totalDistance / (sortedMatches.length - 1);
    if (averageDistance < thresholds.minAverageWordDistance) {
      warnings.push({
        type: 'clustered_links',
        message: `Links are clustered: average ${averageDistance.toFixed(1)} words between links (threshold: ${thresholds.minAverageWordDistance})`,
        details: {
          averageDistance: Math.round(averageDistance * 10) / 10,
          threshold: thresholds.minAverageWordDistance,
        },
      });
    }
  }

  return warnings;
}
