/**
 * Clarify Types (Phase 014)
 *
 * Types for AI support tools that help maintain graph integrity,
 * detect context, and generate clarifying questions.
 */

import { z } from 'zod';
import type { IntentKnowledgeType, StorageIntent } from './intent.js';

// Missing context types that need clarification
export type MissingContextType =
  | 'scope' // General vs project-specific
  | 'project' // Which project
  | 'client' // Which client
  | 'technologies' // Confirm technology links
  | 'domain'; // Categorization

// Question types for clarification
export type QuestionType = 'choice' | 'confirm' | 'text';

// Detected technology with confidence
export interface DetectedTechnology {
  name: string;
  confidence: number;
  exists_in_vault: boolean;
  suggested_path?: string | undefined;
}

// Detected project reference
export interface DetectedProject {
  name: string;
  confidence: number;
  path?: string | undefined;
}

// Detected client reference
export interface DetectedClient {
  name: string;
  confidence: number;
  path?: string | undefined;
}

// Scope detection result
export interface DetectedScope {
  likely: 'general' | 'project-specific';
  confidence: number;
  indicators: string[];
}

// Domain detection result
export interface DetectedDomain {
  name: string;
  confidence: number;
}

// Full context detection output
export interface DetectedContext {
  technologies: DetectedTechnology[];
  projects: DetectedProject[];
  clients: DetectedClient[];
  scope: DetectedScope;
  domains: DetectedDomain[];
}

// A question to ask for clarification
export interface ClarifyQuestion {
  key: MissingContextType;
  question: string;
  type: QuestionType;
  options?: string[] | undefined;
  detected_hints?: string[] | undefined;
  default?: string | undefined;
}

// Suggestions based on detection
export interface ClarifySuggestions {
  scope?: 'general' | 'project-specific' | undefined;
  project?: string | undefined;
  client?: string | undefined;
  technologies?: string[] | undefined;
  domain?: string[] | undefined;
}

// Confidence scores for each field
export interface ClarifyConfidence {
  overall: number;
  per_field: Record<string, number>;
}

// Input for palace_clarify
export interface PalaceClarifyInput {
  context: {
    title: string;
    content_preview: string; // First 500 chars
    detected_technologies?: string[] | undefined;
    detected_context?: {
      possible_projects: string[];
      possible_clients: string[];
    } | undefined;
  };
  missing: MissingContextType[];
  vault?: string | undefined;
}

// Output from palace_clarify
export interface PalaceClarifyOutput {
  success: boolean;
  vault: string;
  vaultPath: string;

  // Full detection results
  detected: DetectedContext;

  // Questions to ask the user
  questions: ClarifyQuestion[];

  // Suggestions for AI to present
  suggestions: ClarifySuggestions;

  // Confidence in the detection
  confidence: ClarifyConfidence;

  // Summary message
  message: string;
}

// Options for context detection
export interface ContextDetectionOptions {
  maxTechnologies?: number | undefined;
  maxProjects?: number | undefined;
  maxClients?: number | undefined;
  maxDomains?: number | undefined;
  minConfidence?: number | undefined;
}

// Result from missing identifier
export interface MissingContextResult {
  missing: MissingContextType[];
  partial: MissingContextType[];
  complete: MissingContextType[];
  reasons: Record<MissingContextType, string>;
}

// Partial storage intent for validation
export type PartialStorageIntent = Partial<StorageIntent> & {
  knowledge_type?: IntentKnowledgeType | undefined;
};

// ============================================
// Zod Schemas for Validation
// ============================================

export const missingContextTypeSchema = z.enum([
  'scope',
  'project',
  'client',
  'technologies',
  'domain',
]);

export const questionTypeSchema = z.enum(['choice', 'confirm', 'text']);

export const clarifyContextSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  content_preview: z.string(),
  detected_technologies: z.array(z.string()).optional(),
  detected_context: z
    .object({
      possible_projects: z.array(z.string()),
      possible_clients: z.array(z.string()),
    })
    .optional(),
});

export const palaceClarifyInputSchema = z.object({
  context: clarifyContextSchema,
  missing: z.array(missingContextTypeSchema).default([]),
  vault: z.string().optional(),
});
