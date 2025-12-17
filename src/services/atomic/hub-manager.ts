/**
 * Hub manager for atomic note system
 *
 * Handles CRUD operations for hub notes and their children.
 *
 * Phase 018: Uses title-style filenames (Obsidian-native)
 * - Hub filename = sanitized title (e.g., "Green Peppers.md")
 * - No more DEFAULT_HUB_FILENAME constant
 */

import { join, dirname, basename } from 'path';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import type {
  HubInfo,
  HubChild,
  HubOperationResult,
  HubFrontmatter,
  ChildFrontmatter,
} from '../../types/atomic.js';
import { parseFrontmatter, stringifyFrontmatter } from '../../utils/frontmatter.js';
import { stripWikiLinks } from '../../utils/markdown.js';
import { titleToFilename } from '../../utils/slugify.js';
import { logger } from '../../utils/logger.js';
import { getHubType, normalizeType, getBaseType } from '../../types/note-types.js';

/**
 * Create a new hub note
 * Phase 018: Hub filename is derived from title, not a constant
 * Phase 022: Accept optional overview content to preserve intro during splits
 */
export async function createHub(
  vaultPath: string,
  hubDir: string,
  title: string,
  children: HubChild[],
  options: {
    domain?: string[];
    originalFrontmatter?: Record<string, unknown>;
    /** Phase 022: Overview/intro content to preserve in hub */
    overview?: string;
  } = {}
): Promise<HubOperationResult> {
  // Phase 018: Hub filename is the title, sanitized for filesystem
  const hubFilename = titleToFilename(title);
  const hubPath = join(vaultPath, hubDir, hubFilename);
  const relativePath = join(hubDir, hubFilename);

  try {
    // Ensure directory exists
    const fullDir = join(vaultPath, hubDir);
    if (!existsSync(fullDir)) {
      await mkdir(fullDir, { recursive: true });
    }

    // Build frontmatter
    const now = new Date().toISOString();
    // Phase 025: Use getHubType to prevent double-suffixing (_hub_hub)
    const originalType = (options.originalFrontmatter?.type as string) ?? 'research';
    const hubType = getHubType(getBaseType(originalType));
    const frontmatter: HubFrontmatter = {
      type: hubType,
      title,
      status: 'active',
      children_count: children.length,
      ...(options.domain ? { domain: options.domain } : {}),
      created: now,
      modified: now,
      palace: {
        version: 1,
      },
    };

    // Build content - Phase 022: pass overview to preserve intro content
    const content = buildHubContent(title, children, hubDir, options.overview);
    const fullContent = stringifyFrontmatter(frontmatter, content);

    await writeFile(hubPath, fullContent, 'utf-8');

    logger.debug(`Created hub: ${relativePath} with ${children.length} children`);

    return {
      success: true,
      path: relativePath,
      message: `Created hub with ${children.length} children`,
      hub: {
        path: relativePath,
        title,
        childrenCount: children.length,
        children,
      },
    };
  } catch (error) {
    logger.error(`Failed to create hub: ${hubPath}`, error);
    return {
      success: false,
      path: relativePath,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Read hub information
 * Phase 025: Now returns accurate children count by verifying files on disk
 */
export async function getHubInfo(
  vaultPath: string,
  hubPath: string,
  options: { validateChildren?: boolean } = {}
): Promise<HubInfo | null> {
  const fullPath = join(vaultPath, hubPath);

  if (!existsSync(fullPath)) {
    return null;
  }

  try {
    const content = await readFile(fullPath, 'utf-8');
    const { frontmatter, body } = parseFrontmatter(content);

    const title = (frontmatter as Record<string, unknown>).title as string ?? extractTitleFromBody(body);
    const storedChildrenCount = (frontmatter as Record<string, unknown>).children_count as number ?? 0;

    // Extract children from content
    const children = extractChildrenFromContent(body, dirname(hubPath));

    // Phase 025: Validate children count if requested (default: true for accuracy)
    let childrenCount = storedChildrenCount;
    if (options.validateChildren !== false) {
      // Verify which children actually exist on disk
      const existingChildren = children.filter((child) => {
        const childFullPath = join(vaultPath, child.path);
        return existsSync(childFullPath);
      });
      childrenCount = existingChildren.length;

      // Log if there's a mismatch (but don't auto-repair here)
      if (childrenCount !== storedChildrenCount && storedChildrenCount > 0) {
        logger.debug(
          `Hub ${hubPath} children_count mismatch: stored=${storedChildrenCount}, actual=${childrenCount}`
        );
      }
    }

    return {
      path: hubPath,
      title,
      childrenCount,
      children,
    };
  } catch (error) {
    logger.error(`Failed to read hub: ${hubPath}`, error);
    return null;
  }
}

/**
 * Update hub note
 */
export async function updateHub(
  vaultPath: string,
  hubPath: string,
  updates: {
    title?: string;
    children?: HubChild[];
    frontmatter?: Partial<HubFrontmatter>;
  }
): Promise<HubOperationResult> {
  const fullPath = join(vaultPath, hubPath);

  if (!existsSync(fullPath)) {
    return {
      success: false,
      path: hubPath,
      message: `Hub not found: ${hubPath}`,
    };
  }

  try {
    const content = await readFile(fullPath, 'utf-8');
    const { frontmatter: existingFm, body: existingBody } = parseFrontmatter(content);

    const fm = existingFm as Record<string, unknown>;
    const now = new Date().toISOString();

    // Update frontmatter
    if (updates.frontmatter) {
      Object.assign(fm, updates.frontmatter);
    }
    fm.modified = now;

    // Update children count
    if (updates.children) {
      fm.children_count = updates.children.length;
    }

    // Increment version
    const palace = (fm.palace as Record<string, unknown>) ?? {};
    palace.version = ((palace.version as number) ?? 0) + 1;
    fm.palace = palace;

    // Update body if children changed
    let newBody = existingBody;
    if (updates.children) {
      newBody = updateHubBody(
        existingBody,
        updates.title ?? (fm.title as string),
        updates.children,
        dirname(hubPath)
      );
    }

    const fullContent = stringifyFrontmatter(fm, newBody);
    await writeFile(fullPath, fullContent, 'utf-8');

    logger.debug(`Updated hub: ${hubPath}`);

    return {
      success: true,
      path: hubPath,
      message: 'Hub updated successfully',
      hub: {
        path: hubPath,
        title: (fm.title as string) ?? '',
        childrenCount: (fm.children_count as number) ?? 0,
        children: updates.children ?? [],
      },
    };
  } catch (error) {
    logger.error(`Failed to update hub: ${hubPath}`, error);
    return {
      success: false,
      path: hubPath,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Add a child to an existing hub
 */
export async function addChild(
  vaultPath: string,
  hubPath: string,
  child: HubChild
): Promise<HubOperationResult> {
  const hubInfo = await getHubInfo(vaultPath, hubPath);

  if (!hubInfo) {
    return {
      success: false,
      path: hubPath,
      message: `Hub not found: ${hubPath}`,
    };
  }

  // Check if child already exists
  const exists = hubInfo.children.some((c) => c.path === child.path);
  if (exists) {
    return {
      success: true,
      path: hubPath,
      message: 'Child already exists in hub',
      hub: hubInfo,
    };
  }

  // Add new child
  const updatedChildren = [...hubInfo.children, child];

  return updateHub(vaultPath, hubPath, { children: updatedChildren });
}

/**
 * Remove a child from a hub
 */
export async function removeChild(
  vaultPath: string,
  hubPath: string,
  childPath: string
): Promise<HubOperationResult> {
  const hubInfo = await getHubInfo(vaultPath, hubPath);

  if (!hubInfo) {
    return {
      success: false,
      path: hubPath,
      message: `Hub not found: ${hubPath}`,
    };
  }

  // Remove child
  const updatedChildren = hubInfo.children.filter((c) => c.path !== childPath);

  if (updatedChildren.length === hubInfo.children.length) {
    return {
      success: true,
      path: hubPath,
      message: 'Child not found in hub',
      hub: hubInfo,
    };
  }

  return updateHub(vaultPath, hubPath, { children: updatedChildren });
}

/**
 * Check if a path is a hub note
 * Phase 018: Hub notes are identified by having type ending in '_hub' in frontmatter
 * This function is deprecated - use frontmatter type check instead
 */
export function isHubPath(path: string, hubFilename?: string): boolean {
  // With title-style filenames, we can't determine hub status from filename alone
  // Return false - callers should check frontmatter type instead
  if (hubFilename) {
    return basename(path) === hubFilename;
  }
  return false;
}

/**
 * Get the hub path for a directory with a given title
 * Phase 018: Hub filename is derived from title
 */
export function getHubPath(dir: string, title: string): string {
  return join(dir, titleToFilename(title));
}

/**
 * Build hub note content
 * Phase 018: With title-style filenames, links use title directly
 * Phase 022: Accept optional overview content to preserve intro during splits
 */
function buildHubContent(
  title: string,
  children: HubChild[],
  _hubDir: string,
  overview?: string
): string {
  const childLinks = children.map((child) => {
    // Phase 018: With title-style filenames, link directly to title
    const summary = child.summary ? ` - ${child.summary}` : '';
    return `- [[${child.title}]]${summary}`;
  });

  // Phase 022: Use provided overview content if available, otherwise use placeholder
  const overviewContent = overview?.trim() || 'Brief overview of this topic.';

  // Check if overview already has content (non-empty after trimming)
  // If it has content, we don't need the "Overview" header - use it directly
  const hasSubstantialOverview = overview && overview.trim().length > 0;

  if (hasSubstantialOverview) {
    // Overview content was provided - use it directly without adding another header
    return `# ${title}

${overviewContent}

## Knowledge Map

${childLinks.join('\n')}

## Related

`;
  }

  // No overview provided - use the placeholder with header
  return `# ${title}

## Overview

${overviewContent}

## Knowledge Map

${childLinks.join('\n')}

## Related

`;
}

/**
 * Update hub body with new children list
 * Phase 018: With title-style filenames, links use title directly
 */
function updateHubBody(
  existingBody: string,
  _title: string,
  children: HubChild[],
  _hubDir: string
): string {
  const lines = existingBody.split('\n');
  const newLines: string[] = [];

  let skipUntilNextSection = false;

  for (const line of lines) {
    if (line.startsWith('## Knowledge Map')) {
      newLines.push(line);
      newLines.push('');

      // Add children - Phase 018: link directly to title
      for (const child of children) {
        const summary = child.summary ? ` - ${child.summary}` : '';
        newLines.push(`- [[${child.title}]]${summary}`);
      }

      skipUntilNextSection = true;
      continue;
    }

    if (skipUntilNextSection) {
      if (line.startsWith('## ')) {
        skipUntilNextSection = false;
        newLines.push('');
        newLines.push(line);
      }
      continue;
    }

    newLines.push(line);
  }

  return newLines.join('\n');
}

/**
 * Extract title from body (H1 heading)
 * Strips wiki-link syntax from the extracted title
 */
function extractTitleFromBody(body: string): string {
  const lines = body.split('\n');
  for (const line of lines) {
    if (line.startsWith('# ') && !line.startsWith('## ')) {
      const rawTitle = line.replace(/^#\s+/, '').trim();
      return stripWikiLinks(rawTitle);
    }
  }
  return 'Untitled Hub';
}

/**
 * Extract children from hub content
 */
function extractChildrenFromContent(body: string, hubDir: string): HubChild[] {
  const children: HubChild[] = [];
  const linkRegex = /^-\s*\[\[([^\]|]+)(?:\|([^\]]+))?\]\](?:\s*-\s*(.+))?$/;

  const lines = body.split('\n');
  let inKnowledgeMap = false;

  for (const line of lines) {
    if (line.startsWith('## Knowledge Map')) {
      inKnowledgeMap = true;
      continue;
    }

    if (inKnowledgeMap && line.startsWith('## ')) {
      break;
    }

    if (inKnowledgeMap) {
      const match = line.match(linkRegex);
      if (match) {
        const path = match[1] ?? '';
        const title = match[2] ?? basename(path, '.md');
        const summary = match[3];

        const child: HubChild = {
          path: path.includes('/') ? path : join(hubDir, path),
          title,
        };
        if (summary) {
          child.summary = summary;
        }
        children.push(child);
      }
    }
  }

  return children;
}

// Phase 018: getRelativeLinkPath removed - no longer needed with title-style filenames
// Links now use title directly: [[Child Title]] instead of relative paths

/**
 * Create a child note for a hub
 * Phase 018: No parent field in frontmatter - use inline links instead
 */
export async function createChildNote(
  vaultPath: string,
  childPath: string,
  title: string,
  content: string,
  hubPath: string,
  options: {
    domain?: string[];
    originalFrontmatter?: Record<string, unknown>;
  } = {}
): Promise<{ success: boolean; path: string; message: string }> {
  const fullPath = join(vaultPath, childPath);

  try {
    // Ensure directory exists
    const dir = dirname(fullPath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    const now = new Date().toISOString();
    // Phase 018: No parent field - use inline links in content instead (Zettelkasten style)
    // Phase 025: Normalize type to prevent corruption and ensure child has base type (not hub type)
    const rawType = (options.originalFrontmatter?.type as string) ?? 'research';
    const childType = normalizeType(getBaseType(rawType));
    const frontmatter: ChildFrontmatter = {
      type: childType,
      title,
      status: 'active',
      ...(options.domain ? { domain: options.domain } : {}),
      created: now,
      modified: now,
      palace: {
        version: 1,
      },
    };

    const fullContent = stringifyFrontmatter(frontmatter, content);
    await writeFile(fullPath, fullContent, 'utf-8');

    logger.debug(`Created child note: ${childPath}`);

    return {
      success: true,
      path: childPath,
      message: 'Child note created',
    };
  } catch (error) {
    logger.error(`Failed to create child note: ${childPath}`, error);
    return {
      success: false,
      path: childPath,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
