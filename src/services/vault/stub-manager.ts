/**
 * Stub Manager
 *
 * Manages stub notes - placeholders for technologies/concepts that are
 * mentioned but don't have full documentation yet.
 */

import { join } from 'path';
import { mkdir, writeFile, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import type Database from 'better-sqlite3';
import type { ResolvedVault, NoteMetadata, KnowledgeType } from '../../types/index.js';
import type { StorageIntent } from '../../types/intent.js';
import { slugify } from '../../utils/slugify.js';
import { parseFrontmatter, stringifyFrontmatter } from '../../utils/frontmatter.js';
import { resolveStorage } from './resolver.js';
import { logger } from '../../utils/logger.js';
import { extractWikiLinks } from '../../utils/wikilinks.js';
import { isLinkResolved } from '../graph/links.js';

/**
 * Create a stub note for a mentioned technology/concept
 */
export async function createStub(
  title: string,
  context: string,
  mentionedIn: string,
  vault: ResolvedVault,
  domain: string[] = []
): Promise<string> {
  // Resolve where to put the stub
  const intent: StorageIntent = {
    knowledge_type: 'technology',
    domain: domain.length > 0 ? domain : [slugify(title)],
    scope: 'general',
  };

  const resolution = resolveStorage(intent, title, vault);

  // Ensure parent directory exists
  await mkdir(resolution.parentDir, { recursive: true });

  // Build stub content
  const now = new Date().toISOString();
  const frontmatter: Record<string, unknown> = {
    type: 'technology',
    status: 'stub',
    stub_context: context,
    created: now,
    modified: now,
    mentioned_in: [mentionedIn],
    confidence: 0.2, // Low confidence for stubs
    tags: ['stub', ...domain],
  };

  const stubBody = `# ${title}

> **Stub Note**: This note was automatically created because [[${mentionedIn.replace(/\.md$/, '')}]] mentioned "${title}".
> Expand this stub with actual documentation when available.

## Overview

*To be documented*

## Related

- [[${mentionedIn.replace(/\.md$/, '')}]]`;

  const content = stringifyFrontmatter(frontmatter, stubBody);

  // Write the stub file
  await writeFile(resolution.fullPath, content, 'utf-8');
  logger.debug(`Created stub: ${resolution.relativePath}`);

  return resolution.relativePath;
}

/**
 * Check if a note is a stub
 */
export function isStub(frontmatter: Record<string, unknown>): boolean {
  return frontmatter.status === 'stub';
}

/**
 * Expand a stub note with real content
 */
export async function expandStub(
  stubPath: string,
  newContent: string,
  vault: ResolvedVault,
  source: { origin: string; confidence?: number | undefined }
): Promise<void> {
  const fullPath = join(vault.path, stubPath);

  if (!existsSync(fullPath)) {
    throw new Error(`Stub not found: ${stubPath}`);
  }

  // Read existing stub
  const existing = await readFile(fullPath, 'utf-8');
  const { frontmatter } = parseFrontmatter(existing);
  const fm = frontmatter as Record<string, unknown>;

  // Check it's actually a stub
  if (!isStub(fm)) {
    throw new Error(`Note is not a stub: ${stubPath}`);
  }

  // Update frontmatter
  const now = new Date().toISOString();
  const newFrontmatter: Record<string, unknown> = {
    ...fm,
    status: 'active',
    modified: now,
    confidence: source.confidence ?? 0.5,
    source: source.origin,
    expanded_from_stub: true,
    stub_expanded_at: now,
  };

  // Remove stub-specific fields
  delete newFrontmatter.stub_context;

  // Write expanded content
  const finalContent = stringifyFrontmatter(newFrontmatter, newContent);

  await writeFile(fullPath, finalContent, 'utf-8');
  logger.debug(`Expanded stub: ${stubPath}`);
}

/**
 * Add a mention to an existing stub
 */
export async function addStubMention(
  stubPath: string,
  mentionedIn: string,
  vault: ResolvedVault
): Promise<void> {
  const fullPath = join(vault.path, stubPath);

  if (!existsSync(fullPath)) {
    return; // Stub doesn't exist, nothing to update
  }

  const existing = await readFile(fullPath, 'utf-8');
  const { frontmatter, body } = parseFrontmatter(existing);
  const fm = frontmatter as Record<string, unknown>;

  if (!isStub(fm)) {
    return; // Not a stub, don't modify
  }

  // Add mention if not already there
  const mentions = (fm.mentioned_in as string[]) || [];
  if (!mentions.includes(mentionedIn)) {
    mentions.push(mentionedIn);
    fm.mentioned_in = mentions;
    fm.modified = new Date().toISOString();

    const updated = stringifyFrontmatter(fm, body);

    await writeFile(fullPath, updated, 'utf-8');
    logger.debug(`Added mention to stub: ${stubPath} <- ${mentionedIn}`);
  }
}

/**
 * Build frontmatter from database row
 */
function buildFrontmatterFromRow(row: {
  type: string;
  created: string;
  modified: string;
  confidence: number | null;
  verified: number;
  tags: string | null;
  related: string | null;
  aliases: string | null;
  source: string | null;
}): NoteMetadata['frontmatter'] {
  const frontmatter: NoteMetadata['frontmatter'] = {
    type: row.type as KnowledgeType,
    created: row.created,
    modified: row.modified,
    verified: Boolean(row.verified),
    tags: row.tags ? JSON.parse(row.tags) : [],
    related: row.related ? JSON.parse(row.related) : [],
    aliases: row.aliases ? JSON.parse(row.aliases) : [],
  };
  if (row.confidence !== null) {
    frontmatter.confidence = row.confidence;
  }
  if (row.source) {
    frontmatter.source = row.source as 'claude' | 'user';
  }
  return frontmatter;
}

/**
 * Find all stubs in the database
 */
export function findStubs(db: Database.Database, options: { limit?: number } = {}): NoteMetadata[] {
  const limit = options.limit ?? 100;

  const results = db
    .prepare(
      `
      SELECT path, title, type, created, modified, confidence, verified,
             tags, related, aliases, source, status
      FROM notes
      WHERE status = 'stub'
      ORDER BY created DESC
      LIMIT ?
    `
    )
    .all(limit) as Array<{
    path: string;
    title: string;
    type: string;
    created: string;
    modified: string;
    confidence: number | null;
    verified: number;
    tags: string | null;
    related: string | null;
    aliases: string | null;
    source: string | null;
    status: string | null;
  }>;

  return results.map((row) => ({
    path: row.path,
    filename: row.path.split('/').pop() || '',
    title: row.title,
    frontmatter: buildFrontmatterFromRow(row),
  }));
}

/**
 * Check if a stub exists for a given title
 */
export function findStubByTitle(db: Database.Database, title: string): NoteMetadata | null {
  const row = db
    .prepare(
      `
      SELECT path, title, type, created, modified, confidence, verified,
             tags, related, aliases, source, status
      FROM notes
      WHERE status = 'stub' AND (title = ? OR title = ?)
      LIMIT 1
    `
    )
    .get(title, title.toLowerCase()) as {
    path: string;
    title: string;
    type: string;
    created: string;
    modified: string;
    confidence: number | null;
    verified: number;
    tags: string | null;
    related: string | null;
    aliases: string | null;
    source: string | null;
  } | undefined;

  if (!row) return null;

  return {
    path: row.path,
    filename: row.path.split('/').pop() || '',
    title: row.title,
    frontmatter: buildFrontmatterFromRow(row),
  };
}

/**
 * Get stubs that were mentioned by a specific note
 */
export function getStubsMentionedBy(db: Database.Database, notePath: string): NoteMetadata[] {
  // This requires the mentioned_in field to be searchable
  // For now, we'll do a simple LIKE query
  const results = db
    .prepare(
      `
      SELECT path, title, type, created, modified, confidence, verified,
             tags, related, aliases, source, status
      FROM notes
      WHERE status = 'stub'
        AND (mentioned_in LIKE ? OR mentioned_in LIKE ?)
      ORDER BY title
    `
    )
    .all(`%"${notePath}"%`, `%"${notePath.replace(/\.md$/, '')}"%`) as Array<{
    path: string;
    title: string;
    type: string;
    created: string;
    modified: string;
    confidence: number | null;
    verified: number;
    tags: string | null;
    related: string | null;
    aliases: string | null;
    source: string | null;
  }>;

  return results.map((row) => ({
    path: row.path,
    filename: row.path.split('/').pop() || '',
    title: row.title,
    frontmatter: buildFrontmatterFromRow(row),
  }));
}

/**
 * Create stubs for all unresolved [[wiki-links]] in content
 *
 * @param content - The content to scan for links
 * @param sourcePath - The path of the note containing the links
 * @param db - Database to check for existing notes
 * @param vault - Vault to create stubs in
 * @param domain - Domain tags to apply to created stubs
 * @returns Array of created stub paths
 */
export async function createStubsForUnresolvedLinks(
  content: string,
  sourcePath: string,
  db: Database.Database,
  vault: ResolvedVault,
  domain: string[] = []
): Promise<string[]> {
  const createdStubs: string[] = [];

  // Extract all wiki-links from content
  const links = extractWikiLinks(content);

  for (const link of links) {
    const target = link.target;

    // Skip if link is already resolved
    if (isLinkResolved(db, target)) {
      continue;
    }

    // Skip very short targets (likely invalid)
    if (target.length < 2) {
      continue;
    }

    // Skip if target looks like a path (contains /) - these are explicit paths
    if (target.includes('/')) {
      continue;
    }

    // Check if we've already created a stub for this title in this run
    if (createdStubs.some((s) => s.toLowerCase().includes(slugify(target)))) {
      continue;
    }

    try {
      const stubPath = await createStub(
        target,
        `Referenced in [[${sourcePath.replace(/\.md$/, '')}]]`,
        sourcePath,
        vault,
        domain
      );
      createdStubs.push(stubPath);
      logger.info(`Created stub for unresolved link: ${target} -> ${stubPath}`);
    } catch (error) {
      logger.warn(`Failed to create stub for ${target}:`, error);
    }
  }

  return createdStubs;
}
