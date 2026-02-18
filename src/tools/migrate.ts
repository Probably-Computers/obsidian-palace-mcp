/**
 * palace_migrate - Vault health inspection and migration tool (Phase 029)
 *
 * Two-phase tool: inspect first (default), then execute approved fixes.
 * Never auto-executes without user approval.
 *
 * Detects:
 * - Unprefixed child notes (fixable)
 * - Corrupted H1 headings with wiki-links (fixable)
 * - Orphaned fragments in hub directories (report only)
 * - Duplicate filenames across directories (report only)
 */

import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolResult } from '../types/index.js';
import { inspectVault, type IssueType } from '../services/migrate/inspector.js';
import { executeMigration } from '../services/migrate/executor.js';
import { getIndexManager } from '../services/index/index.js';
import {
  resolveVaultParam,
  enforceWriteAccess,
  getVaultResultInfo,
} from '../utils/vault-param.js';

const CATEGORIES = [
  'unprefixed_children',
  'corrupted_headings',
  'orphaned_fragments',
  'naming_inconsistencies',
  'broken_wiki_links',
  'code_block_links',
] as const;

const inputSchema = z.object({
  vault: z.string().optional().describe('Vault alias or path'),
  categories: z
    .array(z.enum(CATEGORIES))
    .optional()
    .describe('Issue categories to check (default: all)'),
  dry_run: z
    .boolean()
    .default(true)
    .describe('Inspect only without making changes (default: true)'),
  limit: z.number().optional().describe('Max issues to process'),
});

export const migrateTool: Tool = {
  name: 'palace_migrate',
  description: `Inspect vault health and migrate legacy data. Default mode (dry_run: true) inspects and reports issues. Set dry_run: false to apply fixes.

**Fixable issues:** unprefixed_children (renames children to Parent - Section.md), corrupted_headings (strips wiki-links from H1).
**Report-only:** orphaned_fragments, naming_inconsistencies, broken_wiki_links (malformed [[X]]es]] patterns), code_block_links (wiki-links inside code blocks).

Always inspect first, then present findings to user before executing.`,
  inputSchema: {
    type: 'object',
    properties: {
      vault: {
        type: 'string',
        description: 'Vault alias or path',
      },
      categories: {
        type: 'array',
        items: {
          type: 'string',
          enum: CATEGORIES as unknown as string[],
        },
        description:
          'Issue categories to check: unprefixed_children, corrupted_headings, orphaned_fragments, naming_inconsistencies, broken_wiki_links, code_block_links',
      },
      dry_run: {
        type: 'boolean',
        description:
          'Inspect only (true, default) or apply fixes (false)',
      },
      limit: {
        type: 'number',
        description: 'Max issues to process',
      },
    },
    required: [],
  },
};

export async function migrateHandler(
  args: Record<string, unknown>
): Promise<ToolResult> {
  const parseResult = inputSchema.safeParse(args);
  if (!parseResult.success) {
    return {
      success: false,
      error: parseResult.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; '),
      code: 'VALIDATION_ERROR',
    };
  }

  const { vault: vaultParam, categories, dry_run, limit } = parseResult.data;

  try {
    const vault = resolveVaultParam(vaultParam);
    if (!dry_run) {
      enforceWriteAccess(vault);
    }

    const manager = getIndexManager();
    const db = await manager.getIndex(vault.alias);

    // Inspect vault
    const inspection = await inspectVault(
      db,
      vault.path,
      categories as IssueType[] | undefined
    );

    let issues = inspection.issues;
    if (limit) {
      issues = issues.slice(0, limit);
    }

    // Inspect-only mode
    if (dry_run) {
      return {
        success: true,
        data: {
          ...getVaultResultInfo(vault),
          dry_run: true,
          notes_scanned: inspection.notes_scanned,
          issues_found: inspection.issues.length,
          summary: inspection.summary,
          issues: issues.map((i) => ({
            path: i.path,
            type: i.type,
            description: i.description,
            suggestion: i.suggestion,
            fixable: i.type === 'unprefixed_children' || i.type === 'corrupted_headings',
          })),
          message: `Found ${inspection.issues.length} issues in ${inspection.notes_scanned} notes. Set dry_run: false to apply fixes.`,
        },
      };
    }

    // Execute mode — only fix fixable issues
    const fixableIssues = issues.filter(
      (i) =>
        i.type === 'unprefixed_children' ||
        i.type === 'corrupted_headings'
    );

    const migrationResult = await executeMigration(
      fixableIssues,
      vault.path,
      vault.alias,
      db,
      vault.config.ignore
    );

    return {
      success: true,
      data: {
        ...getVaultResultInfo(vault),
        dry_run: false,
        notes_scanned: inspection.notes_scanned,
        issues_found: inspection.issues.length,
        summary: inspection.summary,
        operation_id: migrationResult.operation_id,
        issues_fixed: migrationResult.issues_fixed,
        issues_skipped: migrationResult.issues_skipped,
        fixes: migrationResult.fixes,
        skipped: migrationResult.skipped.length > 0 ? migrationResult.skipped : undefined,
        errors: migrationResult.errors.length > 0 ? migrationResult.errors : undefined,
        message: `Fixed ${migrationResult.issues_fixed} issues, skipped ${migrationResult.issues_skipped}`,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      code: 'MIGRATE_ERROR',
    };
  }
}
