/**
 * Unit tests for AI Support services (Phase 017)
 */

import { describe, it, expect } from 'vitest';

describe('AI Support System (Phase 017)', () => {
  describe('Context Detector Exports', () => {
    it('should export detectContext function', async () => {
      const { detectContext } = await import(
        '../../../../src/services/ai-support/context-detector.js'
      );
      expect(detectContext).toBeDefined();
      expect(typeof detectContext).toBe('function');
    });

    it('should export detectDomains function', async () => {
      const { detectDomains } = await import(
        '../../../../src/services/ai-support/context-detector.js'
      );
      expect(detectDomains).toBeDefined();
      expect(typeof detectDomains).toBe('function');
    });

    it('should export detectProjects function', async () => {
      const { detectProjects } = await import(
        '../../../../src/services/ai-support/context-detector.js'
      );
      expect(detectProjects).toBeDefined();
      expect(typeof detectProjects).toBe('function');
    });

    it('should export detectClients function', async () => {
      const { detectClients } = await import(
        '../../../../src/services/ai-support/context-detector.js'
      );
      expect(detectClients).toBeDefined();
      expect(typeof detectClients).toBe('function');
    });

    it('should export detectCaptureType function', async () => {
      const { detectCaptureType } = await import(
        '../../../../src/services/ai-support/context-detector.js'
      );
      expect(detectCaptureType).toBeDefined();
      expect(typeof detectCaptureType).toBe('function');
    });

    it('should export vocabulary builders', async () => {
      const { buildDomainVocabulary, buildProjectVocabulary, buildClientVocabulary } =
        await import('../../../../src/services/ai-support/context-detector.js');
      expect(buildDomainVocabulary).toBeDefined();
      expect(buildProjectVocabulary).toBeDefined();
      expect(buildClientVocabulary).toBeDefined();
    });
  });

  describe('Missing Identifier Exports', () => {
    it('should export identifyMissing function', async () => {
      const { identifyMissing } = await import(
        '../../../../src/services/ai-support/missing-identifier.js'
      );
      expect(identifyMissing).toBeDefined();
      expect(typeof identifyMissing).toBe('function');
    });

    it('should export isIntentComplete function', async () => {
      const { isIntentComplete } = await import(
        '../../../../src/services/ai-support/missing-identifier.js'
      );
      expect(isIntentComplete).toBeDefined();
      expect(typeof isIntentComplete).toBe('function');
    });

    it('should export prioritizeMissing function', async () => {
      const { prioritizeMissing } = await import(
        '../../../../src/services/ai-support/missing-identifier.js'
      );
      expect(prioritizeMissing).toBeDefined();
      expect(typeof prioritizeMissing).toBe('function');
    });
  });

  describe('Question Generator Exports', () => {
    it('should export generateQuestions function', async () => {
      const { generateQuestions } = await import(
        '../../../../src/services/ai-support/question-generator.js'
      );
      expect(generateQuestions).toBeDefined();
      expect(typeof generateQuestions).toBe('function');
    });

    it('should export generateSuggestions function', async () => {
      const { generateSuggestions } = await import(
        '../../../../src/services/ai-support/question-generator.js'
      );
      expect(generateSuggestions).toBeDefined();
      expect(typeof generateSuggestions).toBe('function');
    });

    it('should export calculateConfidence function', async () => {
      const { calculateConfidence } = await import(
        '../../../../src/services/ai-support/question-generator.js'
      );
      expect(calculateConfidence).toBeDefined();
      expect(typeof calculateConfidence).toBe('function');
    });

    it('should export generateSummaryMessage function', async () => {
      const { generateSummaryMessage } = await import(
        '../../../../src/services/ai-support/question-generator.js'
      );
      expect(generateSummaryMessage).toBeDefined();
      expect(typeof generateSummaryMessage).toBe('function');
    });
  });

  describe('Index Exports', () => {
    it('should export all context detector functions', async () => {
      const {
        detectContext,
        detectDomains,
        detectProjects,
        detectClients,
        detectCaptureType,
      } = await import('../../../../src/services/ai-support/index.js');

      expect(detectContext).toBeDefined();
      expect(detectDomains).toBeDefined();
      expect(detectProjects).toBeDefined();
      expect(detectClients).toBeDefined();
      expect(detectCaptureType).toBeDefined();
    });

    it('should export all missing identifier functions', async () => {
      const { identifyMissing, isIntentComplete, prioritizeMissing } = await import(
        '../../../../src/services/ai-support/index.js'
      );

      expect(identifyMissing).toBeDefined();
      expect(isIntentComplete).toBeDefined();
      expect(prioritizeMissing).toBeDefined();
    });

    it('should export all question generator functions', async () => {
      const {
        generateQuestions,
        generateSuggestions,
        calculateConfidence,
        generateSummaryMessage,
      } = await import('../../../../src/services/ai-support/index.js');

      expect(generateQuestions).toBeDefined();
      expect(generateSuggestions).toBeDefined();
      expect(calculateConfidence).toBeDefined();
      expect(generateSummaryMessage).toBeDefined();
    });
  });
});

