/**
 * palace_improve - Intelligently update existing notes
 *
 * Provides multiple update modes beyond simple replace/append.
 * Tracks version history and maintains graph integrity.
 * Supports atomic note splitting when content exceeds limits.
 */

import { join, dirname, basename } from 'path';
import { readFile, writeFile, unlink, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolResult } from '../types/index.js';
import type { PalaceImproveOutput, ImprovementMode, AtomicSplitResult } from '../types/intent.js';
import { palaceImproveInputSchema } from '../types/intent.js';
import { parseFrontmatter, stringifyFrontmatter } from '../utils/frontmatter.js';
import { stripWikiLinks } from '../utils/markdown.js';
import { buildCompleteIndex, scanForMatches, autolinkContent } from '../services/autolink/index.js';
import { getIndexManager } from '../services/index/index.js';
import { indexNote, removeFromIndex } from '../services/index/sync.js';
import { readNote } from '../services/vault/reader.js';
import { resolveVaultParam, enforceWriteAccess, getVaultResultInfo } from '../utils/vault-param.js';
import { logger } from '../utils/logger.js';
import { shouldSplit, splitContent, createHub, createChildNote, getHubInfo, addChild, getAccurateChildrenCount, updateChildrenCount } from '../services/atomic/index.js';
import { isHubType } from '../types/note-types.js';
import { generateReplaceCleanupSuggestions } from '../services/operations/index.js';
import { saveVersion } from '../services/history/storage.js';

// Tool definition
export const improveTool: Tool = {
  name: 'palace_improve',
  description:
    'Intelligently update existing notes with multiple modes: append, append_section (add new section), update_section (update specific section), merge, replace, frontmatter only, or consolidate (merge children back into hub). Maintains version tracking and auto-links new content.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the note to improve (relative to vault root)',
      },
      mode: {
        type: 'string',
        enum: ['append', 'append_section', 'update_section', 'merge', 'replace', 'frontmatter', 'consolidate'],
        description:
          'Update mode: append (add to end), append_section (add new H2 section), update_section (update specific section), merge (intelligent merge), replace (full replacement), frontmatter (metadata only), consolidate (merge children back into hub)',
      },
      content: {
        type: 'string',
        description: 'New content to add/update (not needed for frontmatter or consolidate mode)',
      },
      section: {
        type: 'string',
        description: 'Section name (H2) for update_section mode',
      },
      frontmatter: {
        type: 'object',
        description: 'Frontmatter fields to update (merged with existing)',
      },
      autolink: {
        type: 'boolean',
        description: 'Auto-link new content (default: true)',
      },
      auto_split: {
        type: 'boolean',
        description: 'Automatically split into hub + children if content exceeds atomic limits (default: true)',
      },
      author: {
        type: 'string',
        description: 'Author of this update (e.g., "ai:claude", "human"). Added to authors array in frontmatter.',
      },
      vault: {
        type: 'string',
        description: 'Vault alias (defaults to default vault)',
      },
      delete_children: {
        type: 'boolean',
        description: 'For consolidate mode: delete child files after merging (default: true)',
      },
    },
    required: ['path', 'mode'],
  },
};

