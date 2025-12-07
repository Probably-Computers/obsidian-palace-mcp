/**
 * DQL query executor
 * Converts parsed DQL to SQL and executes against SQLite index
 */

import Database from 'better-sqlite3';
import { logger } from '../../utils/logger.js';
import type {
  ParsedQuery,
  WhereClause,
  ComparisonCondition,
  ContainsCondition,
  LogicalCondition,
} from './parser.js';

/**
 * A single row in query results
 */
export interface ResultRow {
  path: string;
  title: string;
  [key: string]: unknown;
}

/**
 * Query execution result
 */
export interface ExecutionResult {
  type: 'table' | 'list' | 'task';
  fields: string[];
  rows: ResultRow[];
  total: number;
}

/**
 * Available fields that can be queried
 */
const FIELD_MAP: Record<string, string> = {
  // Direct column mappings
  path: 'n.path',
  title: 'n.title',
  type: 'n.type',
  created: 'n.created',
  modified: 'n.modified',
  source: 'n.source',
  confidence: 'n.confidence',
  verified: 'n.verified',
  content: 'n.content',
  // Aliases used in Dataview
  'file.path': 'n.path',
  'file.name': 'n.title',
  'file.ctime': 'n.created',
  'file.mtime': 'n.modified',
};

/**
 * Get SQL column for a field name
 */
function getColumn(field: string): string {
  const mapped = FIELD_MAP[field.toLowerCase()];
  if (mapped) return mapped;

  // For unknown fields, treat as frontmatter property
  // Since our schema stores specific frontmatter fields in columns,
  // we only support the predefined fields
  throw new Error(`Unknown field: ${field}. Supported fields: ${Object.keys(FIELD_MAP).join(', ')}`);
}

/**
 * Convert a WHERE clause to SQL condition
 */
function whereToSql(
  where: WhereClause,
  params: unknown[]
): string {
  switch (where.type) {
    case 'comparison':
      return comparisonToSql(where, params);
    case 'contains':
      return containsToSql(where, params);
    case 'logical':
      return logicalToSql(where, params);
    default:
      throw new Error(`Unknown condition type`);
  }
}

/**
 * Convert comparison condition to SQL
 */
function comparisonToSql(
  cond: ComparisonCondition,
  params: unknown[]
): string {
  const column = getColumn(cond.field);
  const op = cond.operator;

  // Handle boolean values for verified field
  let value = cond.value;
  if (cond.field.toLowerCase() === 'verified' && typeof value === 'boolean') {
    value = value ? 1 : 0;
  }

  params.push(value);
  return `${column} ${op} ?`;
}

/**
 * Convert contains() to SQL (for tags array)
 */
function containsToSql(
  cond: ContainsCondition,
  params: unknown[]
): string {
  // contains() is used for array fields like tags
  if (cond.field.toLowerCase() === 'tags') {
    params.push(cond.value);
    return `n.id IN (SELECT note_id FROM note_tags WHERE tag = ?)`;
  }

  // For other fields, use LIKE
  const column = getColumn(cond.field);
  params.push(`%${cond.value}%`);
  return `${column} LIKE ?`;
}

/**
 * Convert logical condition to SQL
 */
function logicalToSql(
  cond: LogicalCondition,
  params: unknown[]
): string {
  const leftSql = whereToSql(cond.left, params);
  const rightSql = whereToSql(cond.right, params);
  return `(${leftSql} ${cond.operator} ${rightSql})`;
}

/**
 * Build SELECT fields list
 */
function buildSelectFields(fields: string[] | undefined): string[] {
  const selectFields = ['n.path', 'n.title']; // Always include these

  if (fields && fields.length > 0) {
    for (const field of fields) {
      const column = getColumn(field);
      if (!selectFields.includes(column)) {
        selectFields.push(column);
      }
    }
  } else {
    // Default fields for TABLE with no field list
    selectFields.push('n.type', 'n.created', 'n.modified');
  }

  return selectFields;
}

/**
 * Execute a parsed DQL query
 */
export function executeQuery(db: Database.Database, query: ParsedQuery): ExecutionResult {
  const params: unknown[] = [];

  // Determine fields to select
  const requestedFields = query.fields || [];
  const selectFields = buildSelectFields(query.fields);

  // Build SQL query
  let sql = `SELECT ${selectFields.join(', ')} FROM notes n`;

  // Add WHERE clause
  const conditions: string[] = [];

  // FROM clause becomes path filter
  if (query.from) {
    conditions.push('n.path LIKE ?');
    params.push(`${query.from}%`);
  }

  // WHERE clause
  if (query.where) {
    conditions.push(whereToSql(query.where, params));
  }

  if (conditions.length > 0) {
    sql += ` WHERE ${conditions.join(' AND ')}`;
  }

  // SORT clause
  if (query.sort) {
    const sortColumn = getColumn(query.sort.field);
    sql += ` ORDER BY ${sortColumn} ${query.sort.order}`;
  } else {
    sql += ' ORDER BY n.modified DESC';
  }

  // LIMIT clause
  if (query.limit) {
    sql += ' LIMIT ?';
    params.push(query.limit);
  } else {
    sql += ' LIMIT 100'; // Default limit
  }

  logger.debug('Executing DQL:', { sql, params });

  try {
    const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];

    // Transform rows to result format
    const resultRows: ResultRow[] = rows.map((row) => {
      const result: ResultRow = {
        path: row['n.path'] as string || row.path as string,
        title: row['n.title'] as string || row.title as string,
      };

      // Add requested fields
      for (const field of requestedFields) {
        const column = getColumn(field);
        const key = column.replace('n.', '');
        result[field] = row[column] ?? row[key];
      }

      // Add default fields if no specific fields requested
      if (requestedFields.length === 0) {
        result.type = row['n.type'] ?? row.type;
        result.created = row['n.created'] ?? row.created;
        result.modified = row['n.modified'] ?? row.modified;
      }

      return result;
    });

    // Get output fields for response
    const outputFields = requestedFields.length > 0
      ? ['path', 'title', ...requestedFields]
      : ['path', 'title', 'type', 'created', 'modified'];

    return {
      type: query.type.toLowerCase() as 'table' | 'list' | 'task',
      fields: outputFields,
      rows: resultRows,
      total: resultRows.length,
    };
  } catch (error) {
    logger.error('DQL execution error:', error);
    throw error;
  }
}

/**
 * Execute DQL query with tags fetched
 */
export function executeQueryWithTags(db: Database.Database, query: ParsedQuery): ExecutionResult {
  const result = executeQuery(db, query);

  // Fetch tags for each note if tags field is requested
  const requestedFields = query.fields || [];
  if (requestedFields.includes('tags') || requestedFields.length === 0) {
    for (const row of result.rows) {
      const noteRow = db
        .prepare('SELECT id FROM notes WHERE path = ?')
        .get(row.path) as { id: number } | undefined;

      if (noteRow) {
        const tags = db
          .prepare('SELECT tag FROM note_tags WHERE note_id = ?')
          .all(noteRow.id) as { tag: string }[];
        row.tags = tags.map((t) => t.tag);
      }
    }

    if (!result.fields.includes('tags')) {
      result.fields.push('tags');
    }
  }

  return result;
}
