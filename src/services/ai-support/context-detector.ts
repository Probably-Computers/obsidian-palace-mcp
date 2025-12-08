/**
 * Context detector for AI support tools
 *
 * Detects technologies, projects, clients, scope, and domains in content
 * to help AI determine storage intent automatically.
 */

import Database from 'better-sqlite3';
import { logger } from '../../utils/logger.js';
import type {
  DetectedContext,
  DetectedTechnology,
  DetectedProject,
  DetectedClient,
  DetectedScope,
  DetectedDomain,
  ContextDetectionOptions,
} from '../../types/clarify.js';

// Default detection options
const DEFAULT_OPTIONS: Required<ContextDetectionOptions> = {
  maxTechnologies: 10,
  maxProjects: 5,
  maxClients: 5,
  maxDomains: 5,
  minConfidence: 0.3,
};

// Known technology patterns (case-insensitive)
const TECH_PATTERNS: Record<string, RegExp> = {
  // Languages
  typescript: /\btypescript\b|\bts\b(?!\s*=)/i,
  javascript: /\bjavascript\b|\bjs\b(?!\s*=)/i,
  python: /\bpython\b|\bpy\b/i,
  rust: /\brust\b|\brustc\b/i,
  go: /\bgolang\b|\bgo\s+(?:mod|build|run)\b/i,
  java: /\bjava\b(?!script)/i,
  csharp: /\bc#\b|\bcsharp\b|\.net\b/i,

  // Frameworks
  react: /\breact\b|\breact\.js\b|\breactjs\b/i,
  vue: /\bvue\b|\bvue\.js\b|\bvuejs\b/i,
  angular: /\bangular\b/i,
  nextjs: /\bnext\.js\b|\bnextjs\b/i,
  express: /\bexpress\b|\bexpress\.js\b/i,
  fastapi: /\bfastapi\b/i,
  django: /\bdjango\b/i,

  // Infrastructure
  docker: /\bdocker\b|\bcontainer\b|\bdockerfile\b/i,
  kubernetes: /\bkubernetes\b|\bk8s\b|\bkubectl\b/i,
  terraform: /\bterraform\b|\btf\b|\b\.tf\b/i,
  ansible: /\bansible\b/i,
  nginx: /\bnginx\b/i,
  aws: /\baws\b|\bamazon\s+web\s+services\b/i,
  azure: /\bazure\b|\bmicrosoft\s+azure\b/i,
  gcp: /\bgcp\b|\bgoogle\s+cloud\b/i,

  // Databases
  postgresql: /\bpostgres(?:ql)?\b|\bpg\b/i,
  mysql: /\bmysql\b/i,
  mongodb: /\bmongodb\b|\bmongo\b/i,
  redis: /\bredis\b/i,
  sqlite: /\bsqlite\b/i,
  elasticsearch: /\belasticsearch\b|\belastic\b/i,

  // Tools
  git: /\bgit\b(?!hub)/i,
  github: /\bgithub\b/i,
  gitlab: /\bgitlab\b/i,
  npm: /\bnpm\b|\bpackage\.json\b/i,
  yarn: /\byarn\b/i,
  webpack: /\bwebpack\b/i,
  vite: /\bvite\b/i,
};

