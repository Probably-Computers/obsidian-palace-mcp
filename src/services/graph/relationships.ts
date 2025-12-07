/**
 * Graph traversal algorithms
 * Multi-hop relationships, orphan detection, and related note discovery
 */

import Database from 'better-sqlite3';
import { basename } from 'path';
import {
  getOutgoingLinks,
  getIncomingLinks,
  getNoteMetadataByPath,
  rowToNoteMetadata,
} from './links.js';
import type {
  GraphNode,
  TraversalResult,
  NoteMetadata,
  OrphanType,
  RelatednessMethod,
  RelatedNote,
} from '../../types/index.js';

/**
 * Get a graph node with link counts
 */
export function getGraphNode(db: Database.Database, path: string): GraphNode | null {
  const note = db
    .prepare('SELECT path, title FROM notes WHERE path = ?')
    .get(path) as { path: string; title: string } | undefined;

  if (!note) {
    return null;
  }

  const incoming = getIncomingLinks(db, path);
  const outgoing = getOutgoingLinks(db, path);

  return {
    path: note.path,
    title: note.title ?? basename(note.path, '.md'),
    incomingCount: incoming.length,
    outgoingCount: outgoing.length,
  };
}

/**
 * Traverse the graph from a starting note to a given depth
 * Uses BFS for level-by-level exploration
 */
export function traverseGraph(
  db: Database.Database,
  startPath: string,
  direction: 'incoming' | 'outgoing' | 'both',
  maxDepth: number = 1
): TraversalResult[] {
  const results: TraversalResult[] = [];
  const visited = new Set<string>();
  const queue: Array<{ path: string; depth: number; trail: string[] }> = [];

  // Start with the initial note
  visited.add(startPath);
  queue.push({ path: startPath, depth: 0, trail: [startPath] });

  while (queue.length > 0) {
    const current = queue.shift()!;

    // Get connected notes based on direction
    const connectedPaths: string[] = [];

    if (direction === 'outgoing' || direction === 'both') {
      const outgoing = getOutgoingLinks(db, current.path);
      for (const link of outgoing) {
        if (link.resolved) {
          // Resolve the target to actual path
          const targetPath = resolveToPath(db, link.target);
          if (targetPath) {
            connectedPaths.push(targetPath);
          }
        }
      }
    }

    if (direction === 'incoming' || direction === 'both') {
      const incoming = getIncomingLinks(db, current.path);
      for (const link of incoming) {
        connectedPaths.push(link.source);
      }
    }

    // Process connected notes
    for (const connectedPath of connectedPaths) {
      if (visited.has(connectedPath)) {
        continue;
      }

      visited.add(connectedPath);
      const newDepth = current.depth + 1;
      const newTrail = [...current.trail, connectedPath];

      // Get note metadata
      const noteMeta = getNoteMetadataByPath(db, connectedPath);
      if (noteMeta) {
        results.push({
          depth: newDepth,
          path: newTrail,
          note: noteMeta,
        });

        // Continue traversal if within depth limit
        if (newDepth < maxDepth) {
          queue.push({ path: connectedPath, depth: newDepth, trail: newTrail });
        }
      }
    }
  }

  return results;
}

/**
 * Resolve a link target to an actual note path
 */
function resolveToPath(db: Database.Database, target: string): string | null {
  // Try exact path match
  const exactMatch = db
    .prepare('SELECT path FROM notes WHERE path = ? LIMIT 1')
    .get(target) as { path: string } | undefined;

  if (exactMatch) {
    return exactMatch.path;
  }

  // Try title match (case-insensitive)
  const titleMatch = db
    .prepare('SELECT path FROM notes WHERE LOWER(title) = LOWER(?) LIMIT 1')
    .get(target) as { path: string } | undefined;

  if (titleMatch) {
    return titleMatch.path;
  }

  // Try filename match
  const filenameMatch = db
    .prepare(
      `SELECT path FROM notes
       WHERE LOWER(path) LIKE '%/' || LOWER(?) || '.md'
       OR LOWER(path) = LOWER(?) || '.md'
       LIMIT 1`
    )
    .get(target, target) as { path: string } | undefined;

  return filenameMatch?.path ?? null;
}

