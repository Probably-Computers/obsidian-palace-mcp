/**
 * DQL (Dataview Query Language) parser
 * Parses a subset of DQL syntax used by Obsidian Dataview plugin
 */

import { logger } from '../../utils/logger.js';

/**
 * Query types supported
 */
export type QueryType = 'TABLE' | 'LIST' | 'TASK';

/**
 * Comparison operators
 */
export type ComparisonOperator = '=' | '!=' | '>' | '<' | '>=' | '<=';

/**
 * Logical operators
 */
export type LogicalOperator = 'AND' | 'OR';

/**
 * A condition in a WHERE clause
 */
export interface Condition {
  type: 'comparison' | 'contains' | 'logical';
}

/**
 * Simple comparison condition: field op value
 */
export interface ComparisonCondition extends Condition {
  type: 'comparison';
  field: string;
  operator: ComparisonOperator;
  value: string | number | boolean;
}

/**
 * Contains function: contains(field, value)
 */
export interface ContainsCondition extends Condition {
  type: 'contains';
  field: string;
  value: string;
}

/**
 * Logical combination of conditions
 */
export interface LogicalCondition extends Condition {
  type: 'logical';
  operator: LogicalOperator;
  left: WhereClause;
  right: WhereClause;
}

export type WhereClause = ComparisonCondition | ContainsCondition | LogicalCondition;

/**
 * Sort clause
 */
export interface SortClause {
  field: string;
  order: 'ASC' | 'DESC';
}

/**
 * Parsed DQL query
 */
export interface ParsedQuery {
  type: QueryType;
  fields?: string[];        // For TABLE queries
  from?: string;            // Path filter
  where?: WhereClause;      // Filter conditions
  sort?: SortClause;        // Ordering
  limit?: number;           // Result limit
}

/**
 * Parse error with position info
 */
export class DQLParseError extends Error {
  constructor(
    message: string,
    public position: number,
    public query: string
  ) {
    super(`${message} at position ${position}: "${query.slice(Math.max(0, position - 10), position + 20)}"`);
    this.name = 'DQLParseError';
  }
}

/**
 * Token types
 */
type TokenType =
  | 'KEYWORD'    // TABLE, LIST, TASK, FROM, WHERE, SORT, LIMIT, AND, OR, ASC, DESC
  | 'IDENTIFIER' // field names
  | 'STRING'     // "quoted string"
  | 'NUMBER'     // 123, 0.5
  | 'BOOLEAN'    // true, false
  | 'OPERATOR'   // =, !=, >, <, >=, <=
  | 'LPAREN'     // (
  | 'RPAREN'     // )
  | 'COMMA'      // ,
  | 'EOF';

interface Token {
  type: TokenType;
  value: string;
  position: number;
}

const KEYWORDS = new Set([
  'TABLE', 'LIST', 'TASK', 'FROM', 'WHERE', 'SORT', 'LIMIT',
  'AND', 'OR', 'ASC', 'DESC', 'CONTAINS',
]);

/**
 * Tokenize a DQL query string
 */
