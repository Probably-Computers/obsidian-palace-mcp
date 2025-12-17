/**
 * palace_repair - Metadata repair tool (Phase 025)
 *
 * Repairs common metadata issues in vault notes:
 * - Invalid type values (normalization)
 * - Stale children_count in hub notes
 * - Invalid date formats
 * - Domain array issues
 * - Missing required fields
 */

import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolResult } from '../types/index.js';
import { readNote, listNotes } from '../services/vault/index.js';
import { updateNote } from '../services/vault/writer.js';
import { indexNote, getIndexManager } from '../services/index/index.js';
import { validateFrontmatter, repairFrontmatter, type ValidationIssue } from '../utils/frontmatter-schema.js';
import { getAccurateChildrenCount, updateChildrenCount } from '../services/atomic/children-count.js';
import { normalizeType, isHubType } from '../types/note-types.js';
import { logger } from '../utils/logger.js';
import {
  resolveVaultParam,
  enforceWriteAccess,
  getVaultResultInfo,
} from '../utils/vault-param.js';

// Repair types available
const REPAIR_TYPES = ['types', 'children_count', 'dates', 'domains', 'required_fields', 'all'] as const;
type RepairType = (typeof REPAIR_TYPES)[number];

// Input schema
const inputSchema = z.object({
  path: z.string().optional().describe('Note or directory to repair (default: entire vault)'),
  vault: z.string().optional().describe('Vault alias or path'),
  dry_run: z.boolean().default(true).describe('Preview changes without modifying files'),
  repairs: z
    .array(z.enum(REPAIR_TYPES))
    .default(['all'])
    .describe('Types of repairs to perform'),
});

// Tool definition
export const repairTool: Tool = {
  name: 'palace_repair',
  description:
    'Repair common metadata issues in vault notes. Fixes invalid types, stale children_count, date formats, and domain arrays.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Note or directory to repair (default: entire vault)',
      },
      vault: {
        type: 'string',
        description: 'Vault alias or path to repair',
      },
      dry_run: {
        type: 'boolean',
        description: 'Preview changes without modifying files (default: true)',
      },
      repairs: {
        type: 'array',
        items: {
          type: 'string',
          enum: REPAIR_TYPES as unknown as string[],
        },
        description: 'Types of repairs: types, children_count, dates, domains, required_fields, all',
      },
    },
    required: [],
  },
};

// Individual repair result
interface NoteRepairResult {
  path: string;
  repaired: boolean;
  issues: ValidationIssue[];
  repairs: string[];
}