/**
 * Find orphan notes based on orphan type
 */
export function findOrphans(
  db: Database.Database,
  orphanType: OrphanType,
  pathPrefix?: string
): NoteMetadata[] {
  // Build path filter
  const pathFilter = pathPrefix
    ? `AND n.path LIKE '${pathPrefix}%'`
    : '';

  let query: string;

  switch (orphanType) {
    case 'no_incoming':
      // Notes with no incoming links (no backlinks)
      query = `
        SELECT DISTINCT n.path, n.title, n.type, n.created, n.modified,
               n.source, n.confidence, n.verified
        FROM notes n
        WHERE n.id NOT IN (
          SELECT DISTINCT target_note.id
          FROM notes target_note
          JOIN links l ON (
            LOWER(l.target_path) = LOWER(target_note.title)
            OR LOWER(l.target_path) = LOWER(REPLACE(target_note.path, '.md', ''))
            OR l.target_path = target_note.path
            OR LOWER(l.target_path) || '.md' = LOWER(target_note.path)
          )
        )
        ${pathFilter}
        ORDER BY n.path
      `;
      break;

    case 'no_outgoing':
      // Notes with no outgoing links
      query = `
        SELECT DISTINCT n.path, n.title, n.type, n.created, n.modified,
               n.source, n.confidence, n.verified
        FROM notes n
        WHERE n.id NOT IN (
          SELECT DISTINCT source_id FROM links
        )
        ${pathFilter}
        ORDER BY n.path
      `;
      break;

    case 'isolated':
      // Notes with no incoming AND no outgoing links
      query = `
        SELECT DISTINCT n.path, n.title, n.type, n.created, n.modified,
               n.source, n.confidence, n.verified
        FROM notes n
        WHERE n.id NOT IN (
          SELECT DISTINCT source_id FROM links
        )
        AND n.id NOT IN (
          SELECT DISTINCT target_note.id
          FROM notes target_note
          JOIN links l ON (
            LOWER(l.target_path) = LOWER(target_note.title)
            OR LOWER(l.target_path) = LOWER(REPLACE(target_note.path, '.md', ''))
            OR l.target_path = target_note.path
            OR LOWER(l.target_path) || '.md' = LOWER(target_note.path)
          )
        )
        ${pathFilter}
        ORDER BY n.path
      `;
      break;
  }

  const rows = db.prepare(query).all() as Array<{
    path: string;
    title: string | null;
    type: string | null;
    created: string | null;
    modified: string | null;
    source: string | null;
    confidence: number | null;
    verified: number | null;
  }>;

  return rows.map((row) => rowToNoteMetadata(db, row));
}

/**
 * Find notes related to a given note
 */
