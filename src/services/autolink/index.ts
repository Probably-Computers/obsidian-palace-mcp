/**
 * Autolink service exports
 */

// Scanner exports
export {
  buildTitleIndex,
  buildLinkableIndex,
  scanForMatches,
  filterByLinkMode,
  filterByStopWords,
  filterByDomainScope,
  filterByLinkDensity,
  analyzeLinkDensity,
  DEFAULT_MIN_TITLE_LENGTH,
  DEFAULT_STOP_WORDS,
  type LinkableTitle,
  type AutolinkMatch,
  type LinkMode,
  type LinkDensityOptions,
  type LinkDensityWarning,
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
