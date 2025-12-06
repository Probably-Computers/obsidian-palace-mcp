/**
 * Autolink service exports
 */

// Scanner exports
export {
  buildTitleIndex,
  buildLinkableIndex,
  scanForMatches,
  DEFAULT_MIN_TITLE_LENGTH,
  type LinkableTitle,
  type AutolinkMatch,
} from './scanner.js';

// Linker exports
export {
  findSkipZones,
  isInSkipZone,
  insertLinks,
  autolinkContent,
  type AutolinkResult,
} from './linker.js';

// Aliases exports
export {
  loadNoteAliases,
  mergeAliasesIntoIndex,
  buildCompleteIndex,
  type AliasConflict,
} from './aliases.js';

// Re-export wikilink utility for convenience
export { createWikiLink } from '../../utils/wikilinks.js';
