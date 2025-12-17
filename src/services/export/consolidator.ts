/**
 * Hub consolidation for export (Phase 026)
 *
 * Merges hub notes and their children into a single document.
 */

import { join, dirname } from 'path';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { parseFrontmatter } from '../../utils/frontmatter.js';
import { adjustHeaderLevels, stripFrontmatter } from '../../utils/markdown.js';
import { getHubInfo } from '../atomic/hub-manager.js';
import { logger } from '../../utils/logger.js';
import type { HubChild, HubInfo } from '../../types/atomic.js';

/**
 * Result of consolidating a hub and its children
 */
export interface ConsolidationResult {
  /** The merged content */
  content: string;
  /** Title of the hub */
  title: string;
  /** All source files that were consolidated */
  sources: string[];
  /** Merged frontmatter from all sources */
  frontmatter: Record<string, unknown>;
  /** Warnings encountered during consolidation */
  warnings: string[];
}

/**
 * Options for hub consolidation
 */
export interface ConsolidationOptions {
  /** Whether to include frontmatter in the result */
  includeFrontmatter?: boolean;
  /** Whether to recursively consolidate nested hubs */
  recursive?: boolean;
  /** Maximum recursion depth for nested hubs */
  maxDepth?: number;
}

/**
 * Consolidate a hub note and its children into a single document
 */
export async function consolidateHub(
  vaultPath: string,
  hubPath: string,
  options: ConsolidationOptions = {}
): Promise<ConsolidationResult> {
  const { includeFrontmatter = true, recursive = true, maxDepth = 3 } = options;
  const warnings: string[] = [];
  const sources: string[] = [hubPath];

  // Get hub info
  const hubInfo = await getHubInfo(vaultPath, hubPath, { validateChildren: true });
  if (!hubInfo) {
    throw new Error(`Hub not found: ${hubPath}`);
  }

  // Read hub content
  const hubFullPath = join(vaultPath, hubPath);
  const hubRaw = await readFile(hubFullPath, 'utf-8');
  const { frontmatter: hubFrontmatter, body: hubBody } = parseFrontmatter(hubRaw);

  // Extract the content before Knowledge Map section
  const hubContent = extractHubIntro(hubBody);

  // Get ordered children
  const orderedChildren = await getOrderedChildren(vaultPath, hubInfo, hubPath);

  // Build consolidated content
  let content = hubContent;

  // Process each child
  for (const child of orderedChildren) {
    const childResult = await processChild(
      vaultPath,
      child,
      hubPath,
      recursive,
      maxDepth,
      1
    );

    if (childResult.success) {
      content += `\n\n${childResult.content}`;
      sources.push(...childResult.sources);
      warnings.push(...childResult.warnings);
    } else {
      warnings.push(`Failed to process child: ${child.path} - ${childResult.error}`);
    }
  }

  // Merge frontmatter
  const mergedFrontmatter = includeFrontmatter
    ? mergeHubFrontmatter(hubFrontmatter as Record<string, unknown>, hubInfo)
    : {};

  return {
    content: content.trim(),
    title: hubInfo.title,
    sources,
    frontmatter: mergedFrontmatter,
    warnings,
  };
}

/**
 * Extract the introduction content from a hub (everything before Knowledge Map)
 */
function extractHubIntro(body: string): string {
  const lines = body.split('\n');
  const introLines: string[] = [];
  let hitKnowledgeMap = false;

  for (const line of lines) {
    if (line.startsWith('## Knowledge Map')) {
      hitKnowledgeMap = true;
      continue;
    }
    if (hitKnowledgeMap) {
      // Skip everything in and after Knowledge Map section
      // until we hit another H2 that's not Related
      if (line.startsWith('## ') && !line.startsWith('## Related')) {
        // We've passed Knowledge Map, include remaining sections
        introLines.push(line);
        hitKnowledgeMap = false;
      }
      continue;
    }
    introLines.push(line);
  }

  return introLines.join('\n').trim();
}

/**
 * Get children in order (by Knowledge Map order or alphabetically)
 */
