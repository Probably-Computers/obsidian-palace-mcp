/**
 * Dataview service - DQL query support
 * Barrel exports for dataview functionality
 */

// Parser exports
export {
  parseDQL,
  DQLParseError,
  type QueryType,
  type ParsedQuery,
  type WhereClause,
  type ComparisonCondition,
  type ContainsCondition,
  type LogicalCondition,
  type SortClause,
} from './parser.js';

// Executor exports
export {
  executeQuery,
  executeQueryWithTags,
  type ExecutionResult,
  type ResultRow,
} from './executor.js';

// Formatter exports
export {
  formatResult,
  formatAsTable,
  formatAsList,
  formatAsTask,
  formatAsJson,
  type OutputFormat,
  type FormattedResult,
} from './formatter.js';
