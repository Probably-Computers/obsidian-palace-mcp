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

import { logger } from './utils/logger.js';
import { handleToolCall, getToolDefinitions } from './tools/index.js';
import { getIndexManager, resetIndexManager } from './services/index/index.js';
import {
  startAllWatchers,
  stopAllWatchers,
  performAllVaultScans,
  initializeRegistry,
} from './services/vault/index.js';
import { startHttpTransport, stopHttpTransport, isHttpEnabled } from './transports/index.js';

async function main(): Promise<void> {
  // Initialize vault registry from global config
  const registry = initializeRegistry();
  const globalConfig = registry.getGlobalConfig();
  logger.setLevel(globalConfig.settings.log_level);

  const vaults = registry.listVaults();
  logger.info('Starting Obsidian Palace MCP Server', {
    vaultCount: vaults.length,
    defaultVault: registry.getDefaultVault().alias,
    logLevel: globalConfig.settings.log_level,
    watchEnabled: globalConfig.settings.watch_enabled,
  });

  // Initialize index manager and databases for all vaults
  const manager = getIndexManager();
  await manager.initializeAllVaults();
  logger.info('All vault databases initialized');

  // Perform initial scan for all vaults
  const scanResults = await performAllVaultScans();
  let totalIndexed = 0;
  for (const [alias, count] of scanResults) {
    logger.info(`Indexed ${count} notes in vault '${alias}'`);
    totalIndexed += count;
  }
  logger.info(`Total: ${totalIndexed} notes indexed across ${scanResults.size} vaults`);

  // Start file watchers for all vaults
  if (globalConfig.settings.watch_enabled) {
    startAllWatchers();
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
  await stopAllWatchers();
  if (isHttpEnabled()) {
    await stopHttpTransport();
  }
  resetIndexManager();
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
