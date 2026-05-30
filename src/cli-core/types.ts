export enum AgentType {
  PLANNER = 'planner',
  ARCHITECT = 'architect',
  CODER = 'coder',
  TDD_GUIDE = 'tdd_guide',
  CODE_REVIEWER = 'code_reviewer',
  SECURITY_REVIEWER = 'security_reviewer',
}

export type TaskStatus = 'pending' | 'in-progress' | 'done' | 'failed' | 'skipped';
export type IntegrationMode = 'native' | 'compatible' | 'disabled';
export type ImplementationMethod = 'tdd' | 'implementation' | 'refactor' | 'docs' | 'migration';

export interface MethodologyIntegrations {
  openspec: { mode: IntegrationMode };
  superpowers: { mode: IntegrationMode };
  ecc: { mode: IntegrationMode };
}

export interface WorkflowArtifacts {
  openspecChange: string;
  proposal: string;
  specDelta: string;
  implementationPlan: string;
  verificationReport: string;
}

export interface TaskContext {
  taskId: string;
  parentTaskId?: string;
  title: string;
  description: string;
  taskType: 'design' | 'implementation' | 'review' | 'testing' | 'security' | 'other';
  designContext: {
    designDocRef: string;
    relevantSpecs: string[];
    architectureNotes: string;
  };
  input: {
    files: { path: string; content?: string; action: string }[];
    dependencies: string[];
    environment: { language: string; framework: string; buildTool: string; testFramework: string };
  };
  output: {
    expectedArtifacts: { type: string; description: string; pathHint?: string; validation?: any }[];
    constraints: { maxFilesChanged?: number; mustPassTests: boolean; codeStyle?: string };
  };
  change: {
    activeChange: string;
    artifacts: WorkflowArtifacts;
  };
  methodology: MethodologyIntegrations;
  implementation: {
    method: ImplementationMethod;
    specRefs: string[];
    acceptanceRefs: string[];
  };
  verification: {
    commands: string[];
  };
  evidence: {
    required: string[];
    tests?: string[];
    filesChanged?: string[];
    traceIds?: string[];
  };
  acceptanceCriteria: string[];
  guardConditions: { requireReview: boolean; requireTests: boolean; blocking: boolean };
  metadata: { createdBy: string; createdAt: string; priority: string; estimatedComplexity: number };
  iteration?: { round: number; reason?: string; previousTraceId?: string };
}

export interface NovaState {
  version: number;
  project: string;
  environment: string[];
  currentPhase: string;
  activeChange?: string;
  integrations?: MethodologyIntegrations;
  artifacts?: WorkflowArtifacts;
  phases: Record<string, any>;
  metadata: { stateVersion: number; lastModified: string; history: any[] };
}

export interface DispatchRequest {
  agent: AgentType;
  context: TaskContext;
  model?: string;
  timeout?: number;
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  retry?: { maxAttempts: number; backoff: string };
  outputSchema?: string;
}

export interface DispatchResult {
  traceId: string;
  agent: AgentType;
  status: 'success' | 'failed' | 'timeout' | 'validation_error';
  output?: any;
  rawOutput?: string;
  metadata: {
    startTime: Date;
    endTime: Date;
    attempts: number;
    tokenUsage?: { prompt: number; completion: number };
  };
  errors?: ErrorDetail[];
}

export interface ErrorDetail { message: string; code?: string; }

// 环境适配器接口
export interface AdapterSetupOptions {
  skillsDir?: 'project' | 'user';
}

export interface EnvironmentAdapter {
  name: string;
  setup(cwd: string, options?: AdapterSetupOptions): Promise<void>;
}

// Pipeline types
export interface PipelineTask {
  id: string;
  agent: AgentType;
  context: TaskContext;
  timeout?: number;
  retry?: { maxAttempts: number; backoff: 'fixed' | 'exponential' };
}

export interface Stage {
  id: string;
  tasks: PipelineTask[];
  dependsOn?: string[];
  onStageFailure?: 'fail_fast' | 'continue';
}

export interface Pipeline {
  stages: Stage[];
}

export interface StageResult {
  stageId: string;
  status: 'success' | 'partial' | 'failed';
  taskResults: DispatchResult[];
}

export interface PipelineResult {
  status: 'success' | 'partial' | 'failed';
  stages: StageResult[];
}
