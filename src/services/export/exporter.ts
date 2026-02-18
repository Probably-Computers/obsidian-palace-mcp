/**
 * Export service for rendering notes in various formats (Phase 026)
 */

import { join, dirname, basename } from 'path';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { parseFrontmatter, stringifyFrontmatter } from '../../utils/frontmatter.js';
import {
  processWikiLinks,
  markdownToHtml,
  wrapHtmlDocument,
  frontmatterToHeader,
  type LinkStyle,
} from '../../utils/markdown.js';
import { titleToFilename } from '../../utils/slugify.js';
import { consolidateHub } from './consolidator.js';
import { logger } from '../../utils/logger.js';

/**
 * Export format options
 */
export type ExportFormat = 'markdown' | 'clean_markdown' | 'resolved_markdown' | 'html';

/**
 * Export options
 */
export interface ExportOptions {
  /** Export format */
  format: ExportFormat;
  /** Include children for hub notes */
  includeChildren: boolean;
  /** Include frontmatter in output */
  includeFrontmatter: boolean;
  /** Convert frontmatter to document header instead of YAML */
  frontmatterAsHeader: boolean;
  /** Link processing style (overrides format default) */
  linkStyle?: LinkStyle;
  /** Write to output path instead of returning content */
  outputPath?: string;
  /** Allow writing outside vault */
  allowOutsideVault?: boolean;
}

/**
 * Export result
 */
export interface ExportResult {
  /** Whether the export succeeded */
  success: boolean;
  /** Exported content (if not writing to file) */
  content: string;
  /** Export format used */
  format: ExportFormat;
  /** Source files that were combined */
  sources: string[];
  /** Output path if written to file */
  outputPath?: string;
  /** Warnings encountered during export */
  warnings: string[];
  /** Error message if failed */
  error?: string;
}

/**
 * Get default link style for a format
 */
function getDefaultLinkStyle(format: ExportFormat): LinkStyle {
  switch (format) {
    case 'markdown':
      return 'keep';
    case 'clean_markdown':
      return 'plain_text';
    case 'resolved_markdown':
      return 'relative';
    case 'html':
      return 'keep'; // HTML renderer handles wiki-links
    default:
      return 'keep';
  }
}

/**
 * Export a single note
 */
