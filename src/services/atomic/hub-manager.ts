/**
 * Hub manager for atomic note system
 *
 * Handles CRUD operations for hub notes and their children.
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
import { logger } from '../../utils/logger.js';

/**
 * Default hub filename
 */
const DEFAULT_HUB_FILENAME = '_index.md';

/**
 * Create a new hub note
 */
export async function createHub(
  vaultPath: string,
  hubDir: string,
  title: string,
  children: HubChild[],
  options: {
    hubFilename?: string;
    domain?: string[];
    originalFrontmatter?: Record<string, unknown>;
  } = {}
): Promise<HubOperationResult> {
  const hubFilename = options.hubFilename ?? DEFAULT_HUB_FILENAME;
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
    const frontmatter: HubFrontmatter = {
      type: `${options.originalFrontmatter?.type ?? 'research'}_hub`,
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

    // Build content
    const content = buildHubContent(title, children, hubDir);
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
 */
export async function getHubInfo(
  vaultPath: string,
  hubPath: string
): Promise<HubInfo | null> {
  const fullPath = join(vaultPath, hubPath);

  if (!existsSync(fullPath)) {
    return null;
  }

  try {
    const content = await readFile(fullPath, 'utf-8');
    const { frontmatter, body } = parseFrontmatter(content);

    const title = (frontmatter as Record<string, unknown>).title as string ?? extractTitleFromBody(body);
    const childrenCount = (frontmatter as Record<string, unknown>).children_count as number ?? 0;

    // Extract children from content
    const children = extractChildrenFromContent(body, dirname(hubPath));

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
 */
export function isHubPath(path: string, hubFilename: string = DEFAULT_HUB_FILENAME): boolean {
  return basename(path) === hubFilename;
}

/**
 * Get the hub path for a directory
 */
export function getHubPath(dir: string, hubFilename: string = DEFAULT_HUB_FILENAME): string {
  return join(dir, hubFilename);
}

/**
 * Build hub note content
 */
function buildHubContent(title: string, children: HubChild[], hubDir: string): string {
  const childLinks = children.map((child) => {
    const relativePath = getRelativeLinkPath(child.path, hubDir);
    const summary = child.summary ? ` - ${child.summary}` : '';
    return `- [[${relativePath}|${child.title}]]${summary}`;
  });

  return `# ${title}

## Overview

Brief overview of this topic.

## Knowledge Map

${childLinks.join('\n')}

## Related

`;
}

/**
 * Update hub body with new children list
 */
function updateHubBody(
  existingBody: string,
  title: string,
  children: HubChild[],
  hubDir: string
): string {
  const lines = existingBody.split('\n');
  const newLines: string[] = [];

  let skipUntilNextSection = false;

  for (const line of lines) {
    if (line.startsWith('## Knowledge Map')) {
      newLines.push(line);
      newLines.push('');

      // Add children
      for (const child of children) {
        const relativePath = getRelativeLinkPath(child.path, hubDir);
        const summary = child.summary ? ` - ${child.summary}` : '';
        newLines.push(`- [[${relativePath}|${child.title}]]${summary}`);
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
 */
function extractTitleFromBody(body: string): string {
  const lines = body.split('\n');
  for (const line of lines) {
    if (line.startsWith('# ') && !line.startsWith('## ')) {
      return line.replace(/^#\s+/, '').trim();
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

/**
 * Get relative link path for a child
 */
function getRelativeLinkPath(childPath: string, hubDir: string): string {
  // If child is in same directory, just use filename
  if (dirname(childPath) === hubDir) {
    return basename(childPath, '.md');
  }

  // Otherwise return full relative path without extension
  return childPath.replace(/\.md$/, '');
}

/**
 * Create a child note for a hub
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
    const frontmatter: ChildFrontmatter = {
      type: (options.originalFrontmatter?.type as string) ?? 'research',
      title,
      parent: `[[${hubPath.replace(/\.md$/, '')}]]`,
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
