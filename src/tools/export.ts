/**
 * palace_export - Export notes in various formats (Phase 026)
 *
 * Supports exporting single notes, hub + children consolidated,
 * or entire directories as single files.
 *
 * Formats: markdown, clean_markdown, resolved_markdown, html
 * Link styles: keep, plain_text, relative, remove
 */

import { join } from 'path';
import { existsSync, statSync } from 'fs';
import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolResult } from '../types/index.js';
import { exportNote, exportDirectory, type ExportFormat, type ExportOptions } from '../services/export/index.js';
import { resolveVaultParam, getVaultResultInfo } from '../utils/vault-param.js';
import { logger } from '../utils/logger.js';
import type { LinkStyle } from '../utils/markdown.js';

/**
 * Export output schema
 */
export interface PalaceExportOutput {
  success: boolean;
  vault: string;
  vaultPath: string;
  content: string;
  format: string;
  sources: string[];
  outputPath?: string;
  warnings: string[];
  message: string;
}

/**
 * Input validation schema
 */
const exportInputSchema = z.object({
  path: z.string().describe('Note path or directory to export'),
  vault: z.string().optional().describe('Vault alias (defaults to default vault)'),
  format: z
    .enum(['markdown', 'clean_markdown', 'resolved_markdown', 'html'])
    .default('markdown')
    .describe(
      'Export format: markdown (wiki-links intact), clean_markdown (links to plain text), resolved_markdown (links to relative paths), html (rendered HTML)'
    ),
  include_children: z
    .boolean()
    .default(true)
    .describe('Include hub children in export (consolidate into single file)'),
  include_frontmatter: z
    .boolean()
    .default(false)
    .describe('Include frontmatter in output'),
  frontmatter_as_header: z
    .boolean()
    .default(false)
    .describe('Convert frontmatter to readable document header instead of YAML'),
  link_style: z
    .enum(['keep', 'plain_text', 'relative', 'remove'])
    .optional()
    .describe(
      'Link processing style (overrides format default): keep (leave as wiki-links), plain_text (convert to text), relative (convert to markdown links), remove (strip entirely)'
    ),
  output_path: z
    .string()
    .optional()
    .describe('Write to file instead of returning content'),
  allow_outside_vault: z
    .boolean()
    .default(false)
    .describe('Allow writing output to paths outside the vault'),
});

// Tool definition
export const exportTool: Tool = {
  name: 'palace_export',
  description: `Export notes in various formats. Supports single notes, hub + children consolidated, or directories.

**Formats:**
- markdown: Wiki-links intact, original format
- clean_markdown: Wiki-links converted to plain text
- resolved_markdown: Wiki-links converted to relative markdown links
- html: Rendered HTML with optional styling

**Features:**
- Automatically consolidates hub notes with their children
- Handles nested hub structures recursively
- Optional frontmatter inclusion or conversion to header
- Can write to file or return content`,
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Note path or directory to export',
      },
      vault: {
        type: 'string',
        description: 'Vault alias (defaults to default vault)',
      },
      format: {
        type: 'string',
        enum: ['markdown', 'clean_markdown', 'resolved_markdown', 'html'],
        description:
          'Export format: markdown (wiki-links intact), clean_markdown (links to plain text), resolved_markdown (links to relative paths), html (rendered HTML)',
        default: 'markdown',
      },
      include_children: {
        type: 'boolean',
        description: 'Include hub children in export (consolidate into single file)',
        default: true,
      },
      include_frontmatter: {
        type: 'boolean',
        description: 'Include frontmatter in output',
        default: false,
      },
      frontmatter_as_header: {
        type: 'boolean',
        description: 'Convert frontmatter to readable document header instead of YAML',
        default: false,
      },
      link_style: {
        type: 'string',
        enum: ['keep', 'plain_text', 'relative', 'remove'],
        description:
          'Link processing style (overrides format default): keep, plain_text, relative, remove',
      },
      output_path: {
        type: 'string',
        description: 'Write to file instead of returning content',
      },
      allow_outside_vault: {
        type: 'boolean',
        description: 'Allow writing output to paths outside the vault',
        default: false,
      },
    },
    required: ['path'],
  },
};

// Tool handler
export async function exportHandler(
  args: Record<string, unknown>
): Promise<ToolResult<PalaceExportOutput>> {
  // Validate input
  const parseResult = exportInputSchema.safeParse(args);
  if (!parseResult.success) {
    return {
      success: false,
      error: parseResult.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; '),
      code: 'VALIDATION_ERROR',
    };
  }

  const {
    path,
    vault: vaultParam,
    format,
    include_children,
    include_frontmatter,
    frontmatter_as_header,
    link_style,
    output_path,
    allow_outside_vault,
  } = parseResult.data;

  try {
    // Resolve vault
    const vault = resolveVaultParam(vaultParam);

    // Check if path exists
    const fullPath = join(vault.path, path);
    if (!existsSync(fullPath)) {
      return {
        success: false,
        error: `Path not found: ${path}`,
        code: 'NOT_FOUND',
      };
    }

    // Determine if path is file or directory
    const isDirectory = statSync(fullPath).isDirectory();

    // Build export options
    const exportOptions: ExportOptions = {
      format: format as ExportFormat,
      includeChildren: include_children,
      includeFrontmatter: include_frontmatter,
      frontmatterAsHeader: frontmatter_as_header,
      allowOutsideVault: allow_outside_vault,
    };
    if (link_style) {
      exportOptions.linkStyle = link_style as LinkStyle;
    }
    if (output_path) {
      exportOptions.outputPath = output_path;
    }

    // Export
    const result = isDirectory
      ? await exportDirectory(vault.path, path, exportOptions)
      : await exportNote(vault.path, path, exportOptions);

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Export failed',
        code: 'EXPORT_ERROR',
      };
    }

    const vaultInfo = getVaultResultInfo(vault);

    // Build success message
    const sourceCount = result.sources.length;
    let message = `Exported ${sourceCount} file${sourceCount > 1 ? 's' : ''} as ${format}`;
    if (result.outputPath) {
      message += ` to ${result.outputPath}`;
    }
    if (result.warnings.length > 0) {
      message += ` (${result.warnings.length} warning${result.warnings.length > 1 ? 's' : ''})`;
    }

    const outputData: PalaceExportOutput = {
      success: true,
      vault: vaultInfo.vault,
      vaultPath: vaultInfo.vault_path,
      content: result.content,
      format: result.format,
      sources: result.sources,
      warnings: result.warnings,
      message,
    };
    if (result.outputPath) {
      outputData.outputPath = result.outputPath;
    }

    return {
      success: true,
      data: outputData,
    };
  } catch (error) {
    logger.error('Export error', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      code: 'EXPORT_ERROR',
    };
  }
}
