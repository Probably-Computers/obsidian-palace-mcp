/**
 * palace_improve - Intelligently update existing notes
 *
 * Provides multiple update modes beyond simple replace/append.
 * Tracks version history and maintains graph integrity.
 * Supports atomic note splitting when content exceeds limits.
 */

import { join } from 'path';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolResult } from '../types/index.js';
import type { PalaceImproveOutput, ImprovementMode } from '../types/intent.js';
import { palaceImproveInputSchema } from '../types/intent.js';
import { parseFrontmatter, stringifyFrontmatter } from '../utils/frontmatter.js';
import { buildCompleteIndex, scanForMatches, autolinkContent } from '../services/autolink/index.js';
import { getIndexManager } from '../services/index/index.js';
import { indexNote } from '../services/index/sync.js';
import { readNote } from '../services/vault/reader.js';
import { resolveVaultParam, enforceWriteAccess, getVaultResultInfo } from '../utils/vault-param.js';
import { logger } from '../utils/logger.js';
import { shouldSplit } from '../services/atomic/index.js';

// Tool definition
export const improveTool: Tool = {
  name: 'palace_improve',
  description:
    'Intelligently update existing notes with multiple modes: append, append_section (add new section), update_section (update specific section), merge, replace, or frontmatter only. Maintains version tracking and auto-links new content.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the note to improve (relative to vault root)',
      },
      mode: {
        type: 'string',
        enum: ['append', 'append_section', 'update_section', 'merge', 'replace', 'frontmatter'],
        description:
          'Update mode: append (add to end), append_section (add new H2 section), update_section (update specific section), merge (intelligent merge), replace (full replacement), frontmatter (metadata only)',
      },
      content: {
        type: 'string',
        description: 'New content to add/update (not needed for frontmatter mode)',
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
      author: {
        type: 'string',
        description: 'Author of this update (e.g., "ai:claude", "human"). Added to authors array in frontmatter.',
      },
      vault: {
        type: 'string',
        description: 'Vault alias (defaults to default vault)',
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
    author,
    vault: vaultParam,
  } = parseResult.data;

  // Validate required fields for certain modes
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
    if (atomicConfig.auto_split && mode !== 'frontmatter') {
      const splitDecision = shouldSplit(newBody, atomicConfig);

      if (splitDecision.shouldSplit) {
        // Content now exceeds limits - warn but proceed
        // A full conversion to hub would require separate tool or flag
        logger.warn(
          `Updated content exceeds atomic limits: ${splitDecision.reason}. ` +
          `Consider using palace_store with a new hub structure.`
        );
        changes.atomic_warning = `Content exceeds atomic limits (${splitDecision.metrics.lineCount} lines, ${splitDecision.metrics.sectionCount} sections)`;
      }
    }

    // Build final content
    const finalContent = stringifyFrontmatter(newFrontmatter, newBody.trim());

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

    const vaultInfo = getVaultResultInfo(vault);
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
  const lines = existing.split('\n');
  const sectionRegex = new RegExp(`^##\\s+${escapeRegex(sectionName)}\\s*$`, 'i');

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
      content: `${existing.trim()}\n\n## ${sectionName}\n\n${newContent}`,
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
      currentSection = line.replace(/^##\s+/, '');
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
function buildMessage(mode: ImprovementMode, changes: PalaceImproveOutput['changes']): string {
  const parts = [`Updated note (${mode} mode)`];

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
