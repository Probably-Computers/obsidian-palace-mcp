/**
 * palace_store - Intent-based knowledge storage
 *
 * AI expresses WHAT to store, MCP determines WHERE based on vault config.
 * This replaces the path-based approach of palace_remember.
 */

import { mkdir, writeFile } from 'fs/promises';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolResult } from '../types/index.js';
import type { PalaceStoreOutput } from '../types/intent.js';
import { palaceStoreInputSchema } from '../types/intent.js';
import { resolveStorage, checkPathConflict, generateAlternativePath } from '../services/vault/resolver.js';
import { createStub, findStubByTitle, expandStub, createStubsForUnresolvedLinks } from '../services/vault/stub-manager.js';
import { findUnlinkedMentions, addRetroactiveLinks } from '../services/graph/retroactive.js';
import { buildCompleteIndex, scanForMatches, autolinkContent } from '../services/autolink/index.js';
import { getIndexManager } from '../services/index/index.js';
import { getIndexedPaths, indexNote, trackTechnologyMentions } from '../services/index/sync.js';
import { readNote } from '../services/vault/reader.js';
import { resolveVaultParam, enforceWriteAccess, getVaultResultInfo } from '../utils/vault-param.js';
import { stringifyFrontmatter } from '../utils/frontmatter.js';
import { logger } from '../utils/logger.js';

// Tool definition
export const storeTool: Tool = {
  name: 'palace_store',
  description:
    'Store new knowledge using intent-based resolution. Express WHAT to store (knowledge type, domain, scope), and Palace determines WHERE based on vault configuration. Supports automatic stub creation for mentioned technologies and retroactive linking.',
  inputSchema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Note title',
      },
      content: {
        type: 'string',
        description: 'The knowledge to store (markdown format)',
      },
      intent: {
        type: 'object',
        description: 'Storage intent - what kind of knowledge and its classification',
        properties: {
          knowledge_type: {
            type: 'string',
            enum: [
              'technology',
              'command',
              'reference',
              'standard',
              'pattern',
              'research',
              'decision',
              'configuration',
              'troubleshooting',
              'note',
            ],
            description: 'What kind of knowledge this is',
          },
          domain: {
            type: 'array',
            items: { type: 'string' },
            description: 'Domain classification hierarchy (e.g., ["kubernetes", "networking"])',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Tags for categorization',
          },
          scope: {
            type: 'string',
            enum: ['general', 'project-specific'],
            description: 'Is this general knowledge or project-specific?',
          },
          project: {
            type: 'string',
            description: 'Project name (required if scope is project-specific)',
          },
          client: {
            type: 'string',
            description: 'Client name (for client-specific knowledge)',
          },
          product: {
            type: 'string',
            description: 'Product name (for product-specific knowledge)',
          },
          technologies: {
            type: 'array',
            items: { type: 'string' },
            description: 'Technologies mentioned - stubs will be created if they don\'t exist',
          },
          references: {
            type: 'array',
            items: { type: 'string' },
            description: 'Explicit links to create to other notes',
          },
          parent: {
            type: 'string',
            description: 'Parent hub note if known',
          },
        },
        required: ['knowledge_type', 'domain', 'scope'],
      },
      options: {
        type: 'object',
        description: 'Storage options',
        properties: {
          vault: {
            type: 'string',
            description: 'Vault alias to store in (defaults to default vault)',
          },
          create_stubs: {
            type: 'boolean',
            description: 'Create stubs for mentioned technologies (default: true)',
          },
          retroactive_link: {
            type: 'boolean',
            description: 'Update existing notes with links to this new note (default: true)',
          },
          expand_if_stub: {
            type: 'boolean',
            description: 'If a stub exists for this title, expand it instead of creating new (default: true)',
          },
          dry_run: {
            type: 'boolean',
            description: 'Preview without saving (default: false)',
          },
          autolink: {
            type: 'boolean',
            description: 'Automatically insert wiki-links for mentions of existing notes (default: true)',
          },
        },
      },
      source: {
        type: 'object',
        description: 'Knowledge provenance',
        properties: {
          origin: {
            type: 'string',
            description: 'Where this knowledge came from (ai:research, ai:artifact, human, web:url)',
          },
          confidence: {
            type: 'number',
            description: 'Confidence level 0-1',
          },
        },
      },
    },
    required: ['title', 'content', 'intent'],
  },
};

