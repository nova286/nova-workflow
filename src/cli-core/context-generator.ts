import { StateManager } from './state';
import { ImplementationMethod, MethodologyIntegrations, TaskContext, WorkflowArtifacts } from './types';
import { detectProjectEnvironment } from './project-detect';

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

function resolveTestStrategy(state: any, task: any) {
  return task.testStrategy ||
    state.phases?.propose?.testStrategy ||
    state.testStrategy ||
    state.artifacts?.testStrategy;
}

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
    const env = (state as any).projectEnvironment || await detectProjectEnvironment(process.cwd(), projectType);
    const taskType = TYPE_MAP[task.type] || 'other';
    const figmaTraceability = task.figma || (state as any).phases?.propose?.figma || (state as any).artifacts?.figmaTraceability;
    const testStrategy = resolveTestStrategy(state, task);
    const expectedArtifacts = [...(task.expectedArtifacts || [])];
    if (figmaTraceability?.assetRequirements?.length) {
      expectedArtifacts.push({
        type: 'figma-assets',
        description: figmaTraceability.assetRequirements.join(', '),
        pathHint: 'src/assets or project asset directory',
      });
    }

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
        expectedArtifacts: expectedArtifacts.map((a: any) => ({
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
        testStrategy,
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