export function findRelatedNotes(
  db: Database.Database,
  path: string,
  method: RelatednessMethod,
  limit: number = 10
): RelatedNote[] {
  // Get the source note's ID
  const sourceNote = db
    .prepare('SELECT id FROM notes WHERE path = ?')
    .get(path) as { id: number } | undefined;

  if (!sourceNote) {
    return [];
  }

  const candidates: Map<string, RelatedNote> = new Map();

  if (method === 'links' || method === 'both') {
    // Find notes that share link targets with this note
    const sharedLinkNotes = findNotesWithSharedLinks(db, sourceNote.id, path);
    for (const related of sharedLinkNotes) {
      const existing = candidates.get(related.note.path);
      if (existing) {
        existing.score += related.score;
        if (related.sharedLinks) {
          existing.sharedLinks = related.sharedLinks;
        }
      } else {
        candidates.set(related.note.path, related);
      }
    }
  }

  if (method === 'tags' || method === 'both') {
    // Find notes that share tags with this note
    const sharedTagNotes = findNotesWithSharedTags(db, sourceNote.id, path);
    for (const related of sharedTagNotes) {
      const existing = candidates.get(related.note.path);
      if (existing) {
        existing.score += related.score;
        if (related.sharedTags) {
          existing.sharedTags = related.sharedTags;
        }
      } else {
        candidates.set(related.note.path, related);
      }
    }
  }

  // Sort by score descending and limit results
  return Array.from(candidates.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Find notes that share link targets with a given note
 */
function findNotesWithSharedLinks(
  db: Database.Database,
  noteId: number,
  notePath: string
): RelatedNote[] {
  // Get this note's link targets
  const myLinks = db
    .prepare('SELECT target_path FROM links WHERE source_id = ?')
    .all(noteId) as { target_path: string }[];

  if (myLinks.length === 0) {
    return [];
  }

  const myTargets = new Set(myLinks.map((l) => l.target_path.toLowerCase()));

  // Find other notes and their shared links
  const otherNotes = db
    .prepare(
      `SELECT n.path, n.title, n.type, n.created, n.modified,
              n.source, n.confidence, n.verified,
              GROUP_CONCAT(l.target_path) as targets
       FROM notes n
       JOIN links l ON n.id = l.source_id
       WHERE n.path != ?
       GROUP BY n.id`
    )
    .all(notePath) as Array<{
    path: string;
    title: string | null;
    type: string | null;
    created: string | null;
    modified: string | null;
    source: string | null;
    confidence: number | null;
    verified: number | null;
    targets: string;
  }>;

  const results: RelatedNote[] = [];

  for (const row of otherNotes) {
    const theirTargets = row.targets.split(',');
    const sharedLinks = theirTargets.filter((t) =>
      myTargets.has(t.toLowerCase())
    );

    if (sharedLinks.length > 0) {
      // Score using Jaccard-like similarity
      const score = sharedLinks.length / (myTargets.size + theirTargets.length - sharedLinks.length);

      results.push({
        note: rowToNoteMetadata(db, row),
        score,
        sharedLinks,
      });
    }
  }

  return results;
}

/**
 * Find notes that share tags with a given note
 */
function findNotesWithSharedTags(
  db: Database.Database,
  noteId: number,
  notePath: string
): RelatedNote[] {
  // Get this note's tags
  const myTags = db
    .prepare('SELECT tag FROM note_tags WHERE note_id = ?')
    .all(noteId) as { tag: string }[];

  if (myTags.length === 0) {
    return [];
  }

  const myTagSet = new Set(myTags.map((t) => t.tag));

  // Find other notes and their shared tags
  const otherNotes = db
    .prepare(
      `SELECT n.path, n.title, n.type, n.created, n.modified,
              n.source, n.confidence, n.verified,
              GROUP_CONCAT(nt.tag) as tags
       FROM notes n
       JOIN note_tags nt ON n.id = nt.note_id
       WHERE n.path != ?
       GROUP BY n.id`
    )
    .all(notePath) as Array<{
    path: string;
    title: string | null;
    type: string | null;
    created: string | null;
    modified: string | null;
    source: string | null;
    confidence: number | null;
    verified: number | null;
    tags: string;
  }>;

  const results: RelatedNote[] = [];

  for (const row of otherNotes) {
    const theirTags = row.tags.split(',');
    const sharedTags = theirTags.filter((t) => myTagSet.has(t));

    if (sharedTags.length > 0) {
      // Score using Jaccard-like similarity
      const score = sharedTags.length / (myTagSet.size + theirTags.length - sharedTags.length);

      results.push({
        note: rowToNoteMetadata(db, row),
        score,
        sharedTags,
      });
    }
  }

  return results;
}

/**
 * Find common links between two notes
 */
export function findCommonLinks(db: Database.Database, path1: string, path2: string): string[] {
  const links1 = getOutgoingLinks(db, path1);
  const links2 = getOutgoingLinks(db, path2);

  const targets1 = new Set(links1.map((l) => l.target.toLowerCase()));
  const targets2 = links2.map((l) => l.target);

  return targets2.filter((t) => targets1.has(t.toLowerCase()));
}

/**
 * Check if there's a path between two notes
 */
export function hasPath(
  db: Database.Database,
  fromPath: string,
  toPath: string,
  maxDepth: number = 5
): boolean {
  const results = traverseGraph(db, fromPath, 'outgoing', maxDepth);
  return results.some((r) => r.note.path === toPath);
}
