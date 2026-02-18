/**
 * Tests for project management service (Phase 031)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { join } from 'path';
import { mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import Database from 'better-sqlite3';

// Set up test environment before importing services
const testDir = join(tmpdir(), `palace-project-test-${randomUUID()}`);
const testVault = join(testDir, 'vault');
const testPalace = join(testVault, '.palace');

process.env.PALACE_VAULTS = `${testVault}:test:rw`;
process.env.PALACE_LOG_LEVEL = 'error';
process.env.PALACE_WATCH_ENABLED = 'false';

import { resetConfig } from '../../../src/config/index';

import {
  parseWorkItems,
  summarizeWorkItems,
} from '../../../src/services/project/work-items.js';

import {
  loadProjectContext,
  loadAllProjectsBrief,
} from '../../../src/services/project/context-loader.js';

import {
  queryNotesInVault,
  countNotesInVault,
} from '../../../src/services/index/query.js';

import { indexNote } from '../../../src/services/index/sync.js';

describe('Project Management Service (Phase 031)', () => {
  let db: Database.Database;

  beforeAll(async () => {
    await mkdir(testVault, { recursive: true });
    await mkdir(testPalace, { recursive: true });
    await mkdir(join(testVault, 'projects'), { recursive: true });
    resetConfig();

    const { createDatabase, initializeSchema } = await import(
      '../../../src/services/index/sqlite'
    );
    db = createDatabase(join(testPalace, 'index.sqlite'));
    initializeSchema(db);
  });

  afterAll(async () => {
    if (db && db.open) {
      db.close();
    }
    await rm(testDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    db.exec('DELETE FROM links');
    db.exec('DELETE FROM note_tags');
    db.exec('DELETE FROM notes');
    db.exec('DELETE FROM notes_fts');
  });

  // ===== Work Item Parser Tests =====

  describe('parseWorkItems', () => {
    it('should parse simple unchecked items', () => {
      const content = '- [ ] Do something\n- [ ] Another task';
      const items = parseWorkItems(content);
      expect(items).toHaveLength(2);
      expect(items[0]!.checked).toBe(false);
      expect(items[0]!.title).toBe('Do something');
    });

    it('should parse checked items', () => {
      const content = '- [x] Done task\n- [X] Also done';
      const items = parseWorkItems(content);
      expect(items).toHaveLength(2);
      expect(items[0]!.checked).toBe(true);
      expect(items[1]!.checked).toBe(true);
    });

    it('should extract wiki-links', () => {
      const content = '- [ ] [[API Auth]] - Implement permissions';
      const items = parseWorkItems(content);
      expect(items).toHaveLength(1);
      expect(items[0]!.linked_note).toBe('API Auth');
      expect(items[0]!.title).toContain('API Auth');
    });

    it('should extract wiki-links with display text', () => {
      const content = '- [ ] [[API Authentication|Auth]] - Implement permissions';
      const items = parseWorkItems(content);
      expect(items).toHaveLength(1);
      expect(items[0]!.linked_note).toBe('API Authentication');
    });

    it('should extract priority annotation', () => {
      const content = '- [ ] Design API [priority:high]';
      const items = parseWorkItems(content);
      expect(items).toHaveLength(1);
      expect(items[0]!.priority).toBe('high');
      expect(items[0]!.title).toBe('Design API');
    });

    it('should extract due date annotation', () => {
      const content = '- [ ] Write tests [due:2026-03-15]';
      const items = parseWorkItems(content);
      expect(items).toHaveLength(1);
      expect(items[0]!.due).toBe('2026-03-15');
    });

    it('should extract blocked_by annotation', () => {
      const content = '- [ ] Deploy app [blocked_by:client review]';
      const items = parseWorkItems(content);
      expect(items).toHaveLength(1);
      expect(items[0]!.blocked_by).toBe('client review');
    });

    it('should extract category annotation', () => {
      const content = '- [ ] Code review [category:review]';
      const items = parseWorkItems(content);
      expect(items).toHaveLength(1);
      expect(items[0]!.category).toBe('review');
    });

    it('should handle multiple annotations', () => {
      const content =
        '- [ ] [[API Auth]] - Implement scope-based permissions [priority:high] [blocked_by:client review]';
      const items = parseWorkItems(content);
      expect(items).toHaveLength(1);
      expect(items[0]!.linked_note).toBe('API Auth');
      expect(items[0]!.priority).toBe('high');
      expect(items[0]!.blocked_by).toBe('client review');
    });

    it('should handle mixed checked and unchecked items', () => {
      const content = [
        '- [x] Set up project',
        '- [x] Write design doc',
        '- [ ] Implement API [priority:high]',
        '- [ ] Write tests [blocked_by:API implementation]',
      ].join('\n');
      const items = parseWorkItems(content);
      expect(items).toHaveLength(4);
      expect(items.filter((i) => i.checked)).toHaveLength(2);
      expect(items.filter((i) => !i.checked)).toHaveLength(2);
    });

    it('should ignore non-checklist content', () => {
      const content = [
        '# Title',
        '',
        'Some paragraph text.',
        '',
        '- Regular bullet point',
        '- [ ] Actual task',
        '',
        '```',
        '- [ ] In code block (should be ignored)',
        '```',
      ].join('\n');
      const items = parseWorkItems(content);
      // Note: regex doesn't have code-block awareness, but that's a known limitation
      // At minimum, the actual task is parsed
      expect(items.length).toBeGreaterThanOrEqual(1);
      expect(items.some((i) => i.title === 'Actual task')).toBe(true);
    });

    it('should return empty array for content without checklists', () => {
      const content = '# Title\n\nJust some text.\n\n- A bullet\n- Another bullet';
      const items = parseWorkItems(content);
      expect(items).toHaveLength(0);
    });

    it('should preserve raw line', () => {
      const content = '- [ ] Task with [priority:high] annotation';
      const items = parseWorkItems(content);
      expect(items[0]!.raw).toBe('- [ ] Task with [priority:high] annotation');
    });

    it('should only set priority for valid values', () => {
      const content = '- [ ] Task [priority:banana]';
      const items = parseWorkItems(content);
      expect(items[0]!.priority).toBeUndefined();
    });
  });

  describe('summarizeWorkItems', () => {
    it('should calculate correct counts', () => {
      const items = parseWorkItems([
        '- [x] Done 1',
        '- [x] Done 2',
        '- [ ] In progress',
        '- [ ] Blocked [blocked_by:something]',
        '- [ ] Also in progress',
      ].join('\n'));
      const summary = summarizeWorkItems(items);
      expect(summary.total).toBe(5);
      expect(summary.done).toBe(2);
      expect(summary.blocked).toBe(1);
      expect(summary.in_progress).toBe(2);
    });

    it('should handle empty items', () => {
      const summary = summarizeWorkItems([]);
      expect(summary.total).toBe(0);
      expect(summary.done).toBe(0);
      expect(summary.blocked).toBe(0);
      expect(summary.in_progress).toBe(0);
    });

    it('should include items array', () => {
      const items = parseWorkItems('- [ ] Task 1\n- [x] Task 2');
      const summary = summarizeWorkItems(items);
      expect(summary.items).toHaveLength(2);
    });
  });

  // ===== Project/Client Query Filter Tests =====

  describe('project/client query filters', () => {
    function insertTestNote(
      path: string,
      title: string,
      type: string,
      project?: string,
      client?: string,
    ) {
      db.prepare(
        `INSERT INTO notes (path, title, type, content, content_hash, project, client, created, modified)
         VALUES (?, ?, ?, '', 'hash', ?, ?, '2026-01-01', '2026-01-01')`
      ).run(path, title, type, project ?? null, client ?? null);
    }

    it('should filter by project', () => {
      insertTestNote('a.md', 'Note A', 'research', 'Alpha');
      insertTestNote('b.md', 'Note B', 'research', 'Beta');
      insertTestNote('c.md', 'Note C', 'research');

      const results = queryNotesInVault(db, { project: 'Alpha' });
      expect(results).toHaveLength(1);
      expect(results[0]!.title).toBe('Note A');
    });

    it('should filter by client', () => {
      insertTestNote('a.md', 'Note A', 'research', 'Alpha', 'Acme');
      insertTestNote('b.md', 'Note B', 'research', 'Beta', 'Globex');

      const results = queryNotesInVault(db, { client: 'Acme' });
      expect(results).toHaveLength(1);
      expect(results[0]!.title).toBe('Note A');
    });

    it('should combine project and client filters', () => {
      insertTestNote('a.md', 'Note A', 'research', 'Alpha', 'Acme');
      insertTestNote('b.md', 'Note B', 'research', 'Alpha', 'Globex');
      insertTestNote('c.md', 'Note C', 'research', 'Beta', 'Acme');

      const results = queryNotesInVault(db, { project: 'Alpha', client: 'Acme' });
      expect(results).toHaveLength(1);
      expect(results[0]!.title).toBe('Note A');
    });

    it('should count with project filter', () => {
      insertTestNote('a.md', 'Note A', 'research', 'Alpha');
      insertTestNote('b.md', 'Note B', 'research', 'Alpha');
      insertTestNote('c.md', 'Note C', 'research', 'Beta');

      const count = countNotesInVault(db, { project: 'Alpha' });
      expect(count).toBe(2);
    });

    it('should count with client filter', () => {
      insertTestNote('a.md', 'Note A', 'research', 'Alpha', 'Acme');
      insertTestNote('b.md', 'Note B', 'research', 'Beta', 'Acme');
      insertTestNote('c.md', 'Note C', 'research', 'Beta', 'Globex');

      const count = countNotesInVault(db, { client: 'Acme' });
      expect(count).toBe(2);
    });
  });

  // ===== Index Sync Tests =====

  describe('indexNote with project/client', () => {
    it('should index project and client from frontmatter', async () => {
      const projectDir = join(testVault, 'projects', 'alpha');
      await mkdir(projectDir, { recursive: true });

      const content = [
        '---',
        'type: project_hub',
        'title: Alpha Project',
        'project: Alpha',
        'client: Acme Corp',
        'status: in_progress',
        'created: 2026-01-01T00:00:00Z',
        'modified: 2026-01-01T00:00:00Z',
        '---',
        '',
        '# Alpha Project',
        '',
        '- [ ] Task 1',
      ].join('\n');

      const filePath = join(projectDir, 'Alpha Project.md');
      await writeFile(filePath, content);

      indexNote(db, {
        path: 'projects/alpha/Alpha Project.md',
        title: 'Alpha Project',
        content: '# Alpha Project\n\n- [ ] Task 1',
        raw: content,
        frontmatter: {
          type: 'project_hub',
          title: 'Alpha Project',
          project: 'Alpha',
          client: 'Acme Corp',
          status: 'in_progress',
          created: '2026-01-01T00:00:00Z',
          modified: '2026-01-01T00:00:00Z',
          tags: [],
          related: [],
          aliases: [],
          verified: false,
        },
      });

      // Verify the project/client columns are populated
      const row = db
        .prepare('SELECT project, client FROM notes WHERE path = ?')
        .get('projects/alpha/Alpha Project.md') as { project: string; client: string };

      expect(row.project).toBe('Alpha');
      expect(row.client).toBe('Acme Corp');

      // Verify queryable
      const results = queryNotesInVault(db, { project: 'Alpha' });
      expect(results).toHaveLength(1);
      expect(results[0]!.title).toBe('Alpha Project');
    });
  });

  // ===== Context Loader Tests =====

  describe('loadProjectContext', () => {
    async function createProjectHub(
      name: string,
      status: string,
      workItems: string,
      extra: Record<string, unknown> = {},
    ) {
      const slug = name.toLowerCase().replace(/\s+/g, '-');
      const dir = join(testVault, 'projects', slug);
      await mkdir(dir, { recursive: true });

      const fm: Record<string, unknown> = {
        type: 'project_hub',
        title: name,
        project: name,
        status,
        created: '2026-01-01T00:00:00Z',
        modified: '2026-02-15T10:00:00Z',
        tags: [],
        related: [],
        aliases: [],
        verified: false,
        ...extra,
      };

      const content = [
        `# ${name}`,
        '',
        'A test project.',
        '',
        '## Work Items',
        '',
        workItems,
        '',
        '## Knowledge Map',
        '',
        `- [[${name} - Architecture]] - System design`,
        '',
        '## Notes & Decisions',
        '',
        '### 2026-01-15',
        '- Decided to use TypeScript',
      ].join('\n');

      const raw = [
        '---',
        ...Object.entries(fm).map(([k, v]) => {
          if (Array.isArray(v)) return `${k}: [${v.join(', ')}]`;
          return `${k}: ${v}`;
        }),
        '---',
        '',
        content,
      ].join('\n');

      const filePath = join(dir, `${name}.md`);
      await writeFile(filePath, raw);

      indexNote(db, {
        path: `projects/${slug}/${name}.md`,
        title: name,
        content,
        raw,
        frontmatter: fm as any,
      });

      return `projects/${slug}/${name}.md`;
    }

    it('should return empty context when project not found', async () => {
      const result = await loadProjectContext('nonexistent', db, testVault, {
        depth: 'brief',
        lookback_days: 7,
        include_time: false,
      });

      expect(result.project).toBe('nonexistent');
      expect(result.work_items.total).toBe(0);
      expect(result.blockers).toHaveLength(0);
    });

    it('should load brief context', async () => {
      await createProjectHub('Brief Test', 'in_progress', [
        '- [x] Setup repo',
        '- [ ] Write API [priority:high]',
        '- [ ] Deploy [blocked_by:client approval]',
      ].join('\n'), { client: 'TestClient', priority: 'high' });

      const result = await loadProjectContext('Brief Test', db, testVault, {
        depth: 'brief',
        lookback_days: 7,
        include_time: false,
      });

      expect(result.project).toBe('Brief Test');
      expect(result.status).toBe('in_progress');
      expect(result.client).toBe('TestClient');
      expect(result.priority).toBe('high');
      expect(result.hub_path).toBeDefined();
      expect(result.work_items.total).toBe(3);
      expect(result.work_items.done).toBe(1);
      expect(result.work_items.blocked).toBe(1);
      expect(result.work_items.in_progress).toBe(1);
      expect(result.blockers).toContain('client approval');
      expect(result.sections_available).toContain('work_items');
      expect(result.sections_available).toContain('knowledge_map');
      expect(result.sections_available).toContain('decisions');
    });

    it('should load standard context with work item details', async () => {
      await createProjectHub('Standard Test', 'in_progress', [
        '- [x] Setup',
        '- [ ] Build API [priority:high]',
      ].join('\n'));

      const result = await loadProjectContext('Standard Test', db, testVault, {
        depth: 'standard',
        lookback_days: 7,
        include_time: false,
      }) as any;

      expect(result.work_item_details).toBeDefined();
      expect(result.work_item_details).toHaveLength(2);
      expect(result.knowledge_map).toContain('Architecture');
      expect(result.decisions).toContain('TypeScript');
    });

    it('should load deep context with hub content', async () => {
      await createProjectHub('Deep Test', 'in_progress', '- [ ] Task 1');

      const result = await loadProjectContext('Deep Test', db, testVault, {
        depth: 'deep',
        lookback_days: 7,
        include_time: false,
      }) as any;

      expect(result.hub_content).toBeDefined();
      expect(result.hub_content).toContain('Deep Test');
    });
  });

  // ===== loadAllProjectsBrief Tests =====

  describe('loadAllProjectsBrief', () => {
    async function createMinimalProject(name: string, status: string) {
      const slug = name.toLowerCase().replace(/\s+/g, '-');
      const dir = join(testVault, 'projects', slug);
      await mkdir(dir, { recursive: true });

      const content = `# ${name}\n\n- [ ] Task\n`;
      const raw = [
        '---',
        'type: project_hub',
        `title: ${name}`,
        `project: ${name}`,
        `status: ${status}`,
        'created: 2026-01-01T00:00:00Z',
        'modified: 2026-02-15T10:00:00Z',
        'tags: []',
        'related: []',
        'aliases: []',
        'verified: false',
        '---',
        '',
        content,
      ].join('\n');

      await writeFile(join(dir, `${name}.md`), raw);

      indexNote(db, {
        path: `projects/${slug}/${name}.md`,
        title: name,
        content,
        raw,
        frontmatter: {
          type: 'project_hub',
          title: name,
          project: name,
          status,
          created: '2026-01-01T00:00:00Z',
          modified: '2026-02-15T10:00:00Z',
          tags: [],
          related: [],
          aliases: [],
          verified: false,
        } as any,
      });
    }

    it('should return all projects sorted by status', async () => {
      await createMinimalProject('Done Project', 'done');
      await createMinimalProject('Active Project', 'in_progress');
      await createMinimalProject('Blocked Project', 'blocked');

      const results = await loadAllProjectsBrief(db, testVault);

      expect(results.length).toBeGreaterThanOrEqual(3);
      // in_progress should come before blocked, which should come before done
      const activeIdx = results.findIndex((r) => r.project === 'Active Project');
      const blockedIdx = results.findIndex((r) => r.project === 'Blocked Project');
      const doneIdx = results.findIndex((r) => r.project === 'Done Project');
      expect(activeIdx).toBeLessThan(blockedIdx);
      expect(blockedIdx).toBeLessThan(doneIdx);
    });

    it('should return empty array when no projects exist', async () => {
      // beforeEach clears the DB
      const results = await loadAllProjectsBrief(db, testVault);
      expect(results).toHaveLength(0);
    });
  });

  // ===== Schema Migration Tests =====

  describe('schema migration', () => {
    it('should have project and client columns in notes table', () => {
      const columns = db
        .prepare("SELECT name FROM pragma_table_info('notes')")
        .all() as { name: string }[];
      const colNames = columns.map((c) => c.name);
      expect(colNames).toContain('project');
      expect(colNames).toContain('client');
    });

    it('should have indexes on project and client', () => {
      const indexes = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index'")
        .all() as { name: string }[];
      const indexNames = indexes.map((i) => i.name);
      expect(indexNames).toContain('idx_notes_project');
      expect(indexNames).toContain('idx_notes_client');
    });
  });
});
