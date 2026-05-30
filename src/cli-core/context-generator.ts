import { StateManager } from './state';
import { ImplementationMethod, MethodologyIntegrations, TaskContext, WorkflowArtifacts } from './types';

const PROJECT_TYPE_ENV: Record<
  string,
  { language: string; framework: string; buildTool: string; testFramework: string }
> = {
  node: { language: 'TypeScript', framework: 'Express.js', buildTool: 'npm', testFramework: 'jest' },
  python: { language: 'Python', framework: '', buildTool: 'pip', testFramework: 'pytest' },
  go: { language: 'Go', framework: '', buildTool: 'go', testFramework: 'testing' },
  java: { language: 'Java', framework: 'Spring Boot', buildTool: 'maven', testFramework: 'junit' },
  rust: { language: 'Rust', framework: '', buildTool: 'cargo', testFramework: 'cargo test' },
  ruby: { language: 'Ruby', framework: 'Rails', buildTool: 'bundler', testFramework: 'rspec' },
  php: { language: 'PHP', framework: 'Laravel', buildTool: 'composer', testFramework: 'phpunit' },
  cpp: { language: 'C++', framework: '', buildTool: 'cmake', testFramework: 'gtest' },
  csharp: { language: 'C#', framework: '.NET', buildTool: 'dotnet', testFramework: 'xunit' },
  swift: { language: 'Swift', framework: 'SwiftUI', buildTool: 'swift', testFramework: 'XCTest' },
  kotlin: { language: 'Kotlin', framework: 'Spring Boot', buildTool: 'gradle', testFramework: 'junit' },
};

const TYPE_MAP: Record<string, TaskContext['taskType']> = {
  implementation: 'implementation',
  design: 'design',
  review: 'review',
  test: 'testing',
  testing: 'testing',
  security: 'security',
};

const DEFAULT_INTEGRATIONS: MethodologyIntegrations = {
  openspec: { mode: 'compatible' },
  superpowers: { mode: 'compatible' },
  ecc: { mode: 'compatible' },
};

const DEFAULT_ARTIFACTS: WorkflowArtifacts = {
  openspecChange: '',
  proposal: '',
  specDelta: '',
  implementationPlan: '',
  verificationReport: '',
};

function normalizeMethod(method: unknown, taskType: TaskContext['taskType']): ImplementationMethod {
  if (
    method === 'tdd' ||
    method === 'implementation' ||
    method === 'refactor' ||
    method === 'docs' ||
    method === 'migration'
  ) {
    return method;
  }
  return taskType === 'testing' ? 'tdd' : 'implementation';
}

export class ContextGenerator {
  static async generateFromTask(task: any): Promise<TaskContext> {
    const state = await StateManager.load();
    const projectType: string = (state as any).projectType || '';
    const env = PROJECT_TYPE_ENV[projectType] || {
      language: '',
      framework: '',
      buildTool: '',
      testFramework: '',
    };
    const taskType = TYPE_MAP[task.type] || 'other';

    return {
      taskId: task.id,
      parentTaskId: task.parentId,
      title: task.title,
      description: task.description,
      taskType,
      designContext: {
        designDocRef: state.phases.design?.designDoc || '',
        relevantSpecs: task.specRefs || [],
        architectureNotes: '',
      },
      input: {
        files: (task.files || []).map((f: any) => ({
          path: f.path,
          content: '',
          action: f.action,
        })),
        dependencies: task.dependencies || [],
        environment: env,
      },
      output: {
        expectedArtifacts: (task.expectedArtifacts || []).map((a: any) => ({
          type: a.type,
          description: a.description,
          pathHint: a.pathHint,
          validation: a.validation,
        })),
        constraints: task.constraints || { mustPassTests: true },
      },
      change: {
        activeChange: (state as any).activeChange || '',
        artifacts: { ...DEFAULT_ARTIFACTS, ...((state as any).artifacts || {}) },
      },
      methodology: { ...DEFAULT_INTEGRATIONS, ...((state as any).integrations || {}) },
      implementation: {
        method: normalizeMethod(task.method, taskType),
        specRefs: task.specRefs || [],
        acceptanceRefs: task.acceptanceRefs || [],
      },
      verification: {
        commands: task.verification?.commands || [],
      },
      evidence: {
        required: task.evidence?.required || [],
        tests: task.evidence?.tests,
        filesChanged: task.evidence?.filesChanged,
        traceIds: task.evidence?.traceIds,
      },
      acceptanceCriteria: task.acceptance || [],
      guardConditions: {
        requireReview: true,
        requireTests: true,
        blocking: task.blocking !== false,
      },
      metadata: {
        createdBy: 'nova-build',
        createdAt: new Date().toISOString(),
        priority: task.priority || 'medium',
        estimatedComplexity: task.estimatedComplexity || 5,
      },
    };
  }
}