export async function exportNote(
  vaultPath: string,
  notePath: string,
  options: ExportOptions
): Promise<ExportResult> {
  const warnings: string[] = [];
  const sources: string[] = [notePath];

  try {
    const fullPath = join(vaultPath, notePath);

    if (!existsSync(fullPath)) {
      return {
        success: false,
        content: '',
        format: options.format,
        sources: [],
        warnings: [],
        error: `Note not found: ${notePath}`,
      };
    }

    // Read the note
    const raw = await readFile(fullPath, 'utf-8');
    const { frontmatter, body } = parseFrontmatter(raw);
    const fm = frontmatter as Record<string, unknown>;

    // Check if this is a hub note
    const noteType = fm.type as string | undefined;
    const isHub = noteType?.endsWith('_hub');

    let content: string;
    let title = (fm.title as string) || basename(notePath, '.md');

    if (isHub && options.includeChildren) {
      // Consolidate hub with children
      const consolidation = await consolidateHub(vaultPath, notePath, {
        includeFrontmatter: options.includeFrontmatter,
        recursive: true,
      });

      content = consolidation.content;
      title = consolidation.title;
      sources.push(...consolidation.sources.filter((s) => s !== notePath));
      warnings.push(...consolidation.warnings);

      // Use consolidated frontmatter
      Object.assign(fm, consolidation.frontmatter);
    } else {
      content = body;
    }

    // Process the content based on format
    const linkStyle = options.linkStyle || getDefaultLinkStyle(options.format);
    const processedContent = processWikiLinks(content, linkStyle, titleToFilename);

    // Build final output
    let output: string;

    switch (options.format) {
      case 'html':
        output = buildHtmlOutput(processedContent, title, fm, options);
        break;

      case 'markdown':
      case 'clean_markdown':
      case 'resolved_markdown':
      default:
        output = buildMarkdownOutput(processedContent, fm, options);
        break;
    }

    // Handle output path
    if (options.outputPath) {
      const outputResult = await writeOutput(
        output,
        options.outputPath,
        vaultPath,
        options.allowOutsideVault ?? false
      );

      if (!outputResult.success) {
        const result: ExportResult = {
          success: false,
          content: output,
          format: options.format,
          sources,
          warnings,
        };
        if (outputResult.error) {
          result.error = outputResult.error;
        }
        return result;
      }

      const result: ExportResult = {
        success: true,
        content: output,
        format: options.format,
        sources,
        warnings,
      };
      if (outputResult.path) {
        result.outputPath = outputResult.path;
      }
      return result;
    }

    return {
      success: true,
      content: output,
      format: options.format,
      sources,
      warnings,
    };
  } catch (error) {
    logger.error(`Export failed for ${notePath}`, error);
    return {
      success: false,
      content: '',
      format: options.format,
      sources,
      warnings,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Export a directory of notes as a single file
 */
export async function exportDirectory(
  vaultPath: string,
  dirPath: string,
  options: ExportOptions
): Promise<ExportResult> {
  const warnings: string[] = [];
  const sources: string[] = [];

  try {
    const fullDirPath = join(vaultPath, dirPath);

    if (!existsSync(fullDirPath)) {
      return {
        success: false,
        content: '',
        format: options.format,
        sources: [],
        warnings: [],
        error: `Directory not found: ${dirPath}`,
      };
    }

    // Read all markdown files in directory
    const { readdirSync } = await import('fs');
    const files = readdirSync(fullDirPath)
      .filter((f) => f.endsWith('.md'))
      .map((f) => join(dirPath, f));

    if (files.length === 0) {
      return {
        success: false,
        content: '',
        format: options.format,
        sources: [],
        warnings: [],
        error: `No markdown files found in: ${dirPath}`,
      };
    }

    // Check if there's a hub note (look for _hub type)
    let hubPath: string | null = null;
    const nonHubFiles: string[] = [];

    for (const filePath of files) {
      const fullPath = join(vaultPath, filePath);
      const raw = await readFile(fullPath, 'utf-8');
      const { frontmatter } = parseFrontmatter(raw);
      const noteType = (frontmatter as Record<string, unknown>).type as string | undefined;

      if (noteType?.endsWith('_hub')) {
        hubPath = filePath;
      } else {
        nonHubFiles.push(filePath);
      }
    }

    // If there's a hub, use consolidation
    if (hubPath) {
      return exportNote(vaultPath, hubPath, options);
    }

    // Otherwise, concatenate all files
    const contents: string[] = [];

    for (const filePath of files) {
      // Build options without outputPath for individual files
      const fileOptions: ExportOptions = {
        format: options.format,
        includeChildren: false, // Don't consolidate children
        includeFrontmatter: options.includeFrontmatter,
        frontmatterAsHeader: options.frontmatterAsHeader,
      };
      if (options.linkStyle) {
        fileOptions.linkStyle = options.linkStyle;
      }
      if (options.allowOutsideVault !== undefined) {
        fileOptions.allowOutsideVault = options.allowOutsideVault;
      }
      const result = await exportNote(vaultPath, filePath, fileOptions);

      if (result.success) {
        contents.push(result.content);
        sources.push(filePath);
      } else {
        warnings.push(`Failed to export ${filePath}: ${result.error}`);
      }
    }

    const combinedContent = contents.join('\n\n---\n\n');

    // Handle output path
    if (options.outputPath) {
      const outputResult = await writeOutput(
        combinedContent,
        options.outputPath,
        vaultPath,
        options.allowOutsideVault ?? false
      );

      if (!outputResult.success) {
        const result: ExportResult = {
          success: false,
          content: combinedContent,
          format: options.format,
          sources,
          warnings,
        };
        if (outputResult.error) {
          result.error = outputResult.error;
        }
        return result;
      }

      const result: ExportResult = {
        success: true,
        content: combinedContent,
        format: options.format,
        sources,
        warnings,
      };
      if (outputResult.path) {
        result.outputPath = outputResult.path;
      }
      return result;
    }

    return {
      success: true,
      content: combinedContent,
      format: options.format,
      sources,
      warnings,
    };
  } catch (error) {
    logger.error(`Directory export failed for ${dirPath}`, error);
    return {
      success: false,
      content: '',
      format: options.format,
      sources,
      warnings,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Build markdown output with optional frontmatter
 */
function buildMarkdownOutput(
  content: string,
  frontmatter: Record<string, unknown>,
  options: ExportOptions
): string {
  if (!options.includeFrontmatter) {
    return content;
  }

  if (options.frontmatterAsHeader) {
    // Convert frontmatter to readable header
    const header = frontmatterToHeader(frontmatter);
    return `${header}${content}`;
  }

  // Include as YAML frontmatter
  return stringifyFrontmatter(frontmatter, content);
}

/**
 * Build HTML output
 */
function buildHtmlOutput(
  content: string,
  title: string,
  frontmatter: Record<string, unknown>,
  options: ExportOptions
): string {
  let markdownContent = content;

  // Optionally prepend frontmatter as header
  if (options.includeFrontmatter && options.frontmatterAsHeader) {
    const header = frontmatterToHeader(frontmatter);
    markdownContent = `${header}${content}`;
  }

  // Convert markdown to HTML
  const htmlBody = markdownToHtml(markdownContent);

  // Wrap in full HTML document
  return wrapHtmlDocument(htmlBody, title, { includeStyles: true });
}

/**
 * Write output to file
 */
async function writeOutput(
  content: string,
  outputPath: string,
  vaultPath: string,
  allowOutsideVault: boolean
): Promise<{ success: boolean; path?: string; error?: string }> {
  try {
    // Check if path is absolute or relative
    const isAbsolute = outputPath.startsWith('/');
    let fullPath: string;

    if (isAbsolute) {
      // Absolute path - check if outside vault
      if (!outputPath.startsWith(vaultPath) && !allowOutsideVault) {
        return {
          success: false,
          error: `Cannot write outside vault without allowOutsideVault option: ${outputPath}`,
        };
      }
      fullPath = outputPath;
    } else {
      // Relative path - write inside vault
      fullPath = join(vaultPath, outputPath);
    }

    // Ensure directory exists
    const dir = dirname(fullPath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    // Write the file
    await writeFile(fullPath, content, 'utf-8');

    logger.debug(`Exported to: ${fullPath}`);

    return {
      success: true,
      path: fullPath,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