function tokenize(query: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;

  while (pos < query.length) {
    // Skip whitespace
    if (/\s/.test(query[pos]!)) {
      pos++;
      continue;
    }

    const startPos = pos;

    // Operators (check multi-char first)
    if (query.slice(pos, pos + 2) === '!=') {
      tokens.push({ type: 'OPERATOR', value: '!=', position: startPos });
      pos += 2;
      continue;
    }
    if (query.slice(pos, pos + 2) === '>=') {
      tokens.push({ type: 'OPERATOR', value: '>=', position: startPos });
      pos += 2;
      continue;
    }
    if (query.slice(pos, pos + 2) === '<=') {
      tokens.push({ type: 'OPERATOR', value: '<=', position: startPos });
      pos += 2;
      continue;
    }
    if (query[pos] === '=' || query[pos] === '>' || query[pos] === '<') {
      tokens.push({ type: 'OPERATOR', value: query[pos]!, position: startPos });
      pos++;
      continue;
    }

    // Parentheses
    if (query[pos] === '(') {
      tokens.push({ type: 'LPAREN', value: '(', position: startPos });
      pos++;
      continue;
    }
    if (query[pos] === ')') {
      tokens.push({ type: 'RPAREN', value: ')', position: startPos });
      pos++;
      continue;
    }

    // Comma
    if (query[pos] === ',') {
      tokens.push({ type: 'COMMA', value: ',', position: startPos });
      pos++;
      continue;
    }

    // String literal (double quotes)
    if (query[pos] === '"') {
      pos++;
      let value = '';
      while (pos < query.length && query[pos] !== '"') {
        if (query[pos] === '\\' && pos + 1 < query.length) {
          pos++;
          value += query[pos];
        } else {
          value += query[pos];
        }
        pos++;
      }
      if (pos >= query.length) {
        throw new DQLParseError('Unterminated string', startPos, query);
      }
      pos++; // skip closing quote
      tokens.push({ type: 'STRING', value, position: startPos });
      continue;
    }

    // Number
    if (/[0-9]/.test(query[pos]!) || (query[pos] === '.' && /[0-9]/.test(query[pos + 1] || ''))) {
      let value = '';
      while (pos < query.length && /[0-9.]/.test(query[pos]!)) {
        value += query[pos];
        pos++;
      }
      tokens.push({ type: 'NUMBER', value, position: startPos });
      continue;
    }

    // Identifier or keyword
    if (/[a-zA-Z_]/.test(query[pos]!)) {
      let value = '';
      while (pos < query.length && /[a-zA-Z0-9_.]/.test(query[pos]!)) {
        value += query[pos];
        pos++;
      }
      const upper = value.toUpperCase();
      if (upper === 'TRUE' || upper === 'FALSE') {
        tokens.push({ type: 'BOOLEAN', value: upper.toLowerCase(), position: startPos });
      } else if (KEYWORDS.has(upper)) {
        tokens.push({ type: 'KEYWORD', value: upper, position: startPos });
      } else {
        tokens.push({ type: 'IDENTIFIER', value, position: startPos });
      }
      continue;
    }

    throw new DQLParseError(`Unexpected character: ${query[pos]}`, pos, query);
  }

  tokens.push({ type: 'EOF', value: '', position: pos });
  return tokens;
}

/**
 * Parser class for DQL
 */
class DQLParser {
  private tokens: Token[];
  private pos = 0;
  private query: string;

  constructor(query: string) {
    this.query = query;
    this.tokens = tokenize(query);
  }

  private current(): Token {
    return this.tokens[this.pos]!;
  }

  private peek(offset = 0): Token {
    return this.tokens[this.pos + offset] ?? { type: 'EOF', value: '', position: this.query.length };
  }

  private advance(): Token {
    const token = this.current();
    this.pos++;
    return token;
  }

  private expect(type: TokenType, value?: string): Token {
    const token = this.current();
    if (token.type !== type || (value !== undefined && token.value !== value)) {
      throw new DQLParseError(
        `Expected ${type}${value ? ` "${value}"` : ''}, got ${token.type} "${token.value}"`,
        token.position,
        this.query
      );
    }
    return this.advance();
  }

  private match(type: TokenType, value?: string): boolean {
    const token = this.current();
    return token.type === type && (value === undefined || token.value === value);
  }

  /**
   * Parse the query
   */
  parse(): ParsedQuery {
    const result: ParsedQuery = this.parseQueryType();

    // Parse optional clauses
    while (this.current().type !== 'EOF') {
      if (this.match('KEYWORD', 'FROM')) {
        this.advance();
        result.from = this.parseFromClause();
      } else if (this.match('KEYWORD', 'WHERE')) {
        this.advance();
        result.where = this.parseWhereClause();
      } else if (this.match('KEYWORD', 'SORT')) {
        this.advance();
        result.sort = this.parseSortClause();
      } else if (this.match('KEYWORD', 'LIMIT')) {
        this.advance();
        result.limit = this.parseLimitClause();
      } else {
        throw new DQLParseError(
          `Unexpected token: ${this.current().value}`,
          this.current().position,
          this.query
        );
      }
    }

    return result;
  }

  /**
   * Parse query type and fields
   */
  private parseQueryType(): ParsedQuery {
    const token = this.expect('KEYWORD');

    if (token.value === 'TABLE') {
      const fields = this.parseFieldList();
      return { type: 'TABLE', fields };
    } else if (token.value === 'LIST') {
      return { type: 'LIST' };
    } else if (token.value === 'TASK') {
      return { type: 'TASK' };
    }

    throw new DQLParseError(
      `Expected TABLE, LIST, or TASK, got ${token.value}`,
      token.position,
      this.query
    );
  }