describe('Capture Type Detection (Phase 017)', () => {
  it('should detect source capture type', async () => {
    const { detectCaptureType } = await import(
      '../../../../src/services/ai-support/context-detector.js'
    );

    const sourceContent = 'From the book "Kubernetes in Action", the author says that pods are the basic unit.';
    const result = detectCaptureType(sourceContent);

    expect(result.likely).toBe('source');
    expect(result.confidence).toBeGreaterThan(0.3);
    expect(result.indicators.length).toBeGreaterThan(0);
  });

  it('should detect project capture type', async () => {
    const { detectCaptureType } = await import(
      '../../../../src/services/ai-support/context-detector.js'
    );

    const projectContent = 'For our project, we decided to use MongoDB. This is specific to our team.';
    const result = detectCaptureType(projectContent);

    expect(result.likely).toBe('project');
    expect(result.confidence).toBeGreaterThan(0.3);
    expect(result.indicators.length).toBeGreaterThan(0);
  });

  it('should detect knowledge capture type by default', async () => {
    const { detectCaptureType } = await import(
      '../../../../src/services/ai-support/context-detector.js'
    );

    const knowledgeContent = 'This is a best practice guide for Docker. Typically you should use multi-stage builds.';
    const result = detectCaptureType(knowledgeContent);

    expect(result.likely).toBe('knowledge');
    expect(result.indicators.length).toBeGreaterThan(0);
  });

  it('should return low confidence when no indicators found', async () => {
    const { detectCaptureType } = await import(
      '../../../../src/services/ai-support/context-detector.js'
    );

    const content = 'Hello world.';
    const result = detectCaptureType(content);

    expect(result.confidence).toBeLessThanOrEqual(0.4);
  });
});

describe('Domain Detection (Phase 017)', () => {
  it('should detect networking domain', async () => {
    const { detectDomains } = await import(
      '../../../../src/services/ai-support/context-detector.js'
    );

    const domainVocab = new Map<string, { path: string; noteCount: number }>();
    const content = 'This document covers TCP/IP networking and firewall configuration.';
    const domains = detectDomains(content, domainVocab);

    const networkingDomain = domains.find((d) => d.name === 'networking');
    expect(networkingDomain).toBeDefined();
    expect(networkingDomain?.confidence).toBeGreaterThan(0.3);
  });

  it('should detect security domain', async () => {
    const { detectDomains } = await import(
      '../../../../src/services/ai-support/context-detector.js'
    );

    const domainVocab = new Map<string, { path: string; noteCount: number }>();
    const content = 'Authentication and encryption are important for security.';
    const domains = detectDomains(content, domainVocab);

    const securityDomain = domains.find((d) => d.name === 'security');
    expect(securityDomain).toBeDefined();
    expect(securityDomain?.confidence).toBeGreaterThan(0.3);
  });

  it('should detect multiple domains', async () => {
    const { detectDomains } = await import(
      '../../../../src/services/ai-support/context-detector.js'
    );

    const domainVocab = new Map<string, { path: string; noteCount: number }>();
    const content = 'The backend API needs authentication. Database queries should be optimized.';
    const domains = detectDomains(content, domainVocab);

    expect(domains.length).toBeGreaterThan(1);
    const domainNames = domains.map((d) => d.name);
    expect(domainNames).toContain('backend');
    expect(domainNames).toContain('security');
  });

  it('should detect domains from code blocks', async () => {
    const { detectDomains } = await import(
      '../../../../src/services/ai-support/context-detector.js'
    );

    const domainVocab = new Map<string, { path: string; noteCount: number }>();
    const content = '```typescript\nconst x = 1;\n```';
    const domains = detectDomains(content, domainVocab);

    const tsDomain = domains.find((d) => d.name === 'typescript');
    expect(tsDomain).toBeDefined();
    expect(tsDomain?.confidence).toBeGreaterThanOrEqual(0.5);
  });
});