// Tool handler
export async function storeHandler(args: Record<string, unknown>): Promise<ToolResult<PalaceStoreOutput>> {
  // Validate input
  const parseResult = palaceStoreInputSchema.safeParse(args);
  if (!parseResult.success) {
    return {
      success: false,
      error: parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      code: 'VALIDATION_ERROR',
    };
  }

  const { title, content, intent, options, source } = parseResult.data;

  const vaultParam = options?.vault;
  const create_stubs = options?.create_stubs ?? true;
  const retroactive_link = options?.retroactive_link ?? true;
  const expand_if_stub = options?.expand_if_stub ?? true;
  const dry_run = options?.dry_run ?? false;
  const autolink = options?.autolink ?? true;

  try {
    // Resolve and validate vault
    const vault = resolveVaultParam(vaultParam);
    enforceWriteAccess(vault);

    const manager = getIndexManager();
    const db = await manager.getIndex(vault.alias);

    // Check if a stub exists for this title and should be expanded
    if (expand_if_stub) {
      const existingStub = findStubByTitle(db, title);
      if (existingStub) {
        if (!dry_run) {
          await expandStub(
            existingStub.path,
            content,
            vault,
            source ?? { origin: 'ai:research', confidence: 0.5 }
          );

          // Re-index the expanded note
          const updatedNote = await readNote(existingStub.path, {
            vaultPath: vault.path,
            ignoreConfig: vault.config.ignore,
          });
          if (updatedNote) {
            indexNote(db, updatedNote);
          }
        }

        const vaultInfo = getVaultResultInfo(vault);
        return {
          success: true,
          data: {
            success: true,
            vault: vaultInfo.vault,
            vaultPath: vaultInfo.vault_path,
            created: {
              path: existingStub.path,
              title,
              type: 'atomic',
            },
            expanded_stub: existingStub.path,
            message: `Expanded stub: ${existingStub.path}`,
          },
        };
      }
    }

    // Resolve storage location
    const resolution = resolveStorage(intent, title, vault);

    // Check for path conflicts
    const existingPaths = getIndexedPaths(db);
    const conflict = checkPathConflict(resolution, existingPaths);
    let finalResolution = resolution;

    if (conflict) {
      // Generate alternative path
      let suffix = 2;
      while (checkPathConflict(finalResolution, existingPaths)) {
        finalResolution = generateAlternativePath(resolution, suffix++);
        if (suffix > 10) {
          return {
            success: false,
            error: `Unable to find non-conflicting path for: ${title}`,
            code: 'PATH_CONFLICT',
          };
        }
      }
    }

    // Process content
    let processedContent = content;
    let linksAdded = 0;

    // Auto-link content
    if (autolink) {
      try {
        const { index } = await buildCompleteIndex(db);
        const matches = scanForMatches(processedContent, index);
        if (matches.length > 0) {
          const result = autolinkContent(processedContent, matches);
          processedContent = result.linkedContent;
          linksAdded = result.linksAdded.length;
        }
      } catch (linkError) {
        logger.warn('Auto-linking failed, proceeding without', linkError);
      }
    }

    // Build frontmatter
    const now = new Date().toISOString();
    const frontmatter: Record<string, unknown> = {
      type: mapKnowledgeType(intent.knowledge_type),
      status: 'active',
      created: now,
      modified: now,
      source: source?.origin ?? 'ai:research',
      confidence: source?.confidence ?? 0.5,
      verified: false,
      tags: [...(intent.tags ?? []), ...intent.domain],
      related: intent.references?.map((r) => `[[${r}]]`) ?? [],
      aliases: [],
      palace: {
        version: 1,
        layer: resolution.layer,
      },
    };

    // Add context fields
    if (intent.project) frontmatter.project = intent.project;
    if (intent.client) frontmatter.client = intent.client;
    if (intent.product) frontmatter.product = intent.product;
    if (intent.parent) frontmatter.parent = `[[${intent.parent}]]`;

    // Build full note content
    const body = `# ${title}

${processedContent}`;
    const noteContent = stringifyFrontmatter(frontmatter, body);

    // Create stubs for mentioned technologies
    const stubsCreated: string[] = [];

    if (create_stubs && intent.technologies && intent.technologies.length > 0) {
      for (const tech of intent.technologies) {
        // Check if note exists for this technology
        const techNote = findStubByTitle(db, tech);
        const techExists = existingPaths.some(
          (p) =>
            p.toLowerCase().includes(tech.toLowerCase()) ||
            p.toLowerCase().endsWith(`${tech.toLowerCase()}.md`)
        );

        if (!techNote && !techExists && !dry_run) {
          try {
            const stubPath = await createStub(
              tech,
              `Referenced in ${title}`,
              finalResolution.relativePath,
              vault,
              intent.domain
            );
            stubsCreated.push(stubPath);

            // Index the stub
            const stubNote = await readNote(stubPath, {
              vaultPath: vault.path,
              ignoreConfig: vault.config.ignore,
            });
            if (stubNote) {
              indexNote(db, stubNote);
            }
          } catch (stubError) {
            logger.warn(`Failed to create stub for ${tech}`, stubError);
          }
        }
      }
    }

    // Save the note
    if (!dry_run) {
      await mkdir(finalResolution.parentDir, { recursive: true });
      await writeFile(finalResolution.fullPath, noteContent, 'utf-8');

      // Index the new note
      const savedNote = await readNote(finalResolution.relativePath, {
        vaultPath: vault.path,
        ignoreConfig: vault.config.ignore,
      });
      if (savedNote) {
        indexNote(db, savedNote);
      }

      // Create stubs for unresolved [[wiki-links]] in content
      if (create_stubs) {
        try {
          const linkStubs = await createStubsForUnresolvedLinks(
            processedContent,
            finalResolution.relativePath,
            db,
            vault,
            intent.domain
          );
          stubsCreated.push(...linkStubs);

          // Index the new link stubs
          for (const stubPath of linkStubs) {
            const stubNote = await readNote(stubPath, {
              vaultPath: vault.path,
              ignoreConfig: vault.config.ignore,
            });
            if (stubNote) {
              indexNote(db, stubNote);
            }
          }
        } catch (linkStubError) {
          logger.warn('Failed to create stubs for unresolved links', linkStubError);
        }
      }
    }

    // Handle retroactive linking
    const linksToExisting: string[] = [];
    const linksFromExisting: string[] = [];

    if (retroactive_link && !dry_run) {
      const matches = findUnlinkedMentions(db, title, finalResolution.relativePath);
      if (matches.length > 0) {
        const result = await addRetroactiveLinks(
          title,
          finalResolution.relativePath,
          matches,
          vault
        );
        linksFromExisting.push(...result.notesUpdated);
      }
    }

    // Track technology mentions for this note
    if (intent.technologies && intent.technologies.length > 0 && !dry_run) {
      trackTechnologyMentions(db, finalResolution.relativePath, intent.technologies);
    }

    const vaultResultInfo = getVaultResultInfo(vault);
    return {
      success: true,
      data: {
        success: true,
        vault: vaultResultInfo.vault,
        vaultPath: vaultResultInfo.vault_path,
        created: {
          path: finalResolution.relativePath,
          title,
          type: 'atomic',
        },
        stubs_created: stubsCreated.length > 0 ? stubsCreated : undefined,
        links_added:
          linksAdded > 0 || linksToExisting.length > 0 || linksFromExisting.length > 0
            ? {
                to_existing: linksToExisting,
                from_existing: linksFromExisting,
              }
            : undefined,
        message: buildSuccessMessage(
          finalResolution.relativePath,
          linksAdded,
          stubsCreated,
          linksFromExisting,
          dry_run
        ),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      code: 'STORE_ERROR',
    };
  }
}

/**
 * Map intent knowledge types to existing types
 */
function mapKnowledgeType(intentType: string): string {
  const typeMap: Record<string, string> = {
    technology: 'research',
    command: 'command',
    reference: 'research',
    standard: 'pattern',
    pattern: 'pattern',
    research: 'research',
    decision: 'project',
    configuration: 'infrastructure',
    troubleshooting: 'troubleshooting',
    note: 'research',
  };
  return typeMap[intentType] ?? 'research';
}

/**
 * Build success message
 */
function buildSuccessMessage(
  path: string,
  linksAdded: number,
  stubs: string[],
  retroactiveUpdates: string[],
  dryRun: boolean
): string {
  const parts = [dryRun ? `Would create: ${path}` : `Created: ${path}`];

  if (linksAdded > 0) {
    parts.push(`${linksAdded} auto-links added`);
  }

  if (stubs.length > 0) {
    parts.push(`${stubs.length} stub${stubs.length > 1 ? 's' : ''} created`);
  }

  if (retroactiveUpdates.length > 0) {
    parts.push(`${retroactiveUpdates.length} existing note${retroactiveUpdates.length > 1 ? 's' : ''} updated with links`);
  }

  return parts.join(' | ');
}
