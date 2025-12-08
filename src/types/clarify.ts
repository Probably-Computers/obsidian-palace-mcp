/**
 * Clarify Types (Phase 017 - Topic-Based Architecture)
 *
 * Types for AI support tools that help detect context and
 * generate clarifying questions for storage intents.
 *
 * Phase 017 changes:
 * - Removed 'scope' and 'technologies' from MissingContextType
 * - Added 'capture_type' as a clarification type
 * - Updated PartialStorageIntent to match new schema
 */

import { z } from 'zod';
import type { CaptureType, StorageIntent } from './intent.js';

// Missing context types that need clarification (Phase 017)
export type MissingContextType =
  | 'capture_type' // source, knowledge, or project
  | 'domain' // Topic hierarchy
  | 'project' // Which project (for project captures)
  | 'client' // Which client (for client-specific projects)
  | 'source_info'; // Source details (for source captures)

// Question types for clarification
export type QuestionType = 'choice' | 'confirm' | 'text';

// Detected domain/topic
export interface DetectedDomain {
  name: string;
  confidence: number;
  exists_in_vault: boolean;
  note_count?: number | undefined;
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

// Capture type detection result
export interface DetectedCaptureType {
  likely: CaptureType;
  confidence: number;
  indicators: string[];
}

// Full context detection output (Phase 017)
export interface DetectedContext {
  capture_type: DetectedCaptureType;
  domains: DetectedDomain[];
  projects: DetectedProject[];
  clients: DetectedClient[];
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

// Suggestions based on detection (Phase 017)
export interface ClarifySuggestions {
  capture_type?: CaptureType | undefined;
  domain?: string[] | undefined;
  project?: string | undefined;
  client?: string | undefined;
}

// Confidence scores for each field
export interface ClarifyConfidence {
  overall: number;
  per_field: Record<string, number>;
}

// Input for palace_clarify (Phase 017)
export interface PalaceClarifyInput {
  context: {
    title: string;
    content_preview: string; // First 500 chars
    detected_domains?: string[] | undefined;
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
  maxDomains?: number | undefined;
  maxProjects?: number | undefined;
  maxClients?: number | undefined;
  minConfidence?: number | undefined;
}

// Result from missing identifier
export interface MissingContextResult {
  missing: MissingContextType[];
  partial: MissingContextType[];
  complete: MissingContextType[];
  reasons: Record<MissingContextType, string>;
}

// Partial storage intent for validation (Phase 017)
export type PartialStorageIntent = Partial<StorageIntent> & {
  capture_type?: CaptureType | undefined;
};

// ============================================
// Zod Schemas for Validation
// ============================================

export const missingContextTypeSchema = z.enum([
  'capture_type',
  'domain',
  'project',
  'client',
  'source_info',
]);

export const questionTypeSchema = z.enum(['choice', 'confirm', 'text']);

export const clarifyContextSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  content_preview: z.string(),
  detected_domains: z.array(z.string()).optional(),
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

