/**
 * Retroactive Linking Service
 *
 * When a new note is created or a stub is expanded, this service finds
 * existing notes that should link to it and updates them.
 */

import { join } from 'path';
import { readFile, writeFile } from 'fs/promises';
import type Database from 'better-sqlite3';
import type { ResolvedVault } from '../../types/index.js';
import { parseFrontmatter, stringifyFrontmatter } from '../../utils/frontmatter.js';
import { logger } from '../../utils/logger.js';

interface RetroactiveMatch {
  path: string;
  title: string;
  mentionCount: number;
  positions: Array<{ line: number; column: number; text: string }>;
}

interface RetroactiveLinkResult {
  notesUpdated: string[];
  linksAdded: number;
  errors: Array<{ path: string; error: string }>;
}

interface RetroactiveLinkPreview {
  targetTitle: string;
  targetPath: string;
  matches: RetroactiveMatch[];
  totalNotesToUpdate: number;
  totalMentions: number;
  wouldUpdate: Array<{
    path: string;
    title: string;
    mentionCount: number;
    previewSnippets: string[];
  }>;
}

/**
 * Find notes that mention a term but don't link to it
 */
export function findUnlinkedMentions(
  db: Database.Database,
  targetTitle: string,
  targetPath: string,
  aliases: string[] = []
): RetroactiveMatch[] {
  const searchTerms = [targetTitle, ...aliases].filter(Boolean);
  const matches: RetroactiveMatch[] = [];

  // Get all notes except the target itself
  const notes = db
    .prepare(
      `
      SELECT path, title, content
      FROM notes
      WHERE path != ?
    `
    )
    .all(targetPath) as Array<{ path: string; title: string; content: string | null }>;

  for (const note of notes) {
    if (!note.content) continue;

    const noteMatches = findMentionsInContent(note.content, searchTerms, targetPath);
    if (noteMatches.length > 0) {
      matches.push({
        path: note.path,
        title: note.title,
        mentionCount: noteMatches.length,
        positions: noteMatches,
      });
    }
  }

  return matches;
}

/**
 * Check if position is inside a markdown link [text](url)
 */
function isInsideMarkdownLink(line: string, position: number): boolean {
  // Match [text](url) patterns
  const mdLinkRegex = /\[([^\]]*)\]\([^)]*\)/g;
  let match: RegExpExecArray | null;
  while ((match = mdLinkRegex.exec(line)) !== null) {
    if (position >= match.index && position < match.index + match[0].length) {
      return true;
    }
  }
  return false;
}

/**
 * Check if position is inside a bare URL (https://...)
 */
function isInsideBareUrl(line: string, position: number): boolean {
  const urlRegex = /https?:\/\/[^\s)>\]]+/g;
  let match: RegExpExecArray | null;
  while ((match = urlRegex.exec(line)) !== null) {
    if (position >= match.index && position < match.index + match[0].length) {
      return true;
    }
  }
  return false;
}

/**
 * Find mentions of search terms in content that aren't already linked
 */
function findMentionsInContent(
  content: string,
  searchTerms: string[],
  targetPath: string
): Array<{ line: number; column: number; text: string }> {
  const matches: Array<{ line: number; column: number; text: string }> = [];
  const lines = content.split('\n');

  // Build regex for existing links to the target
  const targetName = targetPath.replace(/\.md$/, '').split('/').pop() || '';
  const linkPatterns = [
    new RegExp(`\\[\\[${escapeRegex(targetPath)}(\\|[^\\]]*)?\\]\\]`, 'gi'),
    new RegExp(`\\[\\[${escapeRegex(targetName)}(\\|[^\\]]*)?\\]\\]`, 'gi'),
  ];

  // Track code block state
  let inCodeBlock = false;

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum] || '';

    // Skip frontmatter
    if (lineNum === 0 && line === '---') {
      // Find end of frontmatter
      let endIdx = lineNum + 1;
      while (endIdx < lines.length && lines[endIdx] !== '---') {
        endIdx++;
      }
      lineNum = endIdx;
      continue;
    }

    // Track code block boundaries
    if (line.startsWith('```') || line.startsWith('~~~')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }

    // Skip lines inside code blocks
    if (inCodeBlock) continue;

    // Skip heading lines — identity text should not be modified
    if (/^#{1,6}\s+/.test(line)) continue;

    // Check if this line already has a link to the target
    const hasExistingLink = linkPatterns.some((pattern) => pattern.test(line));
    if (hasExistingLink) continue;

    // Search for each term
    for (const term of searchTerms) {
      const termRegex = new RegExp(`\\b${escapeRegex(term)}\\b`, 'gi');
      let match: RegExpExecArray | null;

      while ((match = termRegex.exec(line)) !== null) {
        // Check if this match is inside a link already
        if (isInsideLink(line, match.index)) continue;

        // Check if inside inline code
        if (isInsideInlineCode(line, match.index)) continue;

        // Check if inside a markdown link [text](url)
        if (isInsideMarkdownLink(line, match.index)) continue;

        // Check if inside a bare URL
        if (isInsideBareUrl(line, match.index)) continue;

        matches.push({
          line: lineNum + 1,
          column: match.index + 1,
          text: match[0],
        });
      }
    }
  }

  return matches;
}