async function getOrderedChildren(
  vaultPath: string,
  hubInfo: HubInfo,
  hubPath: string
): Promise<HubChild[]> {
  const hubDir = dirname(hubPath);

  // Use Knowledge Map order from hubInfo
  const orderedChildren: HubChild[] = [];

  for (const child of hubInfo.children) {
    // Resolve the child path
    let resolvedPath = child.path;

    // If path doesn't include extension, add .md
    if (!resolvedPath.endsWith('.md')) {
      resolvedPath = `${resolvedPath}.md`;
    }

    // If path doesn't include directory, use hub's directory
    if (!resolvedPath.includes('/')) {
      resolvedPath = join(hubDir, resolvedPath);
    }

    const childFullPath = join(vaultPath, resolvedPath);

    if (existsSync(childFullPath)) {
      orderedChildren.push({
        ...child,
        path: resolvedPath,
      });
    }
  }

  return orderedChildren;
}

/**
 * Result of processing a child note
 */
interface ChildProcessResult {
  success: boolean;
  content?: string;
  sources: string[];
  warnings: string[];
  error?: string;
}

/**
 * Process a single child note for consolidation
 */
async function processChild(
  vaultPath: string,
  child: HubChild,
  hubPath: string,
  recursive: boolean,
  maxDepth: number,
  currentDepth: number
): Promise<ChildProcessResult> {
  const warnings: string[] = [];
  const sources: string[] = [];

  try {
    const childFullPath = join(vaultPath, child.path);

    if (!existsSync(childFullPath)) {
      return {
        success: false,
        sources: [],
        warnings: [],
        error: `File not found: ${child.path}`,
      };
    }

    const childRaw = await readFile(childFullPath, 'utf-8');
    const { frontmatter, body } = parseFrontmatter(childRaw);

    sources.push(child.path);

    // Check if child is itself a hub (for recursive processing)
    const childType = (frontmatter as Record<string, unknown>).type as string | undefined;
    const isHub = childType?.endsWith('_hub');

    if (isHub && recursive && currentDepth < maxDepth) {
      // Recursively consolidate nested hub
      try {
        const nestedResult = await consolidateHub(vaultPath, child.path, {
          includeFrontmatter: false,
          recursive: true,
          maxDepth,
        });

        // Adjust header levels for nested content
        const adjustedContent = adjustHeaderLevels(nestedResult.content, 1);

        sources.push(...nestedResult.sources.filter((s) => s !== child.path));
        warnings.push(...nestedResult.warnings);

        return {
          success: true,
          content: adjustedContent,
          sources,
          warnings,
        };
      } catch (error) {
        warnings.push(`Failed to consolidate nested hub ${child.path}: ${error instanceof Error ? error.message : String(error)}`);
        // Fall through to process as regular note
      }
    }

    // Process as regular child note
    // Convert H1 to H2 (child content becomes a section under the hub)
    let processedContent = body;
    const lines = processedContent.split('\n');
    const resultLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith('# ') && !line.startsWith('## ')) {
        // Convert H1 to H2
        resultLines.push(`## ${line.slice(2)}`);
      } else {
        resultLines.push(line);
      }
    }

    processedContent = resultLines.join('\n').trim();

    // Remove "See also" links back to the hub
    processedContent = removeHubBacklinks(processedContent, hubPath);

    return {
      success: true,
      content: processedContent,
      sources,
      warnings,
    };
  } catch (error) {
    return {
      success: false,
      sources,
      warnings,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Remove backlinks to the hub from child content
 */
function removeHubBacklinks(content: string, hubPath: string): string {
  // Extract hub title from path (remove .md and get basename)
  const hubTitle = hubPath.replace(/\.md$/, '').split('/').pop() || '';

  // Remove "See also: [[HubTitle]]" and similar patterns
  const seeAlsoRegex = new RegExp(
    `See\\s+also:\\s*\\[\\[${escapeRegex(hubTitle)}\\]\\][^\\n]*\\n?`,
    'gi'
  );

  return content.replace(seeAlsoRegex, '').trim();
}

/**
 * Merge hub frontmatter
 */
function mergeHubFrontmatter(
  hubFm: Record<string, unknown>,
  hubInfo: HubInfo
): Record<string, unknown> {
  // Create a clean version of frontmatter suitable for export
  const merged: Record<string, unknown> = {
    title: hubInfo.title,
  };

  // Copy relevant fields
  const copyFields = ['domain', 'tags', 'created', 'modified', 'source', 'confidence'];
  for (const field of copyFields) {
    if (hubFm[field] !== undefined) {
      merged[field] = hubFm[field];
    }
  }

  // Remove hub-specific fields
  delete merged.children_count;
  delete merged.palace;

  // Update type to remove _hub suffix
  const type = hubFm.type as string | undefined;
  if (type?.endsWith('_hub')) {
    merged.type = type.replace(/_hub$/, '');
  } else if (type) {
    merged.type = type;
  }

  return merged;
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