// Code block language hints
const CODE_BLOCK_PATTERN = /```(\w+)/gi;

// File extension patterns
const FILE_EXT_PATTERNS: Record<string, string[]> = {
  typescript: ['.ts', '.tsx'],
  javascript: ['.js', '.jsx', '.mjs', '.cjs'],
  python: ['.py'],
  rust: ['.rs'],
  go: ['.go'],
  yaml: ['.yaml', '.yml'],
  json: ['.json'],
  dockerfile: ['Dockerfile', '.dockerfile'],
};

// Scope indicators
const PROJECT_SPECIFIC_INDICATORS = [
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

const GENERAL_INDICATORS = [
  /\bgeneral(?:ly)?\b/i,
  /\buniversal(?:ly)?\b/i,
  /\bstandard\s+(?:way|approach|practice)\b/i,
  /\bbest\s+practice\b/i,
  /\bcommon(?:ly)?\b/i,
  /\btypical(?:ly)?\b/i,
  /\bofficial\s+documentation\b/i,
  /\bin\s+general\b/i,
  /\bby\s+default\b/i,
];

// Domain patterns
const DOMAIN_PATTERNS: Record<string, RegExp[]> = {
  networking: [/\bnetwork(?:ing)?\b/i, /\btcp\b|\budp\b/i, /\bip\s+address\b/i, /\bdns\b/i, /\bfirewall\b/i],
  security: [/\bsecurity\b/i, /\bauthentication\b/i, /\bauthorization\b/i, /\bencryption\b/i, /\bssl\b|\btls\b/i],
  database: [/\bdatabase\b/i, /\bsql\b/i, /\bquery\b/i, /\btable\b|\bschema\b/i],
  devops: [/\bdevops\b/i, /\bci\/cd\b/i, /\bpipeline\b/i, /\bdeployment\b/i],
  frontend: [/\bfrontend\b/i, /\bui\b|\bux\b/i, /\bcss\b/i, /\bhtml\b/i, /\bdom\b/i],
  backend: [/\bbackend\b/i, /\bapi\b/i, /\bserver\b/i, /\bendpoint\b/i],
  testing: [/\btest(?:ing)?\b/i, /\bunit\s+test\b/i, /\bintegration\s+test\b/i, /\be2e\b/i],
  documentation: [/\bdocumentation\b/i, /\breadme\b/i, /\bcomment(?:s)?\b/i],
};

/**
 * Build technology vocabulary from vault index
 */
export function buildTechVocabulary(db: Database.Database): Map<string, string> {
  const vocab = new Map<string, string>();

  try {
    // Get all notes in technologies/ directory
    const techNotes = db
      .prepare("SELECT path, title FROM notes WHERE path LIKE 'technologies/%' OR path LIKE 'tech/%'")
      .all() as Array<{ path: string; title: string }>;

    for (const note of techNotes) {
      const title = note.title.toLowerCase();
      vocab.set(title, note.path);

      // Also add path-based variants
      const filename = note.path.split('/').pop()?.replace(/\.md$/i, '');
      if (filename) {
        vocab.set(filename.toLowerCase(), note.path);
      }
    }

    // Get notes with type=technology or similar tags
    const typedNotes = db
      .prepare("SELECT path, title FROM notes WHERE type IN ('technology', 'research', 'command')")
      .all() as Array<{ path: string; title: string }>;

    for (const note of typedNotes) {
      if (!vocab.has(note.title.toLowerCase())) {
        vocab.set(note.title.toLowerCase(), note.path);
      }
    }

    logger.debug(`Built tech vocabulary with ${vocab.size} entries`);
  } catch (error) {
    logger.warn('Failed to build tech vocabulary:', error);
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
 * Detect technologies in content
 */
export function detectTechnologies(
  content: string,
  techVocab: Map<string, string>,
  options: ContextDetectionOptions = {}
): DetectedTechnology[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const detected = new Map<string, DetectedTechnology>();

  // Check against known tech patterns
  for (const [tech, pattern] of Object.entries(TECH_PATTERNS)) {
    const matches = content.match(pattern);
    if (matches) {
      const existsPath = techVocab.get(tech.toLowerCase());
      const confidence = Math.min(0.5 + matches.length * 0.1, 0.9);

      detected.set(tech, {
        name: tech,
        confidence,
        exists_in_vault: !!existsPath,
        suggested_path: existsPath,
      });
    }
  }

  // Check code block languages
  const codeBlocks = [...content.matchAll(CODE_BLOCK_PATTERN)];
  for (const match of codeBlocks) {
    const lang = match[1]?.toLowerCase();
    if (lang && !detected.has(lang)) {
      const existsPath = techVocab.get(lang);
      detected.set(lang, {
        name: lang,
        confidence: 0.7,
        exists_in_vault: !!existsPath,
        suggested_path: existsPath,
      });
    }
  }

  // Check file extensions mentioned
  for (const [tech, exts] of Object.entries(FILE_EXT_PATTERNS)) {
    for (const ext of exts) {
      if (content.includes(ext) && !detected.has(tech)) {
        const existsPath = techVocab.get(tech.toLowerCase());
        detected.set(tech, {
          name: tech,
          confidence: 0.5,
          exists_in_vault: !!existsPath,
          suggested_path: existsPath,
        });
      }
    }
  }

  // Check against vault vocabulary
  for (const [term, path] of techVocab.entries()) {
    if (!detected.has(term)) {
      // Check if the term appears in content (case-insensitive word boundary)
      const pattern = new RegExp(`\\b${escapeRegex(term)}\\b`, 'i');
      if (pattern.test(content)) {
        detected.set(term, {
          name: term,
          confidence: 0.6,
          exists_in_vault: true,
          suggested_path: path,
        });
      }
    }
  }

  // Filter by confidence and limit
  const minConfidence = opts.minConfidence !== undefined ? opts.minConfidence : 0.3;
  const results = [...detected.values()]
    .filter((t) => t.confidence >= minConfidence)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, opts.maxTechnologies);

  return results;
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

  const minConfidence = opts.minConfidence !== undefined ? opts.minConfidence : 0.3;
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

  const minConfidence = opts.minConfidence !== undefined ? opts.minConfidence : 0.3;
  return [...detected.values()]
    .filter((c) => c.confidence >= minConfidence)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, opts.maxClients);
}

/**
 * Detect scope (general vs project-specific)
 */
export function detectScope(content: string): DetectedScope {
  const indicators: string[] = [];
  let projectScore = 0;
  let generalScore = 0;

  // Check project-specific indicators
  for (const pattern of PROJECT_SPECIFIC_INDICATORS) {
    const match = content.match(pattern);
    if (match) {
      projectScore += 1;
      indicators.push(`Contains "${match[0]}"`);
    }
  }

  // Check general indicators
  for (const pattern of GENERAL_INDICATORS) {
    const match = content.match(pattern);
    if (match) {
      generalScore += 1;
      indicators.push(`Contains "${match[0]}"`);
    }
  }

  // Default to general if no strong indicators
  if (projectScore === 0 && generalScore === 0) {
    return {
      likely: 'general',
      confidence: 0.3,
      indicators: ['No specific scope indicators found'],
    };
  }

  const total = projectScore + generalScore;
  const likely = projectScore > generalScore ? 'project-specific' : 'general';
  const winningScore = Math.max(projectScore, generalScore);
  const confidence = Math.min(0.5 + (winningScore / total) * 0.4, 0.9);

  return {
    likely,
    confidence,
    indicators,
  };
}

/**
 * Detect domains in content
 */
export function detectDomains(
  content: string,
  options: ContextDetectionOptions = {}
): DetectedDomain[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const detected = new Map<string, DetectedDomain>();

  for (const [domain, patterns] of Object.entries(DOMAIN_PATTERNS)) {
    let matchCount = 0;
    for (const pattern of patterns) {
      if (pattern.test(content)) {
        matchCount++;
      }
    }

    if (matchCount > 0) {
      const confidence = Math.min(0.3 + matchCount * 0.2, 0.9);
      detected.set(domain, {
        name: domain,
        confidence,
      });
    }
  }

  const minConfidence = opts.minConfidence !== undefined ? opts.minConfidence : 0.3;
  return [...detected.values()]
    .filter((d) => d.confidence >= minConfidence)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, opts.maxDomains);
}

/**
 * Full context detection
 */
export function detectContext(
  content: string,
  db: Database.Database,
  options: ContextDetectionOptions = {}
): DetectedContext {
  // Build vocabularies from index
  const techVocab = buildTechVocabulary(db);
  const projectVocab = buildProjectVocabulary(db);
  const clientVocab = buildClientVocabulary(db);

  return {
    technologies: detectTechnologies(content, techVocab, options),
    projects: detectProjects(content, projectVocab, options),
    clients: detectClients(content, clientVocab, options),
    scope: detectScope(content),
    domains: detectDomains(content, options),
  };
}

/**
 * Escape regex special characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