  /**
   * Parse field list for TABLE queries
   */
  private parseFieldList(): string[] {
    const fields: string[] = [];

    // Fields are optional, check if next token starts a clause
    if (this.match('KEYWORD', 'FROM') || this.match('KEYWORD', 'WHERE') ||
        this.match('KEYWORD', 'SORT') || this.match('KEYWORD', 'LIMIT') ||
        this.match('EOF')) {
      return fields;
    }

    // Parse first field
    fields.push(this.expect('IDENTIFIER').value);

    // Parse remaining fields
    while (this.match('COMMA')) {
      this.advance();
      fields.push(this.expect('IDENTIFIER').value);
    }

    return fields;
  }

  /**
   * Parse FROM clause
   */
  private parseFromClause(): string {
    // FROM accepts a string path
    const token = this.current();
    if (token.type === 'STRING') {
      return this.advance().value;
    }
    if (token.type === 'IDENTIFIER') {
      return this.advance().value;
    }
    throw new DQLParseError(
      `Expected path after FROM, got ${token.type}`,
      token.position,
      this.query
    );
  }

  /**
   * Parse WHERE clause (with AND/OR support)
   */
  private parseWhereClause(): WhereClause {
    return this.parseOrExpression();
  }

  /**
   * Parse OR expression (lowest precedence)
   */
  private parseOrExpression(): WhereClause {
    let left = this.parseAndExpression();

    while (this.match('KEYWORD', 'OR')) {
      this.advance();
      const right = this.parseAndExpression();
      left = { type: 'logical', operator: 'OR', left, right };
    }

    return left;
  }

  /**
   * Parse AND expression
   */
  private parseAndExpression(): WhereClause {
    let left = this.parsePrimaryCondition();

    while (this.match('KEYWORD', 'AND')) {
      this.advance();
      const right = this.parsePrimaryCondition();
      left = { type: 'logical', operator: 'AND', left, right };
    }

    return left;
  }

  /**
   * Parse primary condition (comparison, contains, or parenthesized)
   */
  private parsePrimaryCondition(): WhereClause {
    // Handle parentheses
    if (this.match('LPAREN')) {
      this.advance();
      const expr = this.parseWhereClause();
      this.expect('RPAREN');
      return expr;
    }

    // Handle contains()
    if (this.match('KEYWORD', 'CONTAINS')) {
      this.advance();
      this.expect('LPAREN');
      const field = this.expect('IDENTIFIER').value;
      this.expect('COMMA');
      const value = this.parseValue();
      this.expect('RPAREN');
      return { type: 'contains', field, value: String(value) };
    }

    // Handle comparison: field op value
    const field = this.expect('IDENTIFIER').value;
    const op = this.expect('OPERATOR').value as ComparisonOperator;
    const value = this.parseValue();

    return { type: 'comparison', field, operator: op, value };
  }

  /**
   * Parse a value (string, number, or boolean)
   */
  private parseValue(): string | number | boolean {
    const token = this.current();

    if (token.type === 'STRING') {
      this.advance();
      return token.value;
    }
    if (token.type === 'NUMBER') {
      this.advance();
      return parseFloat(token.value);
    }
    if (token.type === 'BOOLEAN') {
      this.advance();
      return token.value === 'true';
    }
    if (token.type === 'IDENTIFIER') {
      // Allow bare identifiers as string values (e.g., type = research)
      this.advance();
      return token.value;
    }

    throw new DQLParseError(
      `Expected value, got ${token.type}`,
      token.position,
      this.query
    );
  }

  /**
   * Parse SORT clause
   */
  private parseSortClause(): SortClause {
    const field = this.expect('IDENTIFIER').value;
    let order: 'ASC' | 'DESC' = 'ASC';

    if (this.match('KEYWORD', 'ASC')) {
      this.advance();
      order = 'ASC';
    } else if (this.match('KEYWORD', 'DESC')) {
      this.advance();
      order = 'DESC';
    }

    return { field, order };
  }

  /**
   * Parse LIMIT clause
   */
  private parseLimitClause(): number {
    const token = this.expect('NUMBER');
    return parseInt(token.value, 10);
  }
}

/**
 * Parse a DQL query string
 */
export function parseDQL(query: string): ParsedQuery {
  logger.debug('Parsing DQL query:', query);
  const parser = new DQLParser(query.trim());
  return parser.parse();
}
