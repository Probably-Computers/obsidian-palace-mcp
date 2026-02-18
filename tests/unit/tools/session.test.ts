/**
 * Session tools tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { join } from 'path';
import { mkdir, rm, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

// Set up test environment before importing services
const testDir = join(tmpdir(), `palace-session-test-${randomUUID()}`);
const testVault = join(testDir, 'vault');
const testPalace = join(testVault, '.palace');

// Configure environment before imports (use PALACE_VAULTS instead of PALACE_VAULT_PATH)
process.env.PALACE_VAULTS = `${testVault}:test:rw`;
process.env.PALACE_LOG_LEVEL = 'error';
process.env.PALACE_WATCH_ENABLED = 'false';

// Dynamic imports after env setup
import { resetConfig } from '../../../src/config/index';

describe('Session Tools', () => {
  beforeAll(async () => {
    // Create test vault directory
    await mkdir(testVault, { recursive: true });
    await mkdir(testPalace, { recursive: true });
    resetConfig();

    // Initialize database for session_end time entry creation
    const { createDatabase, initializeSchema } = await import(
      '../../../src/services/index/sqlite'
    );
    const { getIndexManager } = await import(
      '../../../src/services/index/manager'
    );
    const db = createDatabase(join(testPalace, 'index.sqlite'));
    initializeSchema(db);
    // Pre-initialize the index manager
    const manager = getIndexManager();
    await manager.getIndex('test');
  });

  afterAll(async () => {
    // Clean up test directory
    const { getIndexManager } = await import(
      '../../../src/services/index/manager'
    );
    getIndexManager().closeAll();
    await rm(testDir, { recursive: true, force: true });
  });

  describe('palace_session_start', () => {
    beforeEach(async () => {
      // Clear any existing session
      const { clearSession } = await import('../../../src/tools/session');
      clearSession();

      // Clean daily directory
      const dailyDir = join(testVault, 'daily');
      try {
        await rm(dailyDir, { recursive: true, force: true });
      } catch {
        // Directory may not exist
      }
    });

    it('creates a new session and daily log file', async () => {
      const { sessionStartHandler, getCurrentSession } = await import(
        '../../../src/tools/session'
      );

      const result = await sessionStartHandler({
        topic: 'Kubernetes networking research',
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      if (result.success) {
        expect(result.data.topic).toBe('Kubernetes networking research');
        expect(result.data.sessionNumber).toBe(1);
        expect(result.data.logPath).toMatch(/^daily\/\d{4}-\d{2}-\d{2}\.md$/);
      }

      // Verify session is active
      const session = getCurrentSession();
      expect(session).not.toBeNull();
      expect(session?.topic).toBe('Kubernetes networking research');
    });

    it('includes optional context', async () => {
      const { sessionStartHandler } = await import('../../../src/tools/session');

      const result = await sessionStartHandler({
        topic: 'Docker troubleshooting',
        context: 'Client project',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.context).toBe('Client project');
      }
    });

    it('creates proper daily log format', async () => {
      const { sessionStartHandler } = await import('../../../src/tools/session');

      const result = await sessionStartHandler({
        topic: 'Test session',
        context: 'Unit tests',
      });

      expect(result.success).toBe(true);

      if (result.success) {
        // Read the actual file
        const logPath = join(testVault, result.data.logPath);
        const content = await readFile(logPath, 'utf-8');

        // Check frontmatter
        expect(content).toContain('type: daily');
        expect(content).toContain('sessions: 1');

        // Check session section
        expect(content).toContain('## Session 1: Test session');
        expect(content).toContain('**Started**:');
        expect(content).toContain('**Context**: Unit tests');
        expect(content).toContain('### Log');
      }
    });

    it('increments session number for subsequent sessions', async () => {
      const { sessionStartHandler, clearSession } = await import(
        '../../../src/tools/session'
      );

      // Start first session
      await sessionStartHandler({ topic: 'First session' });
      clearSession();

      // Start second session
      const result = await sessionStartHandler({ topic: 'Second session' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.sessionNumber).toBe(2);
      }
    });

    it('requires a topic', async () => {
      const { sessionStartHandler } = await import('../../../src/tools/session');

      const result = await sessionStartHandler({});

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe('VALIDATION_ERROR');
        expect(result.error).toContain('topic');
      }
    });
  });

  describe('palace_session_log', () => {
    beforeEach(async () => {
      // Clear any existing session
      const { clearSession } = await import('../../../src/tools/session');
      clearSession();

      // Clean daily directory
      const dailyDir = join(testVault, 'daily');
      try {
        await rm(dailyDir, { recursive: true, force: true });
      } catch {
        // Directory may not exist
      }
    });

    it('fails without an active session', async () => {
      const { sessionLogHandler } = await import('../../../src/tools/session');

      const result = await sessionLogHandler({
        entry: 'Found some interesting documentation',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe('NO_SESSION');
        expect(result.error).toContain('No active session');
      }
    });

    it('logs an entry to the current session', async () => {
      const { sessionStartHandler, sessionLogHandler, getCurrentSession } =
        await import('../../../src/tools/session');

      // Start a session first
      await sessionStartHandler({ topic: 'Test session' });

      // Log an entry
      const result = await sessionLogHandler({
        entry: 'Discovered important pattern',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.entry).toBe('Discovered important pattern');
        expect(result.data.entryNumber).toBe(1);
      }

      // Verify entry was added to session
      const session = getCurrentSession();
      expect(session?.entries.length).toBe(1);
      expect(session?.entries[0]?.entry).toBe('Discovered important pattern');
    });

    it('logs multiple entries', async () => {
      const { sessionStartHandler, sessionLogHandler, getCurrentSession } =
        await import('../../../src/tools/session');

      await sessionStartHandler({ topic: 'Research session' });

      await sessionLogHandler({ entry: 'First finding' });
      await sessionLogHandler({ entry: 'Second finding' });
      const result = await sessionLogHandler({ entry: 'Third finding' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.entryNumber).toBe(3);
      }

      const session = getCurrentSession();
      expect(session?.entries.length).toBe(3);
    });

    it('tracks notes created', async () => {
      const { sessionStartHandler, sessionLogHandler } = await import(
        '../../../src/tools/session'
      );

      await sessionStartHandler({ topic: 'Documentation session' });

      const result = await sessionLogHandler({
        entry: 'Created documentation for API',
        notes_created: ['research/api-docs.md', 'reference/endpoints.md'],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.notesCreated).toEqual([
          'research/api-docs.md',
          'reference/endpoints.md',
        ]);
      }
    });

    it('writes entries to daily log file', async () => {
      const { sessionStartHandler, sessionLogHandler } = await import(
        '../../../src/tools/session'
      );

      const startResult = await sessionStartHandler({ topic: 'File test' });
      expect(startResult.success).toBe(true);

      await sessionLogHandler({ entry: 'Test entry one' });
      await sessionLogHandler({ entry: 'Test entry two' });

      if (startResult.success) {
        const logPath = join(testVault, startResult.data.logPath);
        const content = await readFile(logPath, 'utf-8');

        expect(content).toContain('Test entry one');
        expect(content).toContain('Test entry two');
      }
    });

    it('requires an entry', async () => {
      const { sessionStartHandler, sessionLogHandler } = await import(
        '../../../src/tools/session'
      );

      await sessionStartHandler({ topic: 'Validation test' });

      const result = await sessionLogHandler({});

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe('VALIDATION_ERROR');
        expect(result.error).toContain('entry');
      }
    });
  });

  describe('palace_session_end', () => {
    beforeEach(async () => {
      const { clearSession } = await import('../../../src/tools/session');
      clearSession();

      const dailyDir = join(testVault, 'daily');
      try {
        await rm(dailyDir, { recursive: true, force: true });
      } catch {
        // Directory may not exist
      }

      // Clean time entries
      const timeDir = join(testVault, 'time');
      try {
        await rm(timeDir, { recursive: true, force: true });
      } catch {
        // Directory may not exist
      }
    });

    it('fails without an active session', async () => {
      const { sessionEndHandler } = await import('../../../src/tools/session');

      const result = await sessionEndHandler({});

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe('NO_SESSION');
      }
    });

    it('ends a session and calculates duration', async () => {
      const { sessionStartHandler, sessionEndHandler, getCurrentSession } =
        await import('../../../src/tools/session');

      await sessionStartHandler({ topic: 'Test ending session' });
      const result = await sessionEndHandler({});

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.topic).toBe('Test ending session');
        expect(result.data.duration_minutes).toBeTypeOf('number');
        expect(result.data.duration_formatted).toBeTypeOf('string');
      }

      // Session should be cleared
      expect(getCurrentSession()).toBeNull();
    });

    it('updates the daily log with end time and duration', async () => {
      const { sessionStartHandler, sessionEndHandler } =
        await import('../../../src/tools/session');

      const startResult = await sessionStartHandler({ topic: 'Duration test' });
      expect(startResult.success).toBe(true);

      const endResult = await sessionEndHandler({});
      expect(endResult.success).toBe(true);

      if (startResult.success) {
        const logPath = join(testVault, startResult.data.logPath);
        const content = await readFile(logPath, 'utf-8');

        expect(content).toContain('**Ended**:');
        expect(content).toContain('**Duration**:');
      }
    });

    it('creates a time entry when project is specified', async () => {
      const { sessionStartHandler, sessionEndHandler } =
        await import('../../../src/tools/session');

      await sessionStartHandler({ topic: 'Time tracked session' });
      const result = await sessionEndHandler({
        project: 'TestProject',
        category: 'development',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.time_entry_path).toBeDefined();
        expect(result.data.time_entry_path).toContain('time/');
      }
    });

    it('does not create a time entry when project is not specified', async () => {
      const { sessionStartHandler, sessionEndHandler } =
        await import('../../../src/tools/session');

      await sessionStartHandler({ topic: 'No time entry session' });
      const result = await sessionEndHandler({});

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.time_entry_path).toBeUndefined();
      }
    });
  });
});