// Tool handler
export async function improveHandler(args: Record<string, unknown>): Promise<ToolResult<PalaceImproveOutput>> {
  // Validate input
  const parseResult = palaceImproveInputSchema.safeParse(args);
  if (!parseResult.success) {
    return {
      success: false,
      error: parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      code: 'VALIDATION_ERROR',
    };
  }

  const {
    path,
    mode,
    content,
    section,
    frontmatter: frontmatterUpdates,
    autolink = true,
    auto_split = true,
    author,
    vault: vaultParam,
    delete_children = true, // Phase 022: Default to deleting children after consolidation
  } = parseResult.data;

  // Validate required fields for certain modes
  // Note: consolidate and frontmatter modes don't require content
  if (['append', 'append_section', 'update_section', 'replace', 'merge'].includes(mode) && !content) {
    return {
      success: false,
      error: `Content is required for ${mode} mode`,
      code: 'VALIDATION_ERROR',
    };
  }

  if (mode === 'update_section' && !section) {
    return {
      success: false,
      error: 'Section name is required for update_section mode',
      code: 'VALIDATION_ERROR',
    };
  }

  try {
    // Resolve and validate vault
    const vault = resolveVaultParam(vaultParam);
    enforceWriteAccess(vault);

    const fullPath = join(vault.path, path);

    if (!existsSync(fullPath)) {
      return {
        success: false,
        error: `Note not found: ${path}`,
        code: 'NOT_FOUND',
      };
    }

    // Read existing note
    const existingContent = await readFile(fullPath, 'utf-8');
    const { frontmatter: existingFrontmatter, body: existingBody } = parseFrontmatter(existingContent);

    // Track changes
    const changes: PalaceImproveOutput['changes'] = {};

    // Process content with auto-linking if applicable
    let processedContent = content;
    if (content && autolink) {
      try {
        const manager = getIndexManager();
        const db = await manager.getIndex(vault.alias);
        const { index } = await buildCompleteIndex(db);
        const matches = scanForMatches(content, index);
        if (matches.length > 0) {
          const result = autolinkContent(content, matches);
          processedContent = result.linkedContent;
          changes.links_added = result.linksAdded.length;
        }
      } catch (linkError) {
        logger.warn('Auto-linking failed, proceeding without', linkError);
      }
    }

    // Apply the update based on mode
    let newBody: string;
    switch (mode) {
      case 'append':
        newBody = applyAppend(existingBody, processedContent || '');
        changes.lines_added = (processedContent || '').split('\n').length;
        break;

      case 'append_section':
        newBody = applyAppendSection(existingBody, processedContent || '');
        changes.lines_added = (processedContent || '').split('\n').length + 2; // +2 for blank line and heading
        break;

      case 'update_section': {
        const sectionResult = applyUpdateSection(existingBody, section || '', processedContent || '');
        newBody = sectionResult.content;
        changes.sections_modified = [section || ''];
        changes.lines_added = sectionResult.linesAdded;
        changes.lines_removed = sectionResult.linesRemoved;
        break;
      }

      case 'merge':
        newBody = applyMerge(existingBody, processedContent || '');
        changes.lines_added = countNewLines(existingBody, newBody);
        break;

      case 'replace':
        newBody = processedContent || '';
        changes.lines_removed = existingBody.split('\n').length;
        changes.lines_added = newBody.split('\n').length;
        break;

      case 'frontmatter':
        newBody = existingBody;
        break;

      case 'consolidate': {
        // Phase 022: Merge children back into hub
        const consolidateResult = await handleConsolidate(
          path,
          fullPath,
          existingFrontmatter as Record<string, unknown>,
          existingBody,
          vault,
          delete_children,
          author
        );
        return consolidateResult;
      }

      default:
        return {
          success: false,
          error: `Unknown mode: ${mode}`,
          code: 'INVALID_MODE',
        };
    }

    // Update frontmatter
    const now = new Date().toISOString();
    const newFrontmatter = existingFrontmatter as unknown as Record<string, unknown>;

    // Apply frontmatter updates
    if (frontmatterUpdates) {
      Object.assign(newFrontmatter, frontmatterUpdates);
      changes.frontmatter_updated = Object.keys(frontmatterUpdates);
    }

    // Add author to authors array if provided
    if (author) {
      const existingAuthors = (newFrontmatter.authors as string[]) || [];
      if (!existingAuthors.includes(author)) {
        newFrontmatter.authors = [...existingAuthors, author];
        changes.frontmatter_updated = [...(changes.frontmatter_updated || []), 'authors'];
      }
    }

    // Always update modified and increment version
    newFrontmatter.modified = now;

    // Increment palace version
    const palace = (newFrontmatter.palace as Record<string, unknown>) || {};
    const currentVersion = (palace.version as number) || 1;
    newFrontmatter.palace = {
      ...palace,
      version: currentVersion + 1,
    };

    // Check if updated content exceeds atomic limits
    const atomicConfig = vault.config.atomic;
    const shouldAutoSplit = atomicConfig.auto_split && auto_split && mode !== 'frontmatter';

    if (shouldAutoSplit) {
      const splitDecision = shouldSplit(newBody, atomicConfig);

      if (splitDecision.shouldSplit) {
        // Content exceeds limits - perform auto-split
        logger.info(
          `Content exceeds atomic limits: ${splitDecision.reason}. Auto-splitting...`
        );

        // Extract title from existing note or frontmatter
        const noteTitle = (newFrontmatter.title as string) ||
          extractTitleFromContent(newBody) ||
          basename(path, '.md');

        // Get domain from frontmatter
        const domain = (newFrontmatter.domain as string[]) || [];

        // Perform the split and return
        const splitResult = await handleImproveSplit(
          noteTitle,
          newBody,
          fullPath,
          path,
          vault,
          newFrontmatter,
          domain,
          currentVersion + 1,
          mode,
          changes
        );

        return splitResult;
      }
    } else if (mode !== 'frontmatter') {
      // Check for warning only (when auto_split is disabled)
      const splitDecision = shouldSplit(newBody, atomicConfig);
      if (splitDecision.shouldSplit) {
        changes.atomic_warning = `Content exceeds atomic limits (${splitDecision.metrics.lineCount} lines, ${splitDecision.metrics.sectionCount} sections). Set auto_split: true to auto-split.`;
      }
    }

    // Build final content
    const finalContent = stringifyFrontmatter(newFrontmatter, newBody.trim());

    // Phase 028: Save version before modifying
    const palaceDir = join(vault.path, '.palace');
    try {
      await saveVersion(
        palaceDir,
        path,
        existingContent,
        'improve',
        mode,
        vault.config.history
      );
    } catch (versionError) {
      logger.warn(`Failed to save version for ${path}:`, versionError);
    }

    // Write the updated file
    await writeFile(fullPath, finalContent, 'utf-8');

    // Re-index the note
    const manager = getIndexManager();
    const db = await manager.getIndex(vault.alias);
    const updatedNote = await readNote(path, {
      vaultPath: vault.path,
      ignoreConfig: vault.config.ignore,
    });
    if (updatedNote) {
      indexNote(db, updatedNote);
    }

    // Reconcile hub Knowledge Map after content changes
    // Skip for consolidate (handled separately) and frontmatter (no content changes)
    const noteType = (newFrontmatter.type as string) ?? '';
    if (isHubType(noteType) && mode !== 'frontmatter') {
      try {
        const reconciled = await reconcileHubChildren(vault, path);
        if (reconciled > 0) {
          changes.children_reconciled = reconciled;
          logger.info(`Reconciled ${reconciled} orphaned children for hub: ${path}`);
        }
      } catch (reconcileError) {
        logger.warn(`Hub reconciliation failed for ${path}:`, reconcileError);
      }
    }

    const vaultInfo = getVaultResultInfo(vault);

    // Phase 023: Generate cleanup suggestions for replace mode
    let cleanupSuggestions;
    if (mode === 'replace') {
      const wasHub = typeof existingFrontmatter.type === 'string' &&
                     existingFrontmatter.type.endsWith('_hub');
      cleanupSuggestions = generateReplaceCleanupSuggestions(db, path, wasHub);
    }

    return {
      success: true,
      data: {
        success: true,
        vault: vaultInfo.vault,
        vaultPath: vaultInfo.vault_path,
        path,
        mode,
        changes,
        version: currentVersion + 1,
        message: buildMessage(mode, changes),
        ...(cleanupSuggestions && { cleanup_suggestions: cleanupSuggestions }),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      code: 'IMPROVE_ERROR',
    };
  }
}

/**
 * Append content to end of note
 */
function applyAppend(existing: string, newContent: string): string {
  return `${existing.trim()}\n\n${newContent}`;
}

/**
 * Append content as a new H2 section
 */
function applyAppendSection(existing: string, newContent: string): string {
  // Extract section title from content if it starts with ##
  const lines = newContent.split('\n');
  const firstLine = lines[0] || '';

  if (firstLine.startsWith('## ')) {
    // Content already has a heading
    return `${existing.trim()}\n\n${newContent}`;
  }

  // Add a generic section heading
  return `${existing.trim()}\n\n## Additional Information\n\n${newContent}`;
}

/**
 * Update a specific section by name
 */
function applyUpdateSection(
  existing: string,
  sectionName: string,
  newContent: string
): { content: string; linesAdded: number; linesRemoved: number } {
  // Strip wiki-links from section name to prevent heading corruption
  const cleanSectionName = stripWikiLinks(sectionName);
  const lines = existing.split('\n');
  const sectionRegex = new RegExp(`^##\\s+${escapeRegex(cleanSectionName)}\\s*$`, 'i');

  let sectionStart = -1;
  let sectionEnd = lines.length;

  // Find the section
  for (let i = 0; i < lines.length; i++) {
    if (sectionRegex.test(lines[i] || '')) {
      sectionStart = i;
    } else if (sectionStart >= 0 && (lines[i] || '').startsWith('## ')) {
      sectionEnd = i;
      break;
    }
  }

  if (sectionStart === -1) {
    // Section not found - append as new section
    return {
      content: `${existing.trim()}\n\n## ${cleanSectionName}\n\n${newContent}`,
      linesAdded: newContent.split('\n').length + 3,
      linesRemoved: 0,
    };
  }

  // Replace section content
  const before = lines.slice(0, sectionStart + 1);
  const after = lines.slice(sectionEnd);
  const linesRemoved = sectionEnd - sectionStart - 1;

  const result = [...before, '', newContent, '', ...after].join('\n');

  return {
    content: result,
    linesAdded: newContent.split('\n').length,
    linesRemoved,
  };
}

/**
 * Intelligently merge new content with existing
 */
function applyMerge(existing: string, newContent: string): string {
  // Simple merge strategy: append new content, removing duplicate sections
  const existingSections = extractSections(existing);
  const newSections = extractSections(newContent);

  // Find sections in new content that don't exist
  const sectionsToAdd: string[] = [];

  for (const [name, content] of Object.entries(newSections)) {
    if (!existingSections[name]) {
      sectionsToAdd.push(`## ${name}\n\n${content}`);
    }
  }

  if (sectionsToAdd.length === 0) {
    // No new sections - just append
    return `${existing.trim()}\n\n${newContent}`;
  }

  // Add new sections
  return `${existing.trim()}\n\n${sectionsToAdd.join('\n\n')}`;
}

/**
 * Extract sections from content
 */
function extractSections(content: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const lines = content.split('\n');

  let currentSection = '';
  let currentContent: string[] = [];

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (currentSection) {
        sections[currentSection] = currentContent.join('\n').trim();
      }
      // Strip wiki-links from section titles
      currentSection = stripWikiLinks(line.replace(/^##\s+/, ''));
      currentContent = [];
    } else if (currentSection) {
      currentContent.push(line);
    }
  }

  if (currentSection) {
    sections[currentSection] = currentContent.join('\n').trim();
  }

  return sections;
}

/**
 * Count new lines added
 */
function countNewLines(before: string, after: string): number {
  const beforeLines = before.split('\n').length;
  const afterLines = after.split('\n').length;
  return Math.max(0, afterLines - beforeLines);
}

/**
 * Escape regex special characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build success message
 */
function buildMessage(mode: ImprovementMode, changes: PalaceImproveOutput['changes'], splitResult?: AtomicSplitResult): string {
  const parts = [`Updated note (${mode} mode)`];

  if (splitResult) {
    parts.push(`auto-split into hub + ${splitResult.children_count} children`);
  }

  if (changes.lines_added) {
    parts.push(`+${changes.lines_added} lines`);
  }
  if (changes.lines_removed) {
    parts.push(`-${changes.lines_removed} lines`);
  }
  if (changes.sections_modified?.length) {
    parts.push(`sections: ${changes.sections_modified.join(', ')}`);
  }
  if (changes.links_added) {
    parts.push(`${changes.links_added} auto-links`);
  }
  if (changes.frontmatter_updated?.length) {
    parts.push(`frontmatter: ${changes.frontmatter_updated.join(', ')}`);
  }
  if (changes.atomic_warning) {
    parts.push(`WARNING: ${changes.atomic_warning}`);
  }

  return parts.join(' | ');
}

/**
 * Reconcile hub Knowledge Map with actual children on disk.
 * Finds orphaned children (files in directory not in Knowledge Map) and adds them.
 * Updates children_count if stale.
 *
 * @returns Number of children reconciled (added to Knowledge Map)
 */
async function reconcileHubChildren(
  vault: ReturnType<typeof resolveVaultParam>,
  hubPath: string
): Promise<number> {
  const countResult = await getAccurateChildrenCount(vault.path, hubPath);

  let reconciled = 0;

  // Add orphaned children to the Knowledge Map
  if (countResult.orphanedChildren.length > 0) {
    for (const orphanPath of countResult.orphanedChildren) {
      const orphanTitle = basename(orphanPath, '.md');
      const result = await addChild(vault.path, hubPath, {
        path: orphanPath,
        title: orphanTitle,
      });
      if (result.success) {
        reconciled++;
      }
    }
  }

  // Update children_count if stale (including any newly added children)
  if (reconciled > 0 || !countResult.isAccurate) {
    const newCount = countResult.actualCount + reconciled;
    await updateChildrenCount(vault.path, hubPath, newCount);

    // Re-index the hub since its content changed
    const manager = getIndexManager();
    const db = await manager.getIndex(vault.alias);
    const updatedNote = await readNote(hubPath, {
      vaultPath: vault.path,
      ignoreConfig: vault.config.ignore,
    });
    if (updatedNote) {
      indexNote(db, updatedNote);
    }
  }

  return reconciled;
}

/**
 * Extract title from content (first H1 heading)
 */
function extractTitleFromContent(content: string): string | null {
  const lines = content.split('\n');
  for (const line of lines) {
    if (line.startsWith('# ') && !line.startsWith('## ')) {
      return stripWikiLinks(line.replace(/^#\s+/, '').trim());
    }
  }
  return null;
}

/**
 * Handle atomic splitting when improved content exceeds limits
 */
async function handleImproveSplit(
  title: string,
  content: string,
  originalFullPath: string,
  originalRelativePath: string,
  vault: ReturnType<typeof resolveVaultParam>,
  frontmatter: Record<string, unknown>,
  domain: string[],
  newVersion: number,
  mode: ImprovementMode,
  changes: PalaceImproveOutput['changes']
): Promise<ToolResult<PalaceImproveOutput>> {
  const manager = getIndexManager();
  const db = await manager.getIndex(vault.alias);

  // Phase 018: With title-style filenames, check if original note is a hub via frontmatter type
  const originalDir = dirname(originalRelativePath);
  const originalFilename = basename(originalRelativePath, '.md');
  const isOriginalHub = frontmatter?.type?.toString().endsWith('_hub') ?? false;

  // Determine target directory for split content
  let targetDir: string;
  if (originalDir === '.' || originalDir === '') {
    // File is at vault root - create a folder based on the filename (the title)
    targetDir = originalFilename;
  } else if (isOriginalHub) {
    // Original file IS a hub - split in place (same directory)
    targetDir = originalDir;
  } else {
    // Original file is NOT a hub (e.g., a stub or regular note)
    // Create a subdirectory based on the note's title to keep things organized
    targetDir = join(originalDir, originalFilename);
    logger.info(`Creating subdirectory for split: ${targetDir}`);
  }

  // Split the content
  // Phase 018: hubFilename removed - derived from title automatically
  const splitOptions: Parameters<typeof splitContent>[1] = {
    targetDir,
    title,
    originalFrontmatter: frontmatter,
  };
  if (domain.length > 0) {
    splitOptions.domain = domain;
  }
  const splitResult = splitContent(content, splitOptions);

  const createdPaths: string[] = [];

  // Phase 022: Extract intro/overview content from split result for hub preservation
  // The hub.content has format: "# Title\n\n{intro}\n\n## Knowledge Map\n..."
  // Extract the intro between title and Knowledge Map
  const hubContentLines = splitResult.hub.content.split('\n');
  const introLines: string[] = [];
  let foundTitle = false;
  for (const line of hubContentLines) {
    if (line.startsWith('# ') && !foundTitle) {
      foundTitle = true;
      continue;
    }
    if (line.startsWith('## Knowledge Map')) {
      break;
    }
    if (foundTitle) {
      introLines.push(line);
    }
  }
  const hubOverview = introLines.join('\n').trim();

  // Create the hub note
  // Phase 018: hubFilename removed - derived from title automatically
  const hubOptions: Parameters<typeof createHub>[4] = {
    originalFrontmatter: frontmatter,
    // Phase 022: Pass overview to preserve intro content
    overview: hubOverview,
  };
  if (domain.length > 0) {
    hubOptions.domain = domain;
  }
  const hubResult = await createHub(
    vault.path,
    targetDir,
    title,
    splitResult.children.map((c) => ({
      path: c.relativePath,
      title: c.title,
      summary: c.fromSection,
    })),
    hubOptions
  );

  if (hubResult.success) {
    createdPaths.push(hubResult.path);

    // Index the hub
    const hubNote = await readNote(hubResult.path, {
      vaultPath: vault.path,
      ignoreConfig: vault.config.ignore,
    });
    if (hubNote) {
      indexNote(db, hubNote);
    }
  }

  // Create child notes
  for (const child of splitResult.children) {
    // Ensure parent directory exists
    const childFullPath = join(vault.path, child.relativePath);
    await mkdir(dirname(childFullPath), { recursive: true });

    const childOptions: Parameters<typeof createChildNote>[5] = {
      originalFrontmatter: frontmatter,
    };
    if (domain.length > 0) {
      childOptions.domain = domain;
    }
    const childResult = await createChildNote(
      vault.path,
      child.relativePath,
      child.title,
      child.content,
      splitResult.hub.relativePath,
      childOptions
    );

    if (childResult.success) {
      createdPaths.push(childResult.path);

      // Index the child
      const childNote = await readNote(childResult.path, {
        vaultPath: vault.path,
        ignoreConfig: vault.config.ignore,
      });
      if (childNote) {
        indexNote(db, childNote);
      }
    }
  }

  // Delete the original file if it's not the hub file
  // Phase 018: Compare with actual hub path from split result (title-based filename)
  if (originalRelativePath !== splitResult.hub.relativePath) {
    try {
      // Remove from index first
      removeFromIndex(db, originalRelativePath);

      // Delete the file
      if (existsSync(originalFullPath)) {
        await unlink(originalFullPath);
        logger.info(`Deleted original file after split: ${originalRelativePath}`);
      }
    } catch (deleteError) {
      logger.warn(`Failed to delete original file: ${originalRelativePath}`, deleteError);
    }
  }

  const vaultInfo = getVaultResultInfo(vault);
  const atomicSplitResult: AtomicSplitResult = {
    hub_path: splitResult.hub.relativePath,
    children_paths: splitResult.children.map((c) => c.relativePath),
    children_count: splitResult.children.length,
  };

  return {
    success: true,
    data: {
      success: true,
      vault: vaultInfo.vault,
      vaultPath: vaultInfo.vault_path,
      path: splitResult.hub.relativePath, // Return hub path as the new path
      mode,
      changes,
      version: newVersion,
      message: buildMessage(mode, changes, atomicSplitResult),
      split_result: atomicSplitResult,
    },
  };
}

/**
 * Phase 022: Handle consolidation of hub children back into a single note
 *
 * This operation:
 * 1. Reads a hub note and its children
 * 2. Merges child content back into the hub as H2 sections
 * 3. Updates frontmatter (removes _hub suffix, updates metadata)
 * 4. Optionally deletes child files
 */
async function handleConsolidate(
  relativePath: string,
  fullPath: string,
  existingFrontmatter: Record<string, unknown>,
  existingBody: string,
  vault: ReturnType<typeof resolveVaultParam>,
  deleteChildren: boolean,
  author?: string
): Promise<ToolResult<PalaceImproveOutput>> {
  const manager = getIndexManager();
  const db = await manager.getIndex(vault.alias);

  // Check if this is a hub note
  const noteType = (existingFrontmatter.type as string) ?? '';
  const isHub = noteType.endsWith('_hub');

  if (!isHub) {
    return {
      success: false,
      error: `Cannot consolidate: ${relativePath} is not a hub note (type: ${noteType || 'unknown'})`,
      code: 'NOT_A_HUB',
    };
  }

  // Get hub info to find children
  const hubInfo = await getHubInfo(vault.path, relativePath);

  if (!hubInfo) {
    return {
      success: false,
      error: `Failed to read hub info for: ${relativePath}`,
      code: 'HUB_READ_ERROR',
    };
  }

  if (hubInfo.children.length === 0) {
    return {
      success: false,
      error: `Hub has no children to consolidate: ${relativePath}`,
      code: 'NO_CHILDREN',
    };
  }

  // Track changes
  const changes: PalaceImproveOutput['changes'] = {};
  const childrenMerged: string[] = [];
  const childrenDeleted: string[] = [];
  const sectionsAdded: string[] = [];

  // Extract the intro/overview content from the hub (everything before ## Knowledge Map)
  const hubLines = existingBody.split('\n');
  const introLines: string[] = [];
  let inKnowledgeMap = false;

  for (const line of hubLines) {
    if (line.startsWith('## Knowledge Map')) {
      inKnowledgeMap = true;
      continue;
    }
    if (inKnowledgeMap && line.startsWith('## ')) {
      // After Knowledge Map, skip any other sections like ## Related
      continue;
    }
    if (!inKnowledgeMap) {
      introLines.push(line);
    }
  }

  // Start building the consolidated content
  let consolidatedBody = introLines.join('\n').trim();
  let linesAdded = 0;

  // Read and merge each child's content
  for (const child of hubInfo.children) {
    try {
      // Try to find the child file
      // The child.path might be just the title, so we need to resolve it
      let childPath = child.path;

      // If path doesn't include extension, add .md
      if (!childPath.endsWith('.md')) {
        childPath = `${childPath}.md`;
      }

      // If path doesn't include directory, use the hub's directory
      if (!childPath.includes('/')) {
        childPath = join(dirname(relativePath), childPath);
      }

      const childFullPath = join(vault.path, childPath);

      if (!existsSync(childFullPath)) {
        logger.warn(`Child file not found: ${childPath}`);
        continue;
      }

      // Read the child content
      const childContent = await readFile(childFullPath, 'utf-8');
      const { body: childBody } = parseFrontmatter(childContent);

      // Convert child's H1 to H2 and add to consolidated body
      const childLines = childBody.split('\n');
      const processedChildLines: string[] = [];

      for (const line of childLines) {
        if (line.startsWith('# ') && !line.startsWith('## ')) {
          // Convert H1 to H2
          processedChildLines.push(`## ${line.slice(2)}`);
        } else {
          processedChildLines.push(line);
        }
      }

      const childSection = processedChildLines.join('\n').trim();
      consolidatedBody += `\n\n${childSection}`;
      linesAdded += processedChildLines.length;

      childrenMerged.push(childPath);
      sectionsAdded.push(child.title);

      // Delete the child file if requested
      if (deleteChildren) {
        try {
          removeFromIndex(db, childPath);
          await unlink(childFullPath);
          childrenDeleted.push(childPath);
          logger.info(`Deleted child file: ${childPath}`);
        } catch (deleteError) {
          logger.warn(`Failed to delete child file: ${childPath}`, deleteError);
        }
      }
    } catch (childError) {
      logger.warn(`Failed to process child: ${child.path}`, childError);
    }
  }

  if (childrenMerged.length === 0) {
    return {
      success: false,
      error: 'No children could be merged - all child files were missing or unreadable',
      code: 'CONSOLIDATION_FAILED',
    };
  }

  // Update frontmatter
  const now = new Date().toISOString();
  const newFrontmatter = { ...existingFrontmatter };

  // Remove _hub suffix from type
  newFrontmatter.type = noteType.replace(/_hub$/, '');

  // Remove children_count as it's no longer a hub
  delete newFrontmatter.children_count;

  // Update timestamps
  newFrontmatter.modified = now;

  // Increment version
  const palace = (newFrontmatter.palace as Record<string, unknown>) || {};
  const currentVersion = (palace.version as number) || 1;
  newFrontmatter.palace = {
    ...palace,
    version: currentVersion + 1,
  };

  // Add author if provided
  if (author) {
    const existingAuthors = (newFrontmatter.authors as string[]) || [];
    if (!existingAuthors.includes(author)) {
      newFrontmatter.authors = [...existingAuthors, author];
    }
  }

  // Build final content
  const finalContent = stringifyFrontmatter(newFrontmatter, consolidatedBody.trim());

  // Write the consolidated file
  await writeFile(fullPath, finalContent, 'utf-8');

  // Re-index the note
  const updatedNote = await readNote(relativePath, {
    vaultPath: vault.path,
    ignoreConfig: vault.config.ignore,
  });
  if (updatedNote) {
    indexNote(db, updatedNote);
  }

  // Update changes tracking
  changes.lines_added = linesAdded;
  changes.children_consolidated = childrenMerged.length;
  changes.children_deleted = childrenDeleted;
  changes.frontmatter_updated = ['type', 'modified'];

  const vaultInfo = getVaultResultInfo(vault);
  return {
    success: true,
    data: {
      success: true,
      vault: vaultInfo.vault,
      vaultPath: vaultInfo.vault_path,
      path: relativePath,
      mode: 'consolidate',
      changes,
      version: currentVersion + 1,
      message: `Consolidated ${childrenMerged.length} children into hub | ${childrenDeleted.length} files deleted | Type changed from ${noteType} to ${newFrontmatter.type}`,
      consolidation_result: {
        children_merged: childrenMerged,
        children_deleted: childrenDeleted,
        sections_added: sectionsAdded,
      },
    },
  };
}
