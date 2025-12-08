/**
 * palace_clarify - Context detection and question generation tool
 *
 * Helps AI determine missing context and generate clarifying questions
 * before storing knowledge. Integrates with palace_store workflow.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolResult } from '../types/index.js';
import type { PalaceClarifyOutput } from '../types/clarify.js';
import { palaceClarifyInputSchema } from '../types/clarify.js';
import { getIndexManager } from '../services/index/index.js';
import { resolveVaultParam, getVaultResultInfo } from '../utils/vault-param.js';
import {
  detectContext,
  identifyMissing,
  prioritizeMissing,
  generateQuestions,
  generateSuggestions,
  calculateConfidence,
  generateSummaryMessage,
} from '../services/ai-support/index.js';

// Tool definition
export const clarifyTool: Tool = {
  name: 'palace_clarify',
  description: `Detect context and generate clarifying questions before storing knowledge.

Use this when palace_store intent is incomplete or ambiguous. Returns:
- Detected context (technologies, projects, clients, scope, domains)
- Questions to ask the user for missing information
- Suggestions based on detection with confidence scores

Workflow:
1. AI prepares storage intent
2. If intent incomplete → palace_clarify
3. AI presents questions to user
4. User answers
5. AI updates intent and calls palace_store`,
  inputSchema: {
    type: 'object',
    properties: {
      context: {
        type: 'object',
        description: 'Context about the knowledge to store',
        properties: {
          title: {
            type: 'string',
            description: 'Note title',
          },
          content_preview: {
            type: 'string',
            description: 'First 500 characters of content for analysis',
          },
          detected_technologies: {
            type: 'array',
            items: { type: 'string' },
            description: 'Technologies already detected by AI',
          },
          detected_context: {
            type: 'object',
            properties: {
              possible_projects: {
                type: 'array',
                items: { type: 'string' },
              },
              possible_clients: {
                type: 'array',
                items: { type: 'string' },
              },
            },
            description: 'Context hints already detected by AI',
          },
        },
        required: ['title', 'content_preview'],
      },
      missing: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['scope', 'project', 'client', 'technologies', 'domain'],
        },
        description: 'Context types AI knows are missing',
      },
      vault: {
        type: 'string',
        description: 'Vault alias to analyze against',
      },
    },
    required: ['context'],
  },
};

// Tool handler
export async function clarifyHandler(
  args: Record<string, unknown>
): Promise<ToolResult<PalaceClarifyOutput>> {
  // Validate input
  const parseResult = palaceClarifyInputSchema.safeParse(args);
  if (!parseResult.success) {
    return {
      success: false,
      error: parseResult.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; '),
      code: 'VALIDATION_ERROR',
    };
  }

  const { context, missing: inputMissing, vault: vaultParam } = parseResult.data;

  try {
    // Resolve vault
    const vault = resolveVaultParam(vaultParam);
    const manager = getIndexManager();
    const db = await manager.getIndex(vault.alias);

    // Combine title and content for analysis
    const fullContent = `${context.title}\n\n${context.content_preview}`;

    // Run context detection
    const detected = detectContext(fullContent, db);

    // Merge AI-provided hints with detection
    if (context.detected_technologies) {
      for (const tech of context.detected_technologies) {
        const existingTech = detected.technologies.find(
          (t) => t.name.toLowerCase() === tech.toLowerCase()
        );
        if (!existingTech) {
          detected.technologies.push({
            name: tech,
            confidence: 0.6,
            exists_in_vault: false,
          });
        }
      }
    }

    if (context.detected_context?.possible_projects) {
      for (const proj of context.detected_context.possible_projects) {
        const existingProj = detected.projects.find(
          (p) => p.name.toLowerCase() === proj.toLowerCase()
        );
        if (!existingProj) {
          detected.projects.push({
            name: proj,
            confidence: 0.5,
          });
        }
      }
    }

    if (context.detected_context?.possible_clients) {
      for (const client of context.detected_context.possible_clients) {
        const existingClient = detected.clients.find(
          (c) => c.name.toLowerCase() === client.toLowerCase()
        );
        if (!existingClient) {
          detected.clients.push({
            name: client,
            confidence: 0.5,
          });
        }
      }
    }

    // Build partial intent from what we know
    const partialIntent: import('../types/clarify.js').PartialStorageIntent = {
      domain: detected.domains.map((d) => d.name),
      technologies: detected.technologies.map((t) => t.name),
    };

    // Only set optional fields if they have values
    if (detected.scope.confidence >= 0.6) {
      partialIntent.scope = detected.scope.likely;
    }
    if (detected.projects.length > 0 && detected.projects[0]!.confidence >= 0.6) {
      partialIntent.project = detected.projects[0]!.name;
    }
    if (detected.clients.length > 0 && detected.clients[0]!.confidence >= 0.6) {
      partialIntent.client = detected.clients[0]!.name;
    }

    // Identify missing context
    const missingResult = identifyMissing(partialIntent, detected);

    // Merge with AI-provided missing list
    const allMissing = [...new Set([...missingResult.missing, ...(inputMissing ?? [])])];
    const allPartial = missingResult.partial.filter((p) => !allMissing.includes(p));

    // Prioritize the missing fields
    const prioritized = prioritizeMissing(allMissing, allPartial);

    // Generate questions for prioritized fields
    const questions = generateQuestions(
      allMissing,
      allPartial,
      context.title,
      context.content_preview,
      detected,
      missingResult.reasons
    );

    // Sort questions by priority
    const sortedQuestions = questions.sort((a, b) => {
      const aIdx = prioritized.indexOf(a.key);
      const bIdx = prioritized.indexOf(b.key);
      return aIdx - bIdx;
    });

    // Generate suggestions
    const suggestions = generateSuggestions(detected);

    // Calculate confidence
    const confidence = calculateConfidence(detected, allMissing, allPartial);

    // Generate summary message
    const message = generateSummaryMessage(sortedQuestions, suggestions, confidence.overall);

    const vaultInfo = getVaultResultInfo(vault);

    return {
      success: true,
      data: {
        success: true,
        vault: vaultInfo.vault,
        vaultPath: vaultInfo.vault_path,
        detected,
        questions: sortedQuestions,
        suggestions,
        confidence,
        message,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      code: 'CLARIFY_ERROR',
    };
  }
}
