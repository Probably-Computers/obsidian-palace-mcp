/**
 * Vault inspection for migration issues (Phase 029)
 *
 * Detects:
 * - Unprefixed child notes (children without parent title prefix)
 * - Corrupted headings (wiki-links in H1 lines)
 * - Orphaned fragments (children without valid hub reference)
 * - Naming inconsistencies (duplicate filenames across directories)
 * - Broken wiki-links (malformed links like [[X]]es]] from retroactive linker)
 * - Code block links (wiki-links inside fenced code blocks)
 */

import { dirname, basename } from 'path';
import type Database from 'better-sqlite3';
import { isHubType } from '../../types/note-types.js';
import { stripWikiLinks } from '../../utils/markdown.js';

export type IssueType =
  | 'unprefixed_children'
  | 'corrupted_headings'
  | 'orphaned_fragments'
  | 'naming_inconsistencies'
  | 'broken_wiki_links'
  | 'code_block_links';

export interface InspectionIssue {
  path: string;
  type: IssueType;
  description: string;
  suggestion: string;
  details?: Record<string, unknown>;
}

export interface InspectionResult {
  issues: InspectionIssue[];
  summary: Record<IssueType, number>;
  notes_scanned: number;
}

interface NoteRow {
  path: string;
  title: string;
  type: string;
  content: string | null;
}

/**
 * Inspect a vault for migration issues
 */
export async function inspectVault(
  db: Database.Database,
  vaultPath: string,
  categories?: IssueType[]
): Promise<InspectionResult> {
  const allCategories: IssueType[] = categories ?? [
    'unprefixed_children',
    'corrupted_headings',
    'orphaned_fragments',
    'naming_inconsistencies',
    'broken_wiki_links',
    'code_block_links',
  ];

  const notes = db
    .prepare('SELECT path, title, type, content FROM notes')
    .all() as NoteRow[];

  const issues: InspectionIssue[] = [];

  if (allCategories.includes('unprefixed_children')) {
    issues.push(...findUnprefixedChildren(db, notes));
  }

  if (allCategories.includes('corrupted_headings')) {
    issues.push(...findCorruptedHeadings(notes));
  }

  if (allCategories.includes('orphaned_fragments')) {
    issues.push(...findOrphanedFragments(db, notes));
  }

  if (allCategories.includes('naming_inconsistencies')) {
    issues.push(...findNamingInconsistencies(notes));
  }

  if (allCategories.includes('broken_wiki_links')) {
    issues.push(...findBrokenWikiLinks(notes));
  }

  if (allCategories.includes('code_block_links')) {
    issues.push(...findCodeBlockLinks(notes));
  }

  const summary: Record<IssueType, number> = {
    unprefixed_children: 0,
    corrupted_headings: 0,
    orphaned_fragments: 0,
    naming_inconsistencies: 0,
    broken_wiki_links: 0,
    code_block_links: 0,
  };

  for (const issue of issues) {
    summary[issue.type]++;
  }

  return {
    issues,
    summary,
    notes_scanned: notes.length,
  };
}

/**
 * Find child notes whose filenames don't start with parent title prefix
 */
function findUnprefixedChildren(
  db: Database.Database,
  notes: NoteRow[]
): InspectionIssue[] {
  const issues: InspectionIssue[] = [];

  // Find all hub notes
  const hubs = notes.filter((n) => isHubType(n.type));

  for (const hub of hubs) {
    const hubDir = dirname(hub.path);
    const hubTitle = stripWikiLinks(hub.title);

    // Find children: notes in same directory that aren't the hub itself
    const children = notes.filter(
      (n) =>
        n.path !== hub.path &&
        dirname(n.path) === hubDir &&
        !isHubType(n.type)
    );

    for (const child of children) {
      const childFilename = basename(child.path, '.md');
      const expectedPrefix = `${hubTitle} - `;

      if (!childFilename.startsWith(expectedPrefix)) {
        const sectionTitle = stripWikiLinks(child.title);
        const suggestedName = `${hubTitle} - ${sectionTitle}.md`;

        issues.push({
          path: child.path,
          type: 'unprefixed_children',
          description: `Child note "${childFilename}" lacks parent prefix "${hubTitle} - "`,
          suggestion: `Rename to "${suggestedName}"`,
          details: {
            hub_path: hub.path,
            hub_title: hubTitle,
            current_filename: basename(child.path),
            suggested_filename: suggestedName,
          },
        });
      }
    }
  }

  return issues;
}

/**
 * Find notes with wiki-links in their H1 heading
 */
function findCorruptedHeadings(notes: NoteRow[]): InspectionIssue[] {
  const issues: InspectionIssue[] = [];

  for (const note of notes) {
    if (!note.content) continue;

    // Find H1 line
    const lines = note.content.split('\n');
    for (const line of lines) {
      if (line.startsWith('# ') && !line.startsWith('## ')) {
        // Check for wiki-links in the heading
        if (/\[\[.*?\]\]/.test(line)) {
          const cleanHeading = stripWikiLinks(line);
          issues.push({
            path: note.path,
            type: 'corrupted_headings',
            description: `H1 heading contains wiki-links: "${line.trim()}"`,
            suggestion: `Clean to: "${cleanHeading.trim()}"`,
            details: {
              current_heading: line.trim(),
              clean_heading: cleanHeading.trim(),
            },
          });
        }
        break; // Only check first H1
      }
    }
  }

  return issues;
}