describe('Project Detection', () => {
  it('should detect project mentions', async () => {
    const { detectProjects } = await import(
      '../../../../src/services/ai-support/context-detector.js'
    );

    const projectVocab = new Map<string, string>();
    projectVocab.set('myapp', 'projects/myapp/');

    const content = 'For the myapp project, we need to configure the database.';
    const projects = detectProjects(content, projectVocab);

    expect(projects.length).toBeGreaterThan(0);
    expect(projects[0]?.name).toBe('myapp');
    expect(projects[0]?.confidence).toBeGreaterThan(0.5);
  });

  it('should detect projects from patterns', async () => {
    const { detectProjects } = await import(
      '../../../../src/services/ai-support/context-detector.js'
    );

    const projectVocab = new Map<string, string>();
    const content = 'This is for the alpha project codebase.';
    const projects = detectProjects(content, projectVocab);

    expect(projects.length).toBeGreaterThan(0);
  });
});

describe('Client Detection', () => {
  it('should detect client mentions', async () => {
    const { detectClients } = await import(
      '../../../../src/services/ai-support/context-detector.js'
    );

    const clientVocab = new Map<string, string>();
    clientVocab.set('acme', 'clients/acme/');

    const content = 'For the acme client, we need specific configuration.';
    const clients = detectClients(content, clientVocab);

    expect(clients.length).toBeGreaterThan(0);
    expect(clients[0]?.name).toBe('acme');
    expect(clients[0]?.confidence).toBeGreaterThan(0.5);
  });
});

describe('Missing Identifier (Phase 017)', () => {
  it('should identify missing capture_type', async () => {
    const { identifyMissing } = await import(
      '../../../../src/services/ai-support/missing-identifier.js'
    );

    const partialIntent = {
      domain: ['kubernetes'],
    };

    const result = identifyMissing(partialIntent);

    expect(result.missing).toContain('capture_type');
  });

  it('should identify missing domain', async () => {
    const { identifyMissing } = await import(
      '../../../../src/services/ai-support/missing-identifier.js'
    );

    const partialIntent = {
      capture_type: 'knowledge' as const,
    };

    const result = identifyMissing(partialIntent);

    expect(result.missing).toContain('domain');
  });

  it('should identify missing project for project capture type', async () => {
    const { identifyMissing } = await import(
      '../../../../src/services/ai-support/missing-identifier.js'
    );

    const partialIntent = {
      capture_type: 'project' as const,
      domain: ['architecture'],
    };

    const result = identifyMissing(partialIntent);

    expect(result.missing).toContain('project');
  });

  it('should mark intent complete when all fields present', async () => {
    const { isIntentComplete } = await import(
      '../../../../src/services/ai-support/missing-identifier.js'
    );

    const completeIntent = {
      capture_type: 'knowledge' as const,
      domain: ['kubernetes'],
    };

    expect(isIntentComplete(completeIntent)).toBe(true);
  });

  it('should detect incomplete source intent without source info', async () => {
    const { isIntentComplete } = await import(
      '../../../../src/services/ai-support/missing-identifier.js'
    );

    const incompleteIntent = {
      capture_type: 'source' as const,
      domain: ['book-notes'],
      // Missing source info
    };

    expect(isIntentComplete(incompleteIntent)).toBe(false);
  });
});

describe('Missing Field Priority (Phase 017)', () => {
  it('should prioritize capture_type first', async () => {
    const { prioritizeMissing } = await import(
      '../../../../src/services/ai-support/missing-identifier.js'
    );

    const missing = ['domain', 'capture_type', 'project'];
    const partial: string[] = [];
    const prioritized = prioritizeMissing(missing as any, partial as any);

    expect(prioritized[0]).toBe('capture_type');
  });

  it('should prioritize domain before project', async () => {
    const { prioritizeMissing } = await import(
      '../../../../src/services/ai-support/missing-identifier.js'
    );

    const missing = ['project', 'domain'];
    const partial: string[] = [];
    const prioritized = prioritizeMissing(missing as any, partial as any);

    const domainIdx = prioritized.indexOf('domain' as any);
    const projectIdx = prioritized.indexOf('project' as any);
    expect(domainIdx).toBeLessThan(projectIdx);
  });
});

