/**
 * palace_dataview - Execute Dataview Query Language (DQL) queries
 */

import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolResult } from '../types/index.js';
import {
  parseDQL,
  DQLParseError,
  executeQueryWithTags,
  formatResult,
  type OutputFormat,
} from '../services/dataview/index.js';
import { logger } from '../utils/logger.js';
import { resolveVaultParam, getVaultResultInfo } from '../utils/vault-param.js';

// Input schema
const inputSchema = z.object({
  query: z.string().min(1, 'Query is required'),
  format: z.enum(['table', 'list', 'task', 'json']).optional().default('json'),
  vault: z.string().optional().describe('Vault alias or path. Defaults to the default vault.'),
});

// Tool definition
export const dataviewTool: Tool = {
  name: 'palace_dataview',
  description: `Execute Dataview Query Language (DQL) queries against notes.

Supports:
- TABLE queries: TABLE field1, field2 FROM "path" WHERE condition SORT field LIMIT n
- LIST queries: LIST FROM "path" WHERE condition
- TASK queries: TASK FROM "path" WHERE condition

Supported operators: =, !=, >, <, >=, <=, AND, OR, contains()

Example queries:
- TABLE title, confidence FROM "research" WHERE verified = false
- LIST FROM "commands" WHERE contains(tags, "kubernetes")
- TABLE title, type WHERE confidence > 0.8 SORT modified DESC LIMIT 10`,
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'DQL query string',
      },
      format: {
        type: 'string',
        enum: ['table', 'list', 'task', 'json'],
        description: 'Output format (default: json)',
      },
      vault: {
        type: 'string',
        description: 'Vault alias or path to query (defaults to default vault)',
      },
    },
    required: ['query'],
  },
};

// Tool handler
export async function dataviewHandler(args: Record<string, unknown>): Promise<ToolResult> {
  // Validate input
  const parseResult = inputSchema.safeParse(args);
  if (!parseResult.success) {
    return {
      success: false,
      error: parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      code: 'VALIDATION_ERROR',
    };
  }

  const { query, format, vault: vaultParam } = parseResult.data;

  try {
    // Resolve vault
    const vault = resolveVaultParam(vaultParam);

    logger.info(`Executing DQL query: ${query}`);

    // Parse the DQL query
    const parsedQuery = parseDQL(query);
    logger.debug('Parsed query:', parsedQuery);

    // Execute the query
    // Note: Currently uses shared index, multi-vault indexing will be added in Phase 010
    const result = executeQueryWithTags(parsedQuery);
    logger.debug(`Query returned ${result.total} results`);

    // Format the result
    const formatted = formatResult(result, format as OutputFormat);

    return {
      success: true,
      data: {
        ...getVaultResultInfo(vault),
        query,
        format,
        total: result.total,
        fields: result.fields,
        output: formatted.output,
        rows: format === 'json' ? result.rows : undefined,
        message: `Found ${result.total} result${result.total === 1 ? '' : 's'}`,
      },
    };
  } catch (error) {
    if (error instanceof DQLParseError) {
      return {
        success: false,
        error: `DQL syntax error: ${error.message}`,
        code: 'PARSE_ERROR',
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      code: 'DATAVIEW_ERROR',
    };
  }
}