// Handler
export async function repairHandler(args: Record<string, unknown>): Promise<ToolResult> {
  // Validate input
  const parseResult = inputSchema.safeParse(args);
  if (!parseResult.success) {
    return {
      success: false,
      error: parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      code: 'VALIDATION_ERROR',
    };
  }

  const { path, vault: vaultParam, dry_run, repairs } = parseResult.data;

  try {
    // Resolve vault
    const vault = resolveVaultParam(vaultParam);
    if (!dry_run) {
      enforceWriteAccess(vault);
    }

    const readOptions = {
      vaultPath: vault.path,
      ignoreConfig: vault.config.ignore,
    };

    // Get database for this vault
    const manager = getIndexManager();
    const db = await manager.getIndex(vault.alias);

    // Determine which repairs to perform
    const repairSet = new Set(repairs);
    const doAll = repairSet.has('all');
    const repairTypes = doAll || repairSet.has('types');
    const repairChildrenCount = doAll || repairSet.has('children_count');
    const repairDates = doAll || repairSet.has('dates');
    const repairDomains = doAll || repairSet.has('domains');
    const repairRequiredFields = doAll || repairSet.has('required_fields');

    // Get notes to process
    let notePaths: string[] = [];
    if (path) {
      const note = await readNote(path, readOptions);
      if (note) {
        notePaths = [path];
      } else {
        // Try as directory
        const entries = await listNotes(path, true, readOptions);
        notePaths = entries.map((e) => e.path);
      }
    } else {
      // Process entire vault
      const entries = await listNotes('', true, readOptions);
      notePaths = entries.map((e) => e.path);
    }

    logger.info(`Processing ${notePaths.length} notes for repair (dry_run: ${dry_run})`);

    // Process each note
    const results: NoteRepairResult[] = [];
    let totalRepaired = 0;
    let totalIssues = 0;

    for (const notePath of notePaths) {
      const note = await readNote(notePath, readOptions);
      if (!note) continue;

      const fm = note.frontmatter as Record<string, unknown>;
      const issues: ValidationIssue[] = [];
      const repairsList: string[] = [];
      let needsUpdate = false;
      const updatedFm = { ...fm };

      // 1. Type validation and repair
      if (repairTypes && fm.type !== undefined) {
        const normalized = normalizeType(fm.type, false);
        if (normalized !== fm.type) {
          issues.push({
            field: 'type',
            message: `Invalid type '${fm.type}' -> '${normalized}'`,
            severity: 'warning',
            value: fm.type,
            suggestion: normalized,
          });
          updatedFm.type = normalized;
          repairsList.push(`type: ${fm.type} -> ${normalized}`);
          needsUpdate = true;
        }
      }

      // 2. Children count repair for hubs
      if (repairChildrenCount) {
        const noteType = (updatedFm.type as string) ?? '';
        if (isHubType(noteType)) {
          const countResult = await getAccurateChildrenCount(vault.path, notePath);
          if (!countResult.isAccurate) {
            issues.push({
              field: 'children_count',
              message: `Stale children_count: ${countResult.storedCount} -> ${countResult.actualCount}`,
              severity: 'warning',
              value: countResult.storedCount,
              suggestion: countResult.actualCount,
            });
            updatedFm.children_count = countResult.actualCount;
            repairsList.push(`children_count: ${countResult.storedCount} -> ${countResult.actualCount}`);
            needsUpdate = true;
          }
        }
      }

      // 3. Date repair
      if (repairDates) {
        const now = new Date().toISOString();

        if (fm.created !== undefined) {
          const date = new Date(fm.created as string);
          if (isNaN(date.getTime())) {
            issues.push({
              field: 'created',
              message: `Invalid date format: ${fm.created}`,
              severity: 'error',
              value: fm.created,
              suggestion: now,
            });
            updatedFm.created = now;
            repairsList.push(`created: ${fm.created} -> ${now}`);
            needsUpdate = true;
          }
        }

        if (fm.modified !== undefined) {
          const date = new Date(fm.modified as string);
          if (isNaN(date.getTime())) {
            issues.push({
              field: 'modified',
              message: `Invalid date format: ${fm.modified}`,
              severity: 'error',
              value: fm.modified,
              suggestion: now,
            });
            updatedFm.modified = now;
            repairsList.push(`modified: ${fm.modified} -> ${now}`);
            needsUpdate = true;
          }
        }
      }

      // 4. Domain repair
      if (repairDomains && fm.domain !== undefined) {
        if (!Array.isArray(fm.domain)) {
          const domainArray =
            typeof fm.domain === 'string' ? [fm.domain] : [];
          issues.push({
            field: 'domain',
            message: `Domain is not an array: ${typeof fm.domain}`,
            severity: 'error',
            value: fm.domain,
            suggestion: domainArray,
          });
          updatedFm.domain = domainArray;
          repairsList.push(`domain: normalized to array`);
          needsUpdate = true;
        } else {
          // Normalize domain casing (lowercase)
          const normalized = (fm.domain as string[]).map((d) =>
            typeof d === 'string' ? d.toLowerCase() : String(d)
          );
          const changed = JSON.stringify(normalized) !== JSON.stringify(fm.domain);
          if (changed) {
            issues.push({
              field: 'domain',
              message: 'Domain values normalized to lowercase',
              severity: 'info',
              value: fm.domain,
              suggestion: normalized,
            });
            updatedFm.domain = normalized;
            repairsList.push('domain: normalized casing');
            needsUpdate = true;
          }
        }
      }

      // 5. Required fields repair
      if (repairRequiredFields) {
        // Ensure timestamps exist
        if (!fm.created) {
          const now = new Date().toISOString();
          issues.push({
            field: 'created',
            message: 'Missing required field: created',
            severity: 'warning',
            suggestion: now,
          });
          updatedFm.created = now;
          repairsList.push('created: added');
          needsUpdate = true;
        }

        if (!fm.modified) {
          const now = new Date().toISOString();
          issues.push({
            field: 'modified',
            message: 'Missing required field: modified',
            severity: 'warning',
            suggestion: now,
          });
          updatedFm.modified = now;
          repairsList.push('modified: added');
          needsUpdate = true;
        }

        // Run full validation to catch other issues
        const validation = validateFrontmatter(fm);
        for (const issue of validation.issues) {
          if (
            issue.severity === 'error' &&
            issue.suggestion !== undefined &&
            !issues.some((i) => i.field === issue.field)
          ) {
            issues.push(issue);
            updatedFm[issue.field] = issue.suggestion;
            repairsList.push(`${issue.field}: repaired`);
            needsUpdate = true;
          }
        }
      }

      // Apply repairs if needed
      if (needsUpdate) {
        totalIssues += issues.length;

        if (!dry_run) {
          // Update the note
          updatedFm.modified = new Date().toISOString();
          const updatedNote = await updateNote(notePath, note.content, updatedFm, readOptions);
          indexNote(db, updatedNote);
          totalRepaired++;
          logger.info(`Repaired ${notePath}: ${repairsList.join(', ')}`);
        }

        results.push({
          path: notePath,
          repaired: !dry_run,
          issues,
          repairs: repairsList,
        });
      }
    }

    return {
      success: true,
      data: {
        ...getVaultResultInfo(vault),
        dry_run,
        notes_processed: notePaths.length,
        notes_with_issues: results.length,
        total_issues: totalIssues,
        notes_repaired: totalRepaired,
        repairs_requested: repairs,
        results: results.length > 0 ? results : undefined,
        message: dry_run
          ? `Preview: Found ${totalIssues} issues in ${results.length} notes`
          : `Repaired ${totalRepaired} notes with ${totalIssues} issues`,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      code: 'REPAIR_ERROR',
    };
  }
}
