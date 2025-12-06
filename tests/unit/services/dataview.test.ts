/**
 * Dataview service tests
 */

import { describe, it, expect } from 'vitest';
import {
  parseDQL,
  DQLParseError,
  formatAsTable,
  formatAsList,
  formatAsTask,
  formatAsJson,
  type ExecutionResult,
} from '../../../src/services/dataview/index';

describe('dataview/parser', () => {
  describe('parseDQL', () => {
    describe('query types', () => {
      it('parses TABLE query', () => {
        const result = parseDQL('TABLE');
        expect(result.type).toBe('TABLE');
        expect(result.fields).toEqual([]);
      });

      it('parses LIST query', () => {
        const result = parseDQL('LIST');
        expect(result.type).toBe('LIST');
      });

      it('parses TASK query', () => {
        const result = parseDQL('TASK');
        expect(result.type).toBe('TASK');
      });

      it('is case insensitive for keywords', () => {
        const result = parseDQL('table');
        expect(result.type).toBe('TABLE');
      });
    });

    describe('field selection', () => {
      it('parses single field', () => {
        const result = parseDQL('TABLE title');
        expect(result.fields).toEqual(['title']);
      });

      it('parses multiple fields', () => {
        const result = parseDQL('TABLE title, confidence, type');
        expect(result.fields).toEqual(['title', 'confidence', 'type']);
      });

      it('parses fields with dots (file.path)', () => {
        const result = parseDQL('TABLE file.path, file.name');
        expect(result.fields).toEqual(['file.path', 'file.name']);
      });
    });

    describe('FROM clause', () => {
      it('parses FROM with string path', () => {
        const result = parseDQL('LIST FROM "research"');
        expect(result.from).toBe('research');
      });

      it('parses FROM with identifier', () => {
        const result = parseDQL('LIST FROM research');
        expect(result.from).toBe('research');
      });

      it('parses FROM with nested path', () => {
        const result = parseDQL('TABLE FROM "projects/client-work"');
        expect(result.from).toBe('projects/client-work');
      });
    });

    describe('WHERE clause', () => {
      it('parses equality comparison', () => {
        const result = parseDQL('LIST WHERE type = "research"');
        expect(result.where).toEqual({
          type: 'comparison',
          field: 'type',
          operator: '=',
          value: 'research',
        });
      });

      it('parses inequality comparison', () => {
        const result = parseDQL('LIST WHERE verified != true');
        expect(result.where).toEqual({
          type: 'comparison',
          field: 'verified',
          operator: '!=',
          value: true,
        });
      });

      it('parses greater than comparison', () => {
        const result = parseDQL('LIST WHERE confidence > 0.8');
        expect(result.where).toEqual({
          type: 'comparison',
          field: 'confidence',
          operator: '>',
          value: 0.8,
        });
      });

      it('parses less than or equal comparison', () => {
        const result = parseDQL('LIST WHERE confidence <= 0.5');
        expect(result.where).toEqual({
          type: 'comparison',
          field: 'confidence',
          operator: '<=',
          value: 0.5,
        });
      });

      it('parses contains function', () => {
        const result = parseDQL('LIST WHERE contains(tags, "kubernetes")');
        expect(result.where).toEqual({
          type: 'contains',
          field: 'tags',
          value: 'kubernetes',
        });
      });

      it('parses AND conditions', () => {
        const result = parseDQL('LIST WHERE type = "research" AND verified = true');
        expect(result.where?.type).toBe('logical');
        const logical = result.where as { type: 'logical'; operator: string };
        expect(logical.operator).toBe('AND');
      });

      it('parses OR conditions', () => {
        const result = parseDQL('LIST WHERE confidence > 0.9 OR verified = true');
        expect(result.where?.type).toBe('logical');
        const logical = result.where as { type: 'logical'; operator: string };
        expect(logical.operator).toBe('OR');
      });

      it('parses parenthesized conditions', () => {
        const result = parseDQL('LIST WHERE (type = "research" AND verified = true) OR confidence > 0.9');
        expect(result.where?.type).toBe('logical');
      });

      it('parses bare identifier values', () => {
        const result = parseDQL('LIST WHERE type = research');
        expect(result.where).toEqual({
          type: 'comparison',
          field: 'type',
          operator: '=',
          value: 'research',
        });
      });
    });

    describe('SORT clause', () => {
      it('parses SORT with default order', () => {
        const result = parseDQL('LIST SORT modified');
        expect(result.sort).toEqual({
          field: 'modified',
          order: 'ASC',
        });
      });

      it('parses SORT ASC', () => {
        const result = parseDQL('LIST SORT title ASC');
        expect(result.sort).toEqual({
          field: 'title',
          order: 'ASC',
        });
      });

      it('parses SORT DESC', () => {
        const result = parseDQL('LIST SORT modified DESC');
        expect(result.sort).toEqual({
          field: 'modified',
          order: 'DESC',
        });
      });
    });

    describe('LIMIT clause', () => {
      it('parses LIMIT', () => {
        const result = parseDQL('LIST LIMIT 10');
        expect(result.limit).toBe(10);
      });
    });

    describe('complex queries', () => {
      it('parses full TABLE query', () => {
        const result = parseDQL(
          'TABLE title, confidence FROM "research" WHERE verified = false SORT confidence DESC LIMIT 10'
        );
        expect(result.type).toBe('TABLE');
        expect(result.fields).toEqual(['title', 'confidence']);
        expect(result.from).toBe('research');
        expect(result.where).toBeDefined();
        expect(result.sort).toEqual({ field: 'confidence', order: 'DESC' });
        expect(result.limit).toBe(10);
      });

      it('parses query with contains and sort', () => {
        const result = parseDQL(
          'LIST FROM "commands" WHERE contains(tags, "k8s") SORT created DESC'
        );
        expect(result.type).toBe('LIST');
        expect(result.from).toBe('commands');
        expect(result.where?.type).toBe('contains');
        expect(result.sort).toEqual({ field: 'created', order: 'DESC' });
      });
    });

    describe('error handling', () => {
      it('throws on invalid query type', () => {
        expect(() => parseDQL('SELECT *')).toThrow(DQLParseError);
      });

      it('throws on unterminated string', () => {
        expect(() => parseDQL('LIST WHERE type = "research')).toThrow(DQLParseError);
      });

      it('throws on unexpected token', () => {
        expect(() => parseDQL('LIST WHERE type = , value')).toThrow(DQLParseError);
      });

      it('error includes position info', () => {
        try {
          parseDQL('LIST WHERE @invalid');
        } catch (e) {
          expect(e).toBeInstanceOf(DQLParseError);
          expect((e as DQLParseError).position).toBeGreaterThan(0);
        }
      });
    });
  });
});