describe('Question Generator (Phase 017)', () => {
  it('should generate questions for missing fields', async () => {
    const { generateQuestions } = await import(
      '../../../../src/services/ai-support/question-generator.js'
    );

    const detected = {
      capture_type: { likely: 'knowledge' as const, confidence: 0.5, indicators: [] },
      domains: [{ name: 'kubernetes', confidence: 0.7, exists_in_vault: false }],
      projects: [],
      clients: [],
    };

    const questions = generateQuestions(
      ['capture_type'],
      [],
      'Test Note',
      'Test content preview',
      detected,
      { capture_type: 'Needs confirmation' }
    );

    expect(questions.length).toBe(1);
    expect(questions[0]?.key).toBe('capture_type');
    expect(questions[0]?.question).toBeDefined();
  });

  it('should include domain options from detection', async () => {
    const { generateQuestions } = await import(
      '../../../../src/services/ai-support/question-generator.js'
    );

    const detected = {
      capture_type: { likely: 'knowledge' as const, confidence: 0.5, indicators: [] },
      domains: [
        { name: 'kubernetes', confidence: 0.8, exists_in_vault: true },
        { name: 'docker', confidence: 0.6, exists_in_vault: false },
      ],
      projects: [],
      clients: [],
    };

    const questions = generateQuestions(
      ['domain'],
      [],
      'Test Note',
      'Test content preview',
      detected,
      { domain: 'Domain needed' }
    );

    expect(questions[0]?.options).toBeDefined();
    expect(questions[0]?.options).toContain('kubernetes');
    expect(questions[0]?.options).toContain('docker');
  });
});

describe('Suggestion Generation (Phase 017)', () => {
  it('should suggest capture_type when confident', async () => {
    const { generateSuggestions } = await import(
      '../../../../src/services/ai-support/question-generator.js'
    );

    const detected = {
      capture_type: { likely: 'knowledge' as const, confidence: 0.7, indicators: [] },
      domains: [],
      projects: [],
      clients: [],
    };

    const suggestions = generateSuggestions(detected);

    expect(suggestions.capture_type).toBe('knowledge');
  });

  it('should suggest domains with high confidence', async () => {
    const { generateSuggestions } = await import(
      '../../../../src/services/ai-support/question-generator.js'
    );

    const detected = {
      capture_type: { likely: 'knowledge' as const, confidence: 0.5, indicators: [] },
      domains: [
        { name: 'docker', confidence: 0.8, exists_in_vault: true },
        { name: 'nginx', confidence: 0.4, exists_in_vault: false },
      ],
      projects: [],
      clients: [],
    };

    const suggestions = generateSuggestions(detected);

    expect(suggestions.domain).toContain('docker');
    expect(suggestions.domain).not.toContain('nginx');
  });
});

describe('Confidence Calculation (Phase 017)', () => {
  it('should calculate overall confidence', async () => {
    const { calculateConfidence } = await import(
      '../../../../src/services/ai-support/question-generator.js'
    );

    const detected = {
      capture_type: { likely: 'knowledge' as const, confidence: 0.7, indicators: [] },
      domains: [{ name: 'kubernetes', confidence: 0.8, exists_in_vault: true }],
      projects: [],
      clients: [],
    };

    const result = calculateConfidence(detected, [], []);

    expect(result.overall).toBeGreaterThan(0);
    expect(result.overall).toBeLessThanOrEqual(1);
  });

  it('should include per-field confidence', async () => {
    const { calculateConfidence } = await import(
      '../../../../src/services/ai-support/question-generator.js'
    );

    const detected = {
      capture_type: { likely: 'knowledge' as const, confidence: 0.7, indicators: [] },
      domains: [{ name: 'kubernetes', confidence: 0.8, exists_in_vault: true }],
      projects: [],
      clients: [],
    };

    const result = calculateConfidence(detected, [], []);

    expect(result.per_field['capture_type']).toBe(0.7);
    expect(result.per_field['domain']).toBe(0.8);
  });
});

describe('Summary Message Generation', () => {
  it('should generate message for high confidence', async () => {
    const { generateSummaryMessage } = await import(
      '../../../../src/services/ai-support/question-generator.js'
    );

    const message = generateSummaryMessage([{ key: 'domain', question: 'Q?', type: 'choice' }], {}, 0.8);

    expect(message).toContain('High confidence');
  });

  it('should generate message for low confidence', async () => {
    const { generateSummaryMessage } = await import(
      '../../../../src/services/ai-support/question-generator.js'
    );

    const message = generateSummaryMessage(
      [{ key: 'capture_type', question: 'Q?', type: 'choice' }],
      {},
      0.3
    );

    expect(message).toContain('Limited context');
  });

  it('should return complete message when no questions', async () => {
    const { generateSummaryMessage } = await import(
      '../../../../src/services/ai-support/question-generator.js'
    );

    const message = generateSummaryMessage([], {}, 0.9);

    expect(message).toContain('complete');
  });
});
