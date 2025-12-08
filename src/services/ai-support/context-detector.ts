/**
 * Context detector for AI support tools (Phase 017)
 *
 * Detects domains, projects, clients, and capture type in content
 * to help AI determine storage intent automatically.
 *
 * Phase 017 changes:
 * - Removed technology detection (domains serve this purpose)
 * - Removed scope detection (capture_type determines context)
 * - Added capture type detection
 */

import Database from 'better-sqlite3';
import { logger } from '../../utils/logger.js';
import type {
  DetectedContext,
  DetectedDomain,
  DetectedProject,
  DetectedClient,
  DetectedCaptureType,
  ContextDetectionOptions,
} from '../../types/clarify.js';
import type { CaptureType } from '../../types/intent.js';

// Default detection options
const DEFAULT_OPTIONS: Required<ContextDetectionOptions> = {
  maxDomains: 10,
  maxProjects: 5,
  maxClients: 5,
  minConfidence: 0.3,
};

// Domain patterns for common knowledge areas
const DOMAIN_PATTERNS: Record<string, RegExp[]> = {
  networking: [/\bnetwork(?:ing)?\b/i, /\btcp\b|\budp\b/i, /\bip\s+address\b/i, /\bdns\b/i, /\bfirewall\b/i],
  security: [/\bsecurity\b/i, /\bauthentication\b/i, /\bauthorization\b/i, /\bencryption\b/i, /\bssl\b|\btls\b/i],
  database: [/\bdatabase\b/i, /\bsql\b/i, /\bquery\b/i, /\btable\b|\bschema\b/i],
  devops: [/\bdevops\b/i, /\bci\/cd\b/i, /\bpipeline\b/i, /\bdeployment\b/i],
  frontend: [/\bfrontend\b/i, /\bui\b|\bux\b/i, /\bcss\b/i, /\bhtml\b/i, /\bdom\b/i],
  backend: [/\bbackend\b/i, /\bapi\b/i, /\bserver\b/i, /\bendpoint\b/i],
  testing: [/\btest(?:ing)?\b/i, /\bunit\s+test\b/i, /\bintegration\s+test\b/i, /\be2e\b/i],
  documentation: [/\bdocumentation\b/i, /\breadme\b/i, /\bcomment(?:s)?\b/i],
  typescript: [/\btypescript\b|\bts\b(?!\s*=)/i],
  javascript: [/\bjavascript\b|\bjs\b(?!\s*=)/i],
  python: [/\bpython\b|\bpy\b/i],
  rust: [/\brust\b|\brustc\b/i],
  go: [/\bgolang\b|\bgo\s+(?:mod|build|run)\b/i],
  docker: [/\bdocker\b|\bcontainer\b|\bdockerfile\b/i],
  kubernetes: [/\bkubernetes\b|\bk8s\b|\bkubectl\b/i],
  terraform: [/\bterraform\b|\btf\b|\b\.tf\b/i],
  aws: [/\baws\b|\bamazon\s+web\s+services\b/i],
  azure: [/\bazure\b|\bmicrosoft\s+azure\b/i],
  gcp: [/\bgcp\b|\bgoogle\s+cloud\b/i],
  postgresql: [/\bpostgres(?:ql)?\b|\bpg\b/i],
  mongodb: [/\bmongodb\b|\bmongo\b/i],
  redis: [/\bredis\b/i],
  git: [/\bgit\b(?!hub)/i, /\bgithub\b/i, /\bgitlab\b/i],
};

