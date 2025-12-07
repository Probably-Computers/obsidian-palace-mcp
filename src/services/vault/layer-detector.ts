/**
 * Knowledge Layer Detector
 *
 * Determines which knowledge layer a piece of content belongs to:
 * - Layer 1: Technical (technologies/, commands/, reference/)
 * - Layer 2: Domain (standards/, patterns/, research/)
 * - Layer 3: Contextual (projects/, clients/, products/)
 */

import type { StorageIntent, IntentKnowledgeType } from '../../types/intent.js';
import { KnowledgeLayer } from '../../types/intent.js';

// Mapping from knowledge type to default layer
const KNOWLEDGE_TYPE_LAYER_MAP: Record<IntentKnowledgeType, KnowledgeLayer> = {
  // Layer 1: Technical - How things work
  technology: KnowledgeLayer.TECHNICAL,
  command: KnowledgeLayer.TECHNICAL,
  reference: KnowledgeLayer.TECHNICAL,

  // Layer 2: Domain - Best practices and patterns
  standard: KnowledgeLayer.DOMAIN,
  pattern: KnowledgeLayer.DOMAIN,
  research: KnowledgeLayer.DOMAIN,

  // Layer 3: Contextual - Project-specific
  decision: KnowledgeLayer.CONTEXTUAL,
  configuration: KnowledgeLayer.CONTEXTUAL,

  // These depend on context
  troubleshooting: KnowledgeLayer.DOMAIN, // Default to domain unless project-specific
  note: KnowledgeLayer.DOMAIN, // General notes default to domain
};

// Types that are ALWAYS technical regardless of context
const ALWAYS_TECHNICAL: IntentKnowledgeType[] = ['technology', 'command', 'reference'];

// Types that ALWAYS belong in contextual layer
const ALWAYS_CONTEXTUAL: IntentKnowledgeType[] = ['decision', 'configuration'];

/**
 * Determine the knowledge layer for a storage intent
 */
export function determineLayer(intent: StorageIntent): KnowledgeLayer {
  const { knowledge_type, scope, project, client, product } = intent;

  // Rule 1: Technical knowledge is ALWAYS Layer 1
  // This enforces the principle: technical knowledge is never trapped in projects
  if (ALWAYS_TECHNICAL.includes(knowledge_type)) {
    return KnowledgeLayer.TECHNICAL;
  }

  // Rule 2: Decisions and configurations are ALWAYS Layer 3 (contextual)
  // They only make sense in a project/client/product context
  if (ALWAYS_CONTEXTUAL.includes(knowledge_type)) {
    return KnowledgeLayer.CONTEXTUAL;
  }

  // Rule 3: Explicit project-specific scope
  if (scope === 'project-specific') {
    return KnowledgeLayer.CONTEXTUAL;
  }

  // Rule 4: Has explicit project/client/product context
  if (project || client || product) {
    // For troubleshooting and notes, having context means Layer 3
    if (knowledge_type === 'troubleshooting' || knowledge_type === 'note') {
      return KnowledgeLayer.CONTEXTUAL;
    }
  }

  // Rule 5: Use default mapping for the knowledge type
  return KNOWLEDGE_TYPE_LAYER_MAP[knowledge_type];
}

/**
 * Get the base folder for a knowledge layer in a vault
 */
export function getLayerBaseFolders(layer: KnowledgeLayer): string[] {
  switch (layer) {
    case KnowledgeLayer.TECHNICAL:
      return ['technologies', 'commands', 'reference'];
    case KnowledgeLayer.DOMAIN:
      return ['standards', 'patterns', 'research'];
    case KnowledgeLayer.CONTEXTUAL:
      return ['projects', 'clients', 'products'];
  }
}

/**
 * Get the typical folder name for a knowledge type
 */
export function getKnowledgeTypeFolder(knowledgeType: IntentKnowledgeType): string {
  const FOLDER_MAP: Record<IntentKnowledgeType, string> = {
    technology: 'technologies',
    command: 'commands',
    reference: 'reference',
    standard: 'standards',
    pattern: 'patterns',
    research: 'research',
    decision: 'decisions',
    configuration: 'configurations',
    troubleshooting: 'troubleshooting',
    note: 'notes',
  };
  return FOLDER_MAP[knowledgeType];
}

/**
 * Check if content appears to be reusable (general) knowledge
 * This is used when content is discovered in a project context
 * to determine if it should be stored in Layer 1/2 instead
 */
export function isReusableKnowledge(content: string, intent: StorageIntent): boolean {
  // Technical types are always reusable
  if (ALWAYS_TECHNICAL.includes(intent.knowledge_type)) {
    return true;
  }

  // Standards and patterns are always reusable
  if (intent.knowledge_type === 'standard' || intent.knowledge_type === 'pattern') {
    return true;
  }

  // Check content for indicators of reusability
  const contentLower = content.toLowerCase();

  // Generic how-to content is likely reusable
  const genericIndicators = [
    'in general',
    'typically',
    'best practice',
    'recommended',
    'convention',
    'should always',
    'can be used',
    'works by',
    'is used for',
    'allows you to',
  ];

  // Project-specific indicators suggest NOT reusable
  const specificIndicators = [
    'for this project',
    'we decided',
    'our team',
    'specific to',
    'only in this',
    'here we',
    'in our case',
  ];

  const genericScore = genericIndicators.filter((i) => contentLower.includes(i)).length;
  const specificScore = specificIndicators.filter((i) => contentLower.includes(i)).length;

  // If more generic indicators, likely reusable
  return genericScore > specificScore;
}

/**
 * Suggest where project-discovered technical knowledge should go
 */
export interface LayerSuggestion {
  primaryLayer: KnowledgeLayer;
  shouldCreateReference: boolean;
  referenceLocation?: string; // If technical knowledge discovered in project
  reasoning: string;
}

export function suggestLayer(intent: StorageIntent, content: string): LayerSuggestion {
  const baseLayer = determineLayer(intent);

  // If Layer 3 but content looks reusable, suggest creating in Layer 1/2
  // with a reference in Layer 3
  if (baseLayer === KnowledgeLayer.CONTEXTUAL && isReusableKnowledge(content, intent)) {
    const technicalLayer =
      intent.knowledge_type === 'troubleshooting'
        ? KnowledgeLayer.DOMAIN
        : KnowledgeLayer.TECHNICAL;

    return {
      primaryLayer: technicalLayer,
      shouldCreateReference: true,
      referenceLocation: buildContextualPath(intent),
      reasoning:
        'Content appears to be reusable knowledge discovered in project context. ' +
        'Storing in general knowledge with reference from project.',
    };
  }

  return {
    primaryLayer: baseLayer,
    shouldCreateReference: false,
    reasoning: `Knowledge type '${intent.knowledge_type}' belongs in ${baseLayer} layer.`,
  };
}

/**
 * Build a contextual path for a reference (projects/x/notes/reference.md)
 */
function buildContextualPath(intent: StorageIntent): string {
  if (intent.project) {
    return `projects/${intent.project}/notes/`;
  }
  if (intent.client) {
    return `clients/${intent.client}/notes/`;
  }
  if (intent.product) {
    return `products/${intent.product}/notes/`;
  }
  return 'notes/';
}
