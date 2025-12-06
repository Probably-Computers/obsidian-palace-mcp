/**
 * HTTP/SSE Transport for MCP Server
 * Provides an alternative to stdio for web clients
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import type { Server as HttpServer } from 'http';
import { logger } from '../utils/logger.js';
import { handleToolCall, getToolDefinitions } from '../tools/index.js';

// SSE client connections
interface SSEClient {
  id: string;
  response: Response;
}

let clients: SSEClient[] = [];
let httpServer: HttpServer | null = null;

/**
 * HTTP Transport configuration
 */
export interface HttpTransportConfig {
  port: number;
  corsOrigin: string;
}

/**
 * Get HTTP transport configuration from environment
 */
export function getHttpConfig(): HttpTransportConfig {
  return {
    port: parseInt(process.env.HTTP_PORT || '3000', 10),
    corsOrigin: process.env.HTTP_CORS_ORIGIN || '*',
  };
}

/**
 * Check if HTTP transport is enabled
 */
export function isHttpEnabled(): boolean {
  return process.env.HTTP_ENABLED === 'true';
}

/**
 * Send SSE message to all connected clients
 */
function broadcast(event: string, data: unknown): void {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  clients.forEach((client) => {
    client.response.write(message);
  });
}

/**
 * Create and start the HTTP server
 */
export async function startHttpTransport(): Promise<void> {
  const config = getHttpConfig();
  const app = express();

  // Middleware
  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json());

  // Request logging middleware
  app.use((req: Request, _res: Response, next: NextFunction) => {
    logger.debug(`HTTP ${req.method} ${req.path}`);
    next();
  });

  // Health check endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      transport: 'http',
      clients: clients.length,
      timestamp: new Date().toISOString(),
    });
  });

  // SSE endpoint for server-to-client communication
  app.get('/sse', (req: Request, res: Response) => {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // Send initial connection event
    const clientId = `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    res.write(`event: connected\ndata: ${JSON.stringify({ clientId })}\n\n`);

    // Add to clients list
    const client: SSEClient = { id: clientId, response: res };
    clients.push(client);
    logger.info(`SSE client connected: ${clientId} (total: ${clients.length})`);

    // Send heartbeat every 30 seconds
    const heartbeat = setInterval(() => {
      res.write(`event: heartbeat\ndata: ${JSON.stringify({ timestamp: Date.now() })}\n\n`);
    }, 30000);

    // Handle client disconnect
    req.on('close', () => {
      clearInterval(heartbeat);
      clients = clients.filter((c) => c.id !== clientId);
      logger.info(`SSE client disconnected: ${clientId} (total: ${clients.length})`);
    });
  });

  // List available tools
  app.get('/tools', (_req: Request, res: Response) => {
    const tools = getToolDefinitions();
    res.json({ tools });
  });

  // Execute tool endpoint
  app.post('/message', async (req: Request, res: Response) => {
    const { method, params } = req.body;

    if (method === 'tools/list') {
      const tools = getToolDefinitions();
      res.json({ result: { tools } });
      return;
    }

    if (method === 'tools/call') {
      const { name, arguments: args } = params || {};

      if (!name) {
        res.status(400).json({ error: 'Tool name is required' });
        return;
      }

      try {
        const result = await handleToolCall(name, args || {});

        // Broadcast result to SSE clients
        broadcast('tool_result', { name, result });

        res.json({
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          },
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        res.status(500).json({
          error: errorMessage,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: errorMessage,
                }),
              },
            ],
            isError: true,
          },
        });
      }
      return;
    }

    res.status(400).json({ error: `Unknown method: ${method}` });
  });

  // Error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error('HTTP error', err);
    res.status(500).json({ error: err.message });
  });

  // Start server
  return new Promise((resolve) => {
    httpServer = app.listen(config.port, () => {
      logger.info(`HTTP transport listening on port ${config.port}`);
      resolve();
    });
  });
}

/**
 * Stop the HTTP server
 */
export async function stopHttpTransport(): Promise<void> {
  if (!httpServer) return;

  // Close all SSE connections
  clients.forEach((client) => {
    client.response.end();
  });
  clients = [];

  // Close HTTP server
  return new Promise((resolve) => {
    httpServer?.close(() => {
      logger.info('HTTP transport stopped');
      httpServer = null;
      resolve();
    });
  });
}