/**
 * Check if position is inside a wiki-link
 */
function isInsideLink(line: string, position: number): boolean {
  const before = line.substring(0, position);
  const after = line.substring(position);

  // Count [[ before position and ]] after
  const openCount = (before.match(/\[\[/g) || []).length;
  const closeCountBefore = (before.match(/\]\]/g) || []).length;
  const closeCountAfter = (after.match(/\]\]/g) || []).length;

  // Inside a link if there's an unclosed [[ before us and a ]] after
  return openCount > closeCountBefore && closeCountAfter > 0;
}

/**
 * Check if position is inside inline code
 */
function isInsideInlineCode(line: string, position: number): boolean {
  let inCode = false;
  for (let i = 0; i < position; i++) {
    if (line[i] === '`') inCode = !inCode;
  }
  return inCode;
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Add wiki-links to notes that mention a target
 */
export async function addRetroactiveLinks(
  targetTitle: string,
  targetPath: string,
  matches: RetroactiveMatch[],
  vault: ResolvedVault,
  options: { dryRun?: boolean; maxNotes?: number } = {}
): Promise<RetroactiveLinkResult> {
  const { dryRun = false, maxNotes = 10 } = options;
  const result: RetroactiveLinkResult = {
    notesUpdated: [],
    linksAdded: 0,
    errors: [],
  };

  const notesToUpdate = matches.slice(0, maxNotes);

  for (const match of notesToUpdate) {
    try {
      const fullPath = join(vault.path, match.path);
      const fileContent = await readFile(fullPath, 'utf-8');
      const { frontmatter, body } = parseFrontmatter(fileContent);
      const fm = frontmatter as Record<string, unknown>;

      // Replace mentions with links
      const targetName = targetPath.replace(/\.md$/, '').split('/').pop() || targetTitle;
      let updatedBody = body;
      let linksAdded = 0;

      // Process each position (in reverse order to maintain positions)
      const sortedPositions = [...match.positions].sort((a, b) => {
        if (a.line !== b.line) return b.line - a.line;
        return b.column - a.column;
      });

      const lines = updatedBody.split('\n');

      for (const pos of sortedPositions) {
        const lineIdx = pos.line - 1;
        if (lineIdx < 0 || lineIdx >= lines.length) continue;

        const line = lines[lineIdx] || '';
        const colIdx = pos.column - 1;
        const term = pos.text;

        // Build the replacement link
        // Use display text if the case differs from the target title
        const link =
          term.toLowerCase() === targetTitle.toLowerCase() && term !== targetTitle
            ? `[[${targetName}|${term}]]`
            : `[[${targetName}]]`;

        // Replace the term with the link
        lines[lineIdx] =
          line.substring(0, colIdx) + link + line.substring(colIdx + term.length);
        linksAdded++;
      }

      updatedBody = lines.join('\n');

      if (linksAdded > 0 && !dryRun) {
        // Update the related field in frontmatter
        const related = (fm.related as string[]) || [];
        const linkTarget = `[[${targetName}]]`;
        if (!related.includes(linkTarget)) {
          related.push(linkTarget);
          fm.related = related;
        }

        // Update modified timestamp
        fm.modified = new Date().toISOString();

        // Write updated file
        const newContent = stringifyFrontmatter(fm, updatedBody);

        await writeFile(fullPath, newContent, 'utf-8');
        logger.debug(`Added ${linksAdded} retroactive links to ${match.path}`);
      }

      result.notesUpdated.push(match.path);
      result.linksAdded += linksAdded;
    } catch (error) {
      result.errors.push({
        path: match.path,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}

/**
 * Update notes that created a stub when the stub is expanded
 */
export async function updateStubCreators(
  stubPath: string,
  stubTitle: string,
  mentionedIn: string[],
  vault: ResolvedVault,
  options: { dryRun?: boolean } = {}
): Promise<RetroactiveLinkResult> {
  const result: RetroactiveLinkResult = {
    notesUpdated: [],
    linksAdded: 0,
    errors: [],
  };

  const { dryRun = false } = options;

  for (const notePath of mentionedIn) {
    try {
      const fullPath = join(vault.path, notePath);
      const fileContent = await readFile(fullPath, 'utf-8');
      const { frontmatter, body } = parseFrontmatter(fileContent);
      const fm = frontmatter as Record<string, unknown>;

      // Check if the note mentions "stub" for this technology
      const stubNote = `Stub Note`;
      if (body.includes(stubNote) && body.includes(stubTitle)) {
        // The note references the stub - could update a reference here
        // For now, just update the related field
      }

      // Update related field to use the now-expanded note
      const related = (fm.related as string[]) || [];
      const stubLink = `[[${stubPath.replace(/\.md$/, '')}]]`;
      const stubTitleLink = `[[${stubTitle}]]`;

      let updated = false;
      if (!related.includes(stubLink) && !related.includes(stubTitleLink)) {
        related.push(stubLink);
        fm.related = related;
        updated = true;
      }

      if (updated && !dryRun) {
        fm.modified = new Date().toISOString();
        const newContent = stringifyFrontmatter(fm, body);

        await writeFile(fullPath, newContent, 'utf-8');
        logger.debug(`Updated stub creator: ${notePath}`);
        result.notesUpdated.push(notePath);
      }
    } catch (error) {
      result.errors.push({
        path: notePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}

/**
 * Get statistics about potential retroactive linking opportunities
 */
export function getRetroactiveLinkStats(
  db: Database.Database,
  targetTitle: string,
  targetPath: string,
  aliases: string[] = []
): { totalMentions: number; notesWithMentions: number } {
  const matches = findUnlinkedMentions(db, targetTitle, targetPath, aliases);
  const totalMentions = matches.reduce((sum, m) => sum + m.mentionCount, 0);
  return {
    totalMentions,
    notesWithMentions: matches.length,
  };
}

/**
 * Preview retroactive links without making changes
 *
 * Use this to get a detailed preview of what would be updated,
 * allowing the user or AI to confirm before applying changes.
 */
export async function previewRetroactiveLinks(
  db: Database.Database,
  targetTitle: string,
  targetPath: string,
  vault: ResolvedVault,
  options: { maxNotes?: number; aliases?: string[] } = {}
): Promise<RetroactiveLinkPreview> {
  const { maxNotes = 10, aliases = [] } = options;

  const matches = findUnlinkedMentions(db, targetTitle, targetPath, aliases);
  const notesToPreview = matches.slice(0, maxNotes);

  const wouldUpdate: RetroactiveLinkPreview['wouldUpdate'] = [];

  for (const match of notesToPreview) {
    // Generate preview snippets showing context around each mention
    const previewSnippets: string[] = [];
    const fullPath = join(vault.path, match.path);

    try {
      const fileContent = await readFile(fullPath, 'utf-8');
      const lines = fileContent.split('\n');

      for (const pos of match.positions.slice(0, 3)) {
        // Show up to 3 examples
        const lineIdx = pos.line - 1;
        if (lineIdx >= 0 && lineIdx < lines.length) {
          const line = lines[lineIdx] || '';
          // Truncate long lines
          const snippet = line.length > 100 ? `${line.substring(0, 100)}...` : line;
          previewSnippets.push(`Line ${pos.line}: ${snippet}`);
        }
      }

      if (match.positions.length > 3) {
        previewSnippets.push(`...and ${match.positions.length - 3} more mentions`);
      }
    } catch {
      previewSnippets.push('(unable to read file for preview)');
    }

    wouldUpdate.push({
      path: match.path,
      title: match.title,
      mentionCount: match.mentionCount,
      previewSnippets,
    });
  }

  const totalMentions = matches.reduce((sum, m) => sum + m.mentionCount, 0);

  return {
    targetTitle,
    targetPath,
    matches,
    totalNotesToUpdate: matches.length,
    totalMentions,
    wouldUpdate,
  };
}

/**
 * Apply retroactive links with batch confirmation support
 *
 * This is the main entry point for batch retroactive linking.
 * Call previewRetroactiveLinks first to show the user what will be updated,
 * then call this function with the same parameters to apply.
 */
export async function applyRetroactiveLinksWithConfirmation(
  db: Database.Database,
  targetTitle: string,
  targetPath: string,
  vault: ResolvedVault,
  options: {
    maxNotes?: number;
    aliases?: string[];
    confirmed?: boolean;
  } = {}
): Promise<{ preview?: RetroactiveLinkPreview; result?: RetroactiveLinkResult }> {
  const { maxNotes = 10, aliases = [], confirmed = false } = options;

  // First, find all matches
  const matches = findUnlinkedMentions(db, targetTitle, targetPath, aliases);

  if (matches.length === 0) {
    return { result: { notesUpdated: [], linksAdded: 0, errors: [] } };
  }

  // If not confirmed, return preview only
  if (!confirmed) {
    const preview = await previewRetroactiveLinks(
      db,
      targetTitle,
      targetPath,
      vault,
      { maxNotes, aliases }
    );
    return { preview };
  }

  // Confirmed - apply the changes
  const result = await addRetroactiveLinks(
    targetTitle,
    targetPath,
    matches.slice(0, maxNotes),
    vault,
    { dryRun: false }
  );

  return { result };
}
