/**
 * Utils module exports
 */

export { logger } from './logger.js';

export {
  slugify,
  unslugify,
  titleFromFilename,
  filenameFromTitle,
} from './slugify.js';

export {
  parseFrontmatter,
  stringifyFrontmatter,
  createDefaultFrontmatter,
  mergeFrontmatter,
} from './frontmatter.js';

export {
  extractWikiLinks,
  createWikiLink,
  hasWikiLinkTo,
  getUniqueTargets,
  formatRelatedLinks,
  isInsideCodeOrLink,
} from './wikilinks.js';

export {
  extractTitle,
  extractHeadings,
  stripMarkdown,
  getSnippet,
  wordCount,
  isEmptyContent,
} from './markdown.js';

export {
  vaultParamSchema,
  resolveVaultParam,
  enforceWriteAccess,
  parseCrossVaultPath,
  resolvePathWithVault,
  formatCrossVaultPath,
  getVaultResultInfo,
} from './vault-param.js';
