/**
 * Tool registration and dispatch
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolResult } from '../types/index.js';

// Import tool handlers
import { rememberTool, rememberHandler } from './remember.js';
import { readTool, readHandler } from './read.js';
import { recallTool, recallHandler } from './recall.js';
import { listTool, listHandler } from './list.js';
import { structureTool, structureHandler } from './structure.js';
import { updateTool, updateHandler } from './update.js';
import { queryTool, queryHandler } from './query.js';
import { linksTool, linksHandler } from './links.js';
import { orphansTool, orphansHandler } from './orphans.js';
import { relatedTool, relatedHandler } from './related.js';
import { autolinkTool, autolinkHandler } from './autolink.js';
import { dataviewTool, dataviewHandler } from './dataview.js';
import {
  sessionStartTool,
  sessionStartHandler,
  sessionLogTool,
  sessionLogHandler,
} from './session.js';
import { vaultsTool, vaultsHandler } from './vaults.js';
import { storeTool, storeHandler } from './store.js';
import { checkTool, checkHandler } from './check.js';
import { improveTool, improveHandler } from './improve.js';
import {
  standardsTool,
  standardsHandler,
  standardsValidateTool,
  standardsValidateHandler,
} from './standards.js';

// Tool registry
const tools: Map<string, Tool> = new Map();
const handlers: Map<string, (args: Record<string, unknown>) => Promise<ToolResult>> = new Map();

/**
 * Register all tools
 */
export function registerTools(): void {
  // Core tools
  tools.set('palace_remember', rememberTool);
  handlers.set('palace_remember', rememberHandler);

  tools.set('palace_read', readTool);
  handlers.set('palace_read', readHandler);

  tools.set('palace_recall', recallTool);
  handlers.set('palace_recall', recallHandler);

  tools.set('palace_list', listTool);
  handlers.set('palace_list', listHandler);

  tools.set('palace_structure', structureTool);
  handlers.set('palace_structure', structureHandler);

  // Phase 003 tools
  tools.set('palace_update', updateTool);
  handlers.set('palace_update', updateHandler);

  tools.set('palace_query', queryTool);
  handlers.set('palace_query', queryHandler);

  // Phase 004 tools - Graph Intelligence
  tools.set('palace_links', linksTool);
  handlers.set('palace_links', linksHandler);

  tools.set('palace_orphans', orphansTool);
  handlers.set('palace_orphans', orphansHandler);

  tools.set('palace_related', relatedTool);
  handlers.set('palace_related', relatedHandler);

  // Phase 005 tools - Auto-linking
  tools.set('palace_autolink', autolinkTool);
  handlers.set('palace_autolink', autolinkHandler);

  // Phase 006 tools - Dataview
  tools.set('palace_dataview', dataviewTool);
  handlers.set('palace_dataview', dataviewHandler);

  // Phase 007 tools - Session tracking
  tools.set('palace_session_start', sessionStartTool);
  handlers.set('palace_session_start', sessionStartHandler);

  tools.set('palace_session_log', sessionLogTool);
  handlers.set('palace_session_log', sessionLogHandler);

  // Phase 008 tools - Multi-vault
  tools.set('palace_vaults', vaultsTool);
  handlers.set('palace_vaults', vaultsHandler);

  // Phase 011 tools - Intent-based storage
  tools.set('palace_store', storeTool);
  handlers.set('palace_store', storeHandler);

  tools.set('palace_check', checkTool);
  handlers.set('palace_check', checkHandler);

  tools.set('palace_improve', improveTool);
  handlers.set('palace_improve', improveHandler);

  // Phase 013 tools - Standards
  tools.set('palace_standards', standardsTool);
  handlers.set('palace_standards', standardsHandler);

  tools.set('palace_standards_validate', standardsValidateTool);
  handlers.set('palace_standards_validate', standardsValidateHandler);
}

/**
 * Get all tool definitions
 */
export function getToolDefinitions(): Tool[] {
  if (tools.size === 0) {
    registerTools();
  }
  return Array.from(tools.values());
}

/**
 * Handle a tool call
 */
export async function handleToolCall(
  name: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  if (handlers.size === 0) {
    registerTools();
  }

  const handler = handlers.get(name);
  if (!handler) {
    return {
      success: false,
      error: `Unknown tool: ${name}`,
      code: 'UNKNOWN_TOOL',
    };
  }

  return handler(args);
}
