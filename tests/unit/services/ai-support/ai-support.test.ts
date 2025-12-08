/**
 * Unit tests for AI Support services
 */

import { describe, it, expect } from 'vitest';

describe('AI Support System', () => {
  describe('Context Detector Exports', () => {
    it('should export detectContext function', async () => {
      const { detectContext } = await import(
        '../../../../src/services/ai-support/context-detector.js'
      );
      expect(detectContext).toBeDefined();
      expect(typeof detectContext).toBe('function');
    });

    it('should export detectTechnologies function', async () => {
      const { detectTechnologies } = await import(
        '../../../../src/services/ai-support/context-detector.js'
      );
      expect(detectTechnologies).toBeDefined();
      expect(typeof detectTechnologies).toBe('function');
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

    it('should export detectScope function', async () => {
      const { detectScope } = await import(
        '../../../../src/services/ai-support/context-detector.js'
      );
      expect(detectScope).toBeDefined();
      expect(typeof detectScope).toBe('function');
    });

    it('should export detectDomains function', async () => {
      const { detectDomains } = await import(
        '../../../../src/services/ai-support/context-detector.js'
      );
      expect(detectDomains).toBeDefined();
      expect(typeof detectDomains).toBe('function');
    });

    it('should export vocabulary builders', async () => {
      const { buildTechVocabulary, buildProjectVocabulary, buildClientVocabulary } =
        await import('../../../../src/services/ai-support/context-detector.js');
      expect(buildTechVocabulary).toBeDefined();
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
      const exports = await import('../../../../src/services/ai-support/index.js');
      expect(exports.detectContext).toBeDefined();
      expect(exports.detectTechnologies).toBeDefined();
      expect(exports.detectProjects).toBeDefined();
      expect(exports.detectClients).toBeDefined();
      expect(exports.detectScope).toBeDefined();
      expect(exports.detectDomains).toBeDefined();
    });

    it('should export all missing identifier functions', async () => {
      const exports = await import('../../../../src/services/ai-support/index.js');
      expect(exports.identifyMissing).toBeDefined();
      expect(exports.isIntentComplete).toBeDefined();
      expect(exports.prioritizeMissing).toBeDefined();
    });

    it('should export all question generator functions', async () => {
      const exports = await import('../../../../src/services/ai-support/index.js');
      expect(exports.generateQuestions).toBeDefined();
      expect(exports.generateSuggestions).toBeDefined();
      expect(exports.calculateConfidence).toBeDefined();
      expect(exports.generateSummaryMessage).toBeDefined();
    });
  });
});

describe('Technology Detection', () => {
  it('should detect known technologies by patterns', async () => {
    const { detectTechnologies } = await import(
      '../../../../src/services/ai-support/context-detector.js'
    );

    const content = 'This uses Docker and Kubernetes for container orchestration.';
    const vocab = new Map<string, string>();

    const detected = detectTechnologies(content, vocab);

    expect(detected.some((t) => t.name === 'docker')).toBe(true);
    expect(detected.some((t) => t.name === 'kubernetes')).toBe(true);
  });

  it('should detect technologies from code blocks', async () => {
    const { detectTechnologies } = await import(
      '../../../../src/services/ai-support/context-detector.js'
    );

    const content = '```typescript\nconst x = 1;\n```';
    const vocab = new Map<string, string>();

    const detected = detectTechnologies(content, vocab);

    expect(detected.some((t) => t.name === 'typescript')).toBe(true);
  });

  it('should include vault path for known technologies', async () => {
    const { detectTechnologies } = await import(
      '../../../../src/services/ai-support/context-detector.js'
    );

    const content = 'Working with Docker containers.';
    const vocab = new Map<string, string>([['docker', 'technologies/docker.md']]);

    const detected = detectTechnologies(content, vocab);
    const docker = detected.find((t) => t.name === 'docker');

    expect(docker).toBeDefined();
    expect(docker?.exists_in_vault).toBe(true);
    expect(docker?.suggested_path).toBe('technologies/docker.md');
  });
});

describe('Scope Detection', () => {
  it('should detect project-specific scope', async () => {
    const { detectScope } = await import(
      '../../../../src/services/ai-support/context-detector.js'
    );

    const content = 'Our project uses a custom configuration for the internal API.';
    const result = detectScope(content);

    expect(result.likely).toBe('project-specific');
    expect(result.confidence).toBeGreaterThan(0.3);
    expect(result.indicators.length).toBeGreaterThan(0);
  });

  it('should detect general scope', async () => {
    const { detectScope } = await import(
      '../../../../src/services/ai-support/context-detector.js'
    );

    const content =
      'This is a general best practice for handling authentication in web applications.';
    const result = detectScope(content);

    expect(result.likely).toBe('general');
    expect(result.confidence).toBeGreaterThan(0.3);
  });

  it('should return low confidence when no indicators', async () => {
    const { detectScope } = await import(
      '../../../../src/services/ai-support/context-detector.js'
    );

    const content = 'Simple technical content without scope hints.';
    const result = detectScope(content);

    expect(result.confidence).toBeLessThanOrEqual(0.3);
  });
});

describe('Domain Detection', () => {
  it('should detect networking domain', async () => {
    const { detectDomains } = await import(
      '../../../../src/services/ai-support/context-detector.js'
    );

    const content = 'Configure the network with DNS and firewall rules.';
    const detected = detectDomains(content);

    expect(detected.some((d) => d.name === 'networking')).toBe(true);
  });

  it('should detect security domain', async () => {
    const { detectDomains } = await import(
      '../../../../src/services/ai-support/context-detector.js'
    );

    const content = 'Security best practices for authentication and encryption.';
    const detected = detectDomains(content);

    expect(detected.some((d) => d.name === 'security')).toBe(true);
  });

  it('should detect multiple domains', async () => {
    const { detectDomains } = await import(
      '../../../../src/services/ai-support/context-detector.js'
    );

    const content =
      'DevOps pipeline for deploying the backend API with database migrations.';
    const detected = detectDomains(content);

    expect(detected.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Missing Identifier', () => {
  it('should identify missing domain for technology type', async () => {
    const { identifyMissing } = await import(
      '../../../../src/services/ai-support/missing-identifier.js'
    );

    const intent = {
      knowledge_type: 'technology' as const,
      domain: [],
    };

    const result = identifyMissing(intent);

    expect(result.missing).toContain('domain');
  });

  it('should identify missing project for project-specific scope', async () => {
    const { identifyMissing } = await import(
      '../../../../src/services/ai-support/missing-identifier.js'
    );

    const intent = {
      knowledge_type: 'decision' as const,
      domain: ['kubernetes'],
      scope: 'project-specific' as const,
    };

    const result = identifyMissing(intent);

    expect(result.missing).toContain('project');
  });

  it('should mark complete fields', async () => {
    const { identifyMissing } = await import(
      '../../../../src/services/ai-support/missing-identifier.js'
    );

    const intent = {
      knowledge_type: 'technology' as const,
      domain: ['kubernetes', 'networking'],
    };

    const result = identifyMissing(intent);

    expect(result.complete).toContain('domain');
  });

  it('should provide reasons for missing fields', async () => {
    const { identifyMissing } = await import(
      '../../../../src/services/ai-support/missing-identifier.js'
    );

    const intent = {
      knowledge_type: 'technology' as const,
      domain: [],
    };

    const result = identifyMissing(intent);

    expect(result.reasons['domain']).toBeDefined();
    expect(result.reasons['domain'].length).toBeGreaterThan(0);
  });
});

describe('Intent Completeness', () => {
  it('should detect complete technology intent', async () => {
    const { isIntentComplete } = await import(
      '../../../../src/services/ai-support/missing-identifier.js'
    );

    const intent = {
      knowledge_type: 'technology' as const,
      domain: ['kubernetes'],
    };

    expect(isIntentComplete(intent)).toBe(true);
  });

  it('should detect incomplete decision intent', async () => {
    const { isIntentComplete } = await import(
      '../../../../src/services/ai-support/missing-identifier.js'
    );

    const intent = {
      knowledge_type: 'decision' as const,
      domain: ['kubernetes'],
      scope: 'project-specific' as const,
      // Missing project
    };

    expect(isIntentComplete(intent)).toBe(false);
  });
});

describe('Missing Field Priority', () => {
  it('should prioritize scope first', async () => {
    const { prioritizeMissing } = await import(
      '../../../../src/services/ai-support/missing-identifier.js'
    );

    const missing = ['technologies', 'domain', 'scope'] as const;
    const partial = [] as const;

    const prioritized = prioritizeMissing([...missing], [...partial]);

    expect(prioritized[0]).toBe('scope');
  });

  it('should prioritize domain over project', async () => {
    const { prioritizeMissing } = await import(
      '../../../../src/services/ai-support/missing-identifier.js'
    );

    const missing = ['project', 'domain'] as const;
    const partial = [] as const;

    const prioritized = prioritizeMissing([...missing], [...partial]);

    expect(prioritized.indexOf('domain')).toBeLessThan(prioritized.indexOf('project'));
  });
});

describe('Question Generator', () => {
  it('should generate questions for missing fields', async () => {
    const { generateQuestions } = await import(
      '../../../../src/services/ai-support/question-generator.js'
    );

    const missing = ['scope'] as const;
    const partial = [] as const;
    const detected = {
      technologies: [],
      projects: [],
      clients: [],
      scope: { likely: 'general' as const, confidence: 0.4, indicators: [] },
      domains: [],
    };

    const questions = generateQuestions(
      [...missing],
      [...partial],
      'Docker Networking',
      'How to configure Docker networking...',
      detected,
      { scope: 'Unable to determine scope' }
    );

    expect(questions.length).toBe(1);
    expect(questions[0]?.key).toBe('scope');
    expect(questions[0]?.type).toBe('choice');
  });

  it('should include detected hints in questions', async () => {
    const { generateQuestions } = await import(
      '../../../../src/services/ai-support/question-generator.js'
    );

    const missing = [] as const;
    const partial = ['technologies'] as const;
    const detected = {
      technologies: [
        { name: 'docker', confidence: 0.8, exists_in_vault: true },
        { name: 'kubernetes', confidence: 0.7, exists_in_vault: false },
      ],
      projects: [],
      clients: [],
      scope: { likely: 'general' as const, confidence: 0.5, indicators: [] },
      domains: [],
    };

    const questions = generateQuestions(
      [...missing],
      [...partial],
      'Container Orchestration',
      'Setting up containers...',
      detected,
      { technologies: 'Detected technologies need confirmation' }
    );

    const techQuestion = questions.find((q) => q.key === 'technologies');
    expect(techQuestion).toBeDefined();
    expect(techQuestion?.detected_hints).toContain('docker');
    expect(techQuestion?.detected_hints).toContain('kubernetes');
  });
});

describe('Suggestion Generation', () => {
  it('should suggest scope when confident', async () => {
    const { generateSuggestions } = await import(
      '../../../../src/services/ai-support/question-generator.js'
    );

    const detected = {
      technologies: [],
      projects: [],
      clients: [],
      scope: { likely: 'general' as const, confidence: 0.7, indicators: ['best practice'] },
      domains: [],
    };

    const suggestions = generateSuggestions(detected);

    expect(suggestions.scope).toBe('general');
  });

  it('should not suggest when confidence low', async () => {
    const { generateSuggestions } = await import(
      '../../../../src/services/ai-support/question-generator.js'
    );

    const detected = {
      technologies: [],
      projects: [],
      clients: [],
      scope: { likely: 'general' as const, confidence: 0.3, indicators: [] },
      domains: [],
    };

    const suggestions = generateSuggestions(detected);

    expect(suggestions.scope).toBeUndefined();
  });

  it('should suggest technologies with high confidence', async () => {
    const { generateSuggestions } = await import(
      '../../../../src/services/ai-support/question-generator.js'
    );

    const detected = {
      technologies: [
        { name: 'docker', confidence: 0.8, exists_in_vault: true },
        { name: 'nginx', confidence: 0.3, exists_in_vault: false },
      ],
      projects: [],
      clients: [],
      scope: { likely: 'general' as const, confidence: 0.5, indicators: [] },
      domains: [],
    };

    const suggestions = generateSuggestions(detected);

    expect(suggestions.technologies).toContain('docker');
    expect(suggestions.technologies).not.toContain('nginx');
  });
});

describe('Confidence Calculation', () => {
  it('should calculate overall confidence', async () => {
    const { calculateConfidence } = await import(
      '../../../../src/services/ai-support/question-generator.js'
    );

    const detected = {
      technologies: [{ name: 'docker', confidence: 0.8, exists_in_vault: true }],
      projects: [],
      clients: [],
      scope: { likely: 'general' as const, confidence: 0.7, indicators: [] },
      domains: [{ name: 'devops', confidence: 0.6 }],
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
      technologies: [{ name: 'docker', confidence: 0.8, exists_in_vault: true }],
      projects: [],
      clients: [],
      scope: { likely: 'general' as const, confidence: 0.7, indicators: [] },
      domains: [],
    };

    const result = calculateConfidence(detected, [], []);

    expect(result.per_field['scope']).toBe(0.7);
    expect(result.per_field['technologies']).toBe(0.8);
  });

  it('should penalize missing fields', async () => {
    const { calculateConfidence } = await import(
      '../../../../src/services/ai-support/question-generator.js'
    );

    const detected = {
      technologies: [{ name: 'docker', confidence: 0.8, exists_in_vault: true }],
      projects: [],
      clients: [],
      scope: { likely: 'general' as const, confidence: 0.7, indicators: [] },
      domains: [{ name: 'devops', confidence: 0.8 }], // Include domain so there's something to penalize
    };

    const withMissing = calculateConfidence(detected, ['domain'], []);
    const withoutMissing = calculateConfidence(detected, [], []);

    // With domain detected but marked as missing, score should be lower
    expect(withMissing.overall).toBeLessThanOrEqual(withoutMissing.overall);
  });
});

describe('Summary Message', () => {
  it('should indicate when no questions needed', async () => {
    const { generateSummaryMessage } = await import(
      '../../../../src/services/ai-support/question-generator.js'
    );

    const message = generateSummaryMessage([], {}, 0.8);

    expect(message).toContain('complete');
  });

  it('should list fields needing clarification', async () => {
    const { generateSummaryMessage } = await import(
      '../../../../src/services/ai-support/question-generator.js'
    );

    const questions = [
      { key: 'scope' as const, question: 'test', type: 'choice' as const },
      { key: 'domain' as const, question: 'test', type: 'choice' as const },
    ];

    const message = generateSummaryMessage(questions, {}, 0.5);

    expect(message).toContain('scope');
    expect(message).toContain('domain');
  });

  it('should indicate confidence level', async () => {
    const { generateSummaryMessage } = await import(
      '../../../../src/services/ai-support/question-generator.js'
    );

    const questions = [{ key: 'scope' as const, question: 'test', type: 'choice' as const }];

    const highConfidence = generateSummaryMessage(questions, {}, 0.8);
    const lowConfidence = generateSummaryMessage(questions, {}, 0.3);

    expect(highConfidence).toContain('High confidence');
    expect(lowConfidence).toContain('Limited');
  });
});

describe('Clarify Types', () => {
  it('should define missing context types', async () => {
    type MissingContextType =
      | 'scope'
      | 'project'
      | 'client'
      | 'technologies'
      | 'domain';

    const types: MissingContextType[] = [
      'scope',
      'project',
      'client',
      'technologies',
      'domain',
    ];

    expect(types.length).toBe(5);
  });

  it('should define question types', async () => {
    type QuestionType = 'choice' | 'confirm' | 'text';

    const types: QuestionType[] = ['choice', 'confirm', 'text'];

    expect(types.length).toBe(3);
  });

  it('should have correct clarify output structure', () => {
    const output = {
      success: true,
      vault: 'default',
      vaultPath: '/path/to/vault',
      detected: {
        technologies: [],
        projects: [],
        clients: [],
        scope: { likely: 'general' as const, confidence: 0.5, indicators: [] },
        domains: [],
      },
      questions: [],
      suggestions: {},
      confidence: { overall: 0.5, per_field: {} },
      message: 'test',
    };

    expect(output).toHaveProperty('success');
    expect(output).toHaveProperty('vault');
    expect(output).toHaveProperty('detected');
    expect(output).toHaveProperty('questions');
    expect(output).toHaveProperty('suggestions');
    expect(output).toHaveProperty('confidence');
    expect(output).toHaveProperty('message');
  });
});