describe('dataview/formatter', () => {
  const mockResult: ExecutionResult = {
    type: 'table',
    fields: ['path', 'title', 'confidence', 'verified'],
    rows: [
      { path: 'research/note1.md', title: 'Note 1', confidence: 0.85, verified: true },
      { path: 'research/note2.md', title: 'Note 2', confidence: 0.6, verified: false },
    ],
    total: 2,
  };

  describe('formatAsTable', () => {
    it('formats results as markdown table', () => {
      const output = formatAsTable(mockResult);
      expect(output).toContain('| path');
      expect(output).toContain('| title');
      expect(output).toContain('Note 1');
      expect(output).toContain('Note 2');
      // Table separator has dashes between pipes
      expect(output).toMatch(/\|[-\s]+\|/);
    });

    it('formats boolean values', () => {
      const output = formatAsTable(mockResult);
      expect(output).toContain('✓');
      expect(output).toContain('✗');
    });

    it('formats confidence as percentage', () => {
      const output = formatAsTable(mockResult);
      expect(output).toContain('85%');
      expect(output).toContain('60%');
    });

    it('handles empty results', () => {
      const emptyResult: ExecutionResult = {
        type: 'table',
        fields: ['path', 'title'],
        rows: [],
        total: 0,
      };
      const output = formatAsTable(emptyResult);
      expect(output).toBe('*No results*');
    });
  });

  describe('formatAsList', () => {
    it('formats results as bullet list with wiki-links', () => {
      const output = formatAsList(mockResult);
      expect(output).toContain('- [[research/note1|Note 1]]');
      expect(output).toContain('- [[research/note2|Note 2]]');
    });

    it('handles empty results', () => {
      const emptyResult: ExecutionResult = {
        type: 'list',
        fields: ['path', 'title'],
        rows: [],
        total: 0,
      };
      const output = formatAsList(emptyResult);
      expect(output).toBe('*No results*');
    });
  });

  describe('formatAsTask', () => {
    it('formats results as task list', () => {
      const output = formatAsTask(mockResult);
      expect(output).toContain('- [ ] [[research/note1|Note 1]]');
      expect(output).toContain('- [ ] [[research/note2|Note 2]]');
    });

    it('marks completed tasks', () => {
      const taskResult: ExecutionResult = {
        type: 'task',
        fields: ['path', 'title', 'completed'],
        rows: [
          { path: 'tasks/task1.md', title: 'Task 1', completed: true },
          { path: 'tasks/task2.md', title: 'Task 2', completed: false },
        ],
        total: 2,
      };
      const output = formatAsTask(taskResult);
      expect(output).toContain('- [x] [[tasks/task1|Task 1]]');
      expect(output).toContain('- [ ] [[tasks/task2|Task 2]]');
    });

    it('handles empty results', () => {
      const emptyResult: ExecutionResult = {
        type: 'task',
        fields: ['path', 'title'],
        rows: [],
        total: 0,
      };
      const output = formatAsTask(emptyResult);
      expect(output).toBe('*No tasks*');
    });
  });

  describe('formatAsJson', () => {
    it('formats results as JSON', () => {
      const output = formatAsJson(mockResult);
      const parsed = JSON.parse(output);
      expect(parsed.type).toBe('table');
      expect(parsed.total).toBe(2);
      expect(parsed.rows).toHaveLength(2);
      expect(parsed.rows[0].title).toBe('Note 1');
    });
  });
});