// Code block language hints
const CODE_BLOCK_PATTERN = /```(\w+)/gi;

// Source capture indicators
const SOURCE_INDICATORS = [
  /\bfrom\s+(?:the\s+)?book\b/i,
  /\bfrom\s+(?:the\s+)?article\b/i,
  /\bfrom\s+(?:the\s+)?video\b/i,
  /\bfrom\s+(?:the\s+)?podcast\b/i,
  /\baccording\s+to\b/i,
  /\bauthor\s+says\b/i,
  /\bquote(?:d)?\b/i,
  /\bsource:\s/i,
  /\breference:\s/i,
  /\bcitation\b/i,
];

// Project capture indicators
const PROJECT_INDICATORS = [
  /\bour\s+\w+/i,
  /\bwe\s+(?:use|have|need|want|should)\b/i,
  /\bus\s+(?:to|for)\b/i,
  /\bour\s+team\b/i,
  /\bour\s+(?:project|codebase|repo|repository)\b/i,
  /\bthis\s+project\b/i,
  /\bfor\s+(?:the\s+)?(?:client|project)\b/i,
  /\bspecific\s+to\b/i,
  /\bcustom(?:ized|ization)?\b/i,
  /\binternal(?:ly)?\b/i,
  /\bproprietary\b/i,
];

// Knowledge capture indicators (default)
const KNOWLEDGE_INDICATORS = [
  /\bgeneral(?:ly)?\b/i,
  /\bstandard\s+(?:way|approach|practice)\b/i,
  /\bbest\s+practice\b/i,
  /\bcommon(?:ly)?\b/i,
  /\bhow\s+to\b/i,
  /\bofficial\s+documentation\b/i,
  /\btutorial\b/i,
  /\bguide\b/i,
];

/**
 * Build domain vocabulary from vault index
 */
export function buildDomainVocabulary(db: Database.Database): Map<string, { path: string; noteCount: number }> {
  const vocab = new Map<string, { path: string; noteCount: number }>();

  try {
    // Get distinct top-level directories and their note counts
    const directories = db
      .prepare(`
        SELECT
          SUBSTR(path, 1, INSTR(path, '/') - 1) as domain,
          COUNT(*) as note_count
        FROM notes
        WHERE path LIKE '%/%'
        GROUP BY domain
        HAVING domain != ''
      `)
      .all() as Array<{ domain: string; note_count: number }>;

    for (const dir of directories) {
      vocab.set(dir.domain.toLowerCase(), {
        path: dir.domain,
        noteCount: dir.note_count,
      });
    }

    logger.debug(`Built domain vocabulary with ${vocab.size} entries`);
  } catch (error) {
    logger.warn('Failed to build domain vocabulary:', error);
  }

  return vocab;
}

/**
 * Build project vocabulary from vault index
 */
export function buildProjectVocabulary(db: Database.Database): Map<string, string> {
  const vocab = new Map<string, string>();

  try {
    // Get all notes in projects/ directory
    const projectNotes = db
      .prepare("SELECT path, title FROM notes WHERE path LIKE 'projects/%'")
      .all() as Array<{ path: string; title: string }>;

    for (const note of projectNotes) {
      vocab.set(note.title.toLowerCase(), note.path);

      // Extract project name from path
      const parts = note.path.split('/');
      if (parts.length >= 2) {
        const projectName = parts[1];
        if (projectName && !vocab.has(projectName.toLowerCase())) {
          vocab.set(projectName.toLowerCase(), note.path);
        }
      }
    }

    logger.debug(`Built project vocabulary with ${vocab.size} entries`);
  } catch (error) {
    logger.warn('Failed to build project vocabulary:', error);
  }

  return vocab;
}

/**
 * Build client vocabulary from vault index
 */
export function buildClientVocabulary(db: Database.Database): Map<string, string> {
  const vocab = new Map<string, string>();

  try {
    // Get all notes in clients/ directory
    const clientNotes = db
      .prepare("SELECT path, title FROM notes WHERE path LIKE 'clients/%'")
      .all() as Array<{ path: string; title: string }>;

    for (const note of clientNotes) {
      vocab.set(note.title.toLowerCase(), note.path);

      // Extract client name from path
      const parts = note.path.split('/');
      if (parts.length >= 2) {
        const clientName = parts[1];
        if (clientName && !vocab.has(clientName.toLowerCase())) {
          vocab.set(clientName.toLowerCase(), note.path);
        }
      }
    }

    logger.debug(`Built client vocabulary with ${vocab.size} entries`);
  } catch (error) {
    logger.warn('Failed to build client vocabulary:', error);
  }

  return vocab;
}

/**
 * Detect domains in content
 */
export function detectDomains(
  content: string,
  domainVocab: Map<string, { path: string; noteCount: number }>,
  options: ContextDetectionOptions = {}
): DetectedDomain[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const detected = new Map<string, DetectedDomain>();

  // Check against known domain patterns
  for (const [domain, patterns] of Object.entries(DOMAIN_PATTERNS)) {
    let matchCount = 0;
    for (const pattern of patterns) {
      if (pattern.test(content)) {
        matchCount++;
      }
    }

    if (matchCount > 0) {
      const existsInVault = domainVocab.has(domain.toLowerCase());
      const vaultInfo = domainVocab.get(domain.toLowerCase());
      const confidence = Math.min(0.3 + matchCount * 0.2, 0.9);

      detected.set(domain, {
        name: domain,
        confidence,
        exists_in_vault: existsInVault,
        note_count: vaultInfo?.noteCount,
      });
    }
  }

  // Check code block languages as domains
  const codeBlocks = [...content.matchAll(CODE_BLOCK_PATTERN)];
  for (const match of codeBlocks) {
    const lang = match[1]?.toLowerCase();
    if (lang && !detected.has(lang)) {
      const existsInVault = domainVocab.has(lang);
      const vaultInfo = domainVocab.get(lang);
      detected.set(lang, {
        name: lang,
        confidence: 0.7,
        exists_in_vault: existsInVault,
        note_count: vaultInfo?.noteCount,
      });
    }
  }

  // Check against vault vocabulary for existing domains
  for (const [term, info] of domainVocab.entries()) {
    if (!detected.has(term)) {
      const pattern = new RegExp(`\\b${escapeRegex(term)}\\b`, 'i');
      if (pattern.test(content)) {
        detected.set(term, {
          name: term,
          confidence: 0.6,
          exists_in_vault: true,
          note_count: info.noteCount,
        });
      }
    }
  }

  const minConfidence = opts.minConfidence ?? 0.3;
  return [...detected.values()]
    .filter((d) => d.confidence >= minConfidence)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, opts.maxDomains);
}

/**
 * Detect projects mentioned in content
 */
export function detectProjects(
  content: string,
  projectVocab: Map<string, string>,
  options: ContextDetectionOptions = {}
): DetectedProject[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const detected = new Map<string, DetectedProject>();

  // Check "for {project}" patterns
  const forPatterns = [
    /for\s+(?:the\s+)?(\w+)\s+project/gi,
    /(?:our|the)\s+(\w+)\s+(?:project|codebase|repo)/gi,
    /project[:\s]+["']?(\w+)["']?/gi,
  ];

  for (const pattern of forPatterns) {
    const matches = [...content.matchAll(pattern)];
    for (const match of matches) {
      const name = match[1]?.toLowerCase();
      if (name && name.length > 2) {
        const existsPath = projectVocab.get(name);
        if (!detected.has(name)) {
          detected.set(name, {
            name,
            confidence: existsPath ? 0.8 : 0.5,
            path: existsPath,
          });
        }
      }
    }
  }

  // Check against vault vocabulary
  for (const [term, path] of projectVocab.entries()) {
    if (!detected.has(term) && term.length > 2) {
      const pattern = new RegExp(`\\b${escapeRegex(term)}\\b`, 'i');
      if (pattern.test(content)) {
        detected.set(term, {
          name: term,
          confidence: 0.7,
          path,
        });
      }
    }
  }

  const minConfidence = opts.minConfidence ?? 0.3;
  return [...detected.values()]
    .filter((p) => p.confidence >= minConfidence)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, opts.maxProjects);
}

/**
 * Detect clients mentioned in content
 */
export function detectClients(
  content: string,
  clientVocab: Map<string, string>,
  options: ContextDetectionOptions = {}
): DetectedClient[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const detected = new Map<string, DetectedClient>();

  // Check "for {client}" patterns
  const forPatterns = [
    /for\s+(?:the\s+)?(\w+)\s+client/gi,
    /client[:\s]+["']?(\w+)["']?/gi,
    /(?:our|the)\s+client\s+(\w+)/gi,
  ];

  for (const pattern of forPatterns) {
    const matches = [...content.matchAll(pattern)];
    for (const match of matches) {
      const name = match[1]?.toLowerCase();
      if (name && name.length > 2) {
        const existsPath = clientVocab.get(name);
        if (!detected.has(name)) {
          detected.set(name, {
            name,
            confidence: existsPath ? 0.8 : 0.5,
            path: existsPath,
          });
        }
      }
    }
  }

  // Check against vault vocabulary
  for (const [term, path] of clientVocab.entries()) {
    if (!detected.has(term) && term.length > 2) {
      const pattern = new RegExp(`\\b${escapeRegex(term)}\\b`, 'i');
      if (pattern.test(content)) {
        detected.set(term, {
          name: term,
          confidence: 0.7,
          path,
        });
      }
    }
  }

  const minConfidence = opts.minConfidence ?? 0.3;
  return [...detected.values()]
    .filter((c) => c.confidence >= minConfidence)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, opts.maxClients);
}

/**
 * Detect capture type (source, knowledge, or project)
 */
export function detectCaptureType(content: string): DetectedCaptureType {
  const indicators: string[] = [];
  let sourceScore = 0;
  let projectScore = 0;
  let knowledgeScore = 0;

  // Check source indicators
  for (const pattern of SOURCE_INDICATORS) {
    const match = content.match(pattern);
    if (match) {
      sourceScore += 1;
      indicators.push(`Source: "${match[0]}"`);
    }
  }

  // Check project indicators
  for (const pattern of PROJECT_INDICATORS) {
    const match = content.match(pattern);
    if (match) {
      projectScore += 1;
      indicators.push(`Project: "${match[0]}"`);
    }
  }

  // Check knowledge indicators
  for (const pattern of KNOWLEDGE_INDICATORS) {
    const match = content.match(pattern);
    if (match) {
      knowledgeScore += 1;
      indicators.push(`Knowledge: "${match[0]}"`);
    }
  }

  // Determine likely capture type
  let likely: CaptureType = 'knowledge';
  let maxScore = knowledgeScore;

  if (sourceScore > maxScore) {
    likely = 'source';
    maxScore = sourceScore;
  }

  if (projectScore > maxScore) {
    likely = 'project';
    maxScore = projectScore;
  }

  // Calculate confidence
  const total = sourceScore + projectScore + knowledgeScore;
  let confidence = 0.3; // Default low confidence

  if (total > 0) {
    confidence = Math.min(0.4 + (maxScore / total) * 0.5, 0.9);
  }

  return {
    likely,
    confidence,
    indicators,
  };
}

/**
 * Full context detection (Phase 017)
 */
export function detectContext(
  content: string,
  db: Database.Database,
  options: ContextDetectionOptions = {}
): DetectedContext {
  // Build vocabularies from index
  const domainVocab = buildDomainVocabulary(db);
  const projectVocab = buildProjectVocabulary(db);
  const clientVocab = buildClientVocabulary(db);

  return {
    capture_type: detectCaptureType(content),
    domains: detectDomains(content, domainVocab, options),
    projects: detectProjects(content, projectVocab, options),
    clients: detectClients(content, clientVocab, options),
  };
}

/**
 * Escape regex special characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
