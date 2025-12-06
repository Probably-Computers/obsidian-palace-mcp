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
import { handleToolCall, getToolDefinitions } from './tools/index.js';
import { getDatabase, closeDatabase } from './services/index/index.js';
import { startWatcher, stopWatcher, performInitialScan } from './services/vault/index.js';
import { startHttpTransport, stopHttpTransport, isHttpEnabled } from './transports/index.js';

async function main(): Promise<void> {
  // Load and validate configuration
  const config = getConfig();
  logger.setLevel(config.logLevel);

  logger.info('Starting Obsidian Palace MCP Server', {
    vaultPath: config.vaultPath,
    logLevel: config.logLevel,
    indexPath: config.indexPath,
    watchEnabled: config.watchEnabled,
  });

  // Initialize SQLite database and index
  await getDatabase();
  logger.info('Database initialized');

  // Perform initial vault scan to populate index
  const indexedCount = await performInitialScan();
  logger.info(`Indexed ${indexedCount} notes`);

  // Start file watcher for external changes
  if (config.watchEnabled) {
    startWatcher();
  }

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

  // Start HTTP transport if enabled, otherwise use stdio
  if (isHttpEnabled()) {
    await startHttpTransport();
    logger.info('Server running with HTTP transport');
  } else {
    // Connect to stdio transport
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logger.info('Server connected with stdio transport');
  }
}

// Graceful shutdown handler
async function shutdown(): Promise<void> {
  logger.info('Shutting down...');
  await stopWatcher();
  if (isHttpEnabled()) {
    await stopHttpTransport();
  }
  closeDatabase();
  logger.info('Shutdown complete');
  process.exit(0);
}

// Register shutdown handlers
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Run the server
main().catch((error) => {
  logger.error('Fatal error', error);
  process.exit(1);
});