/**
 * Find notes in hub directories that aren't linked from any hub's Knowledge Map
 */
function findOrphanedFragments(
  db: Database.Database,
  notes: NoteRow[]
): InspectionIssue[] {
  const issues: InspectionIssue[] = [];

  // Build set of hub directories
  const hubs = notes.filter((n) => isHubType(n.type));
  const hubDirs = new Map<string, NoteRow>();
  for (const hub of hubs) {
    hubDirs.set(dirname(hub.path), hub);
  }

  // Find notes in hub directories not referenced in the hub's content
  for (const note of notes) {
    if (isHubType(note.type)) continue;
    const noteDir = dirname(note.path);
    const hub = hubDirs.get(noteDir);

    if (!hub || !hub.content) continue;

    // Check if the hub references this note
    const noteTitle = basename(note.path, '.md');
    const isLinked =
      hub.content.includes(`[[${noteTitle}]]`) ||
      hub.content.includes(`[[${noteTitle}|`);

    if (!isLinked) {
      issues.push({
        path: note.path,
        type: 'orphaned_fragments',
        description: `Note in hub directory but not linked from hub "${hub.title}"`,
        suggestion: `Add [[${noteTitle}]] to hub Knowledge Map or move note`,
        details: {
          hub_path: hub.path,
          hub_title: hub.title,
        },
      });
    }
  }

  return issues;
}

/**
 * Find duplicate filenames across different directories
 */
function findNamingInconsistencies(notes: NoteRow[]): InspectionIssue[] {
  const issues: InspectionIssue[] = [];

  // Group by filename
  const byFilename = new Map<string, NoteRow[]>();
  for (const note of notes) {
    const filename = basename(note.path);
    const existing = byFilename.get(filename) ?? [];
    existing.push(note);
    byFilename.set(filename, existing);
  }

  // Report duplicates
  for (const [filename, dupes] of byFilename) {
    if (dupes.length > 1) {
      for (const note of dupes) {
        issues.push({
          path: note.path,
          type: 'naming_inconsistencies',
          description: `Filename "${filename}" appears in ${dupes.length} directories`,
          suggestion: `Consider prefixing with parent title to make unique`,
          details: {
            duplicate_paths: dupes.map((d) => d.path),
          },
        });
      }
    }
  }

  return issues;
}

/**
 * Find malformed wiki-links like [[X]]es]] from retroactive linker corruption
 */
function findBrokenWikiLinks(notes: NoteRow[]): InspectionIssue[] {
  const issues: InspectionIssue[] = [];

  // Pattern: [[X]]<trailing-text>]] — a valid link followed by leftover text and extra ]]
  const brokenPattern = /\[\[([^\]]+)\]\]([a-zA-Z]+\]\])/g;

  for (const note of notes) {
    if (!note.content) continue;

    const lines = note.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      let match: RegExpExecArray | null;
      brokenPattern.lastIndex = 0;

      while ((match = brokenPattern.exec(line)) !== null) {
        const fullMatch = match[0];
        const linkTarget = match[1];
        const trailing = match[2];

        issues.push({
          path: note.path,
          type: 'broken_wiki_links',
          description: `Malformed wiki-link "${fullMatch}" on line ${i + 1}`,
          suggestion: `Fix to "[[${linkTarget}]]" and remove trailing "${trailing}"`,
          details: {
            line_number: i + 1,
            line_content: line.trim(),
            broken_link: fullMatch,
            link_target: linkTarget,
            trailing_text: trailing,
          },
        });
      }
    }
  }

  return issues;
}

/**
 * Find wiki-links inside fenced code blocks
 */
function findCodeBlockLinks(notes: NoteRow[]): InspectionIssue[] {
  const issues: InspectionIssue[] = [];

  for (const note of notes) {
    if (!note.content) continue;

    const lines = note.content.split('\n');
    let inCodeBlock = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';

      if (line.startsWith('```') || line.startsWith('~~~')) {
        inCodeBlock = !inCodeBlock;
        continue;
      }

      if (!inCodeBlock) continue;

      // Find wiki-links inside the code block
      const linkPattern = /\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g;
      let match: RegExpExecArray | null;

      while ((match = linkPattern.exec(line)) !== null) {
        const linkTarget = match[1];
        const displayText = match[2] ?? match[1];

        issues.push({
          path: note.path,
          type: 'code_block_links',
          description: `Wiki-link [[${linkTarget}]] inside code block on line ${i + 1}`,
          suggestion: `Replace with plain text "${displayText}"`,
          details: {
            line_number: i + 1,
            line_content: line.trim(),
            link_target: linkTarget,
            display_text: displayText,
          },
        });
      }
    }
  }

  return issues;
}
