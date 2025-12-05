#!/usr/bin/env node

/**
 * Obsidian Palace MCP Server
 *
 * An MCP server that enables AI assistants to use Obsidian as a persistent
 * memory store - a "Memory Palace" for storing and retrieving knowledge.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { getConfig } from './config/index.js';
import { logger } from './utils/logger.js';
import { registerTools, handleToolCall, getToolDefinitions } from './tools/index.js';

async function main(): Promise<void> {
  // Load and validate configuration
  const config = getConfig();
  logger.setLevel(config.logLevel);

  logger.info('Starting Obsidian Palace MCP Server', {
    vaultPath: config.vaultPath,
    logLevel: config.logLevel,
  });

  // Create MCP server
  const server = new Server(
    {
      name: 'obsidian-palace-mcp',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register tool listing handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: getToolDefinitions(),
    };
  });

  // Register tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    logger.debug(`Tool call: ${name}`, args);

    try {
      const result = await handleToolCall(name, args ?? {});
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      logger.error(`Tool error: ${name}`, error);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
            }),
          },
        ],
        isError: true,
      };
    }
  });

  // Connect to stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info('Server connected and ready');
}

// Run the server
main().catch((error) => {
  logger.error('Fatal error', error);
  process.exit(1);
});
