export enum AgentType {
  PLANNER = 'planner',
  ARCHITECT = 'architect',
  CODER = 'coder',
  TDD_GUIDE = 'tdd_guide',
  CODE_REVIEWER = 'code_reviewer',
  SECURITY_REVIEWER = 'security_reviewer',
  PI_CODING_AGENT = 'pi_coding_agent',
}

export type TaskStatus = 'pending' | 'in-progress' | 'done' | 'failed' | 'skipped';
export type IntegrationMode = 'native' | 'compatible' | 'disabled';
export type ImplementationMethod = 'tdd' | 'implementation' | 'refactor' | 'docs' | 'migration';
export type DesignTaskType = 'design' | 'implementation' | 'review' | 'testing' | 'security' | 'docs' | 'other';

export interface DesignTaskFile {
  path: string;
  action: string;
}

export interface TestFlow {
  name: string;
  entryPoint: string;
  steps: string[];
  expectedResult: string;
  routeOrScreen?: string;
  requiresMobileMcp?: boolean;
  blockedReason?: string;
}

export interface TestStrategy {
  automatedUiTesting: boolean;
  unitTesting: boolean;
  uiFlows?: TestFlow[];
  unitTestTargets?: string[];
  rationale?: string;
}

export interface DesignTask {
  id: string;
  title: string;
  description?: string;
  type: DesignTaskType;
  method?: ImplementationMethod;
  parentId?: string;
  files: DesignTaskFile[];
  dependencies?: string[];
  specRefs?: string[];
  acceptanceRefs?: string[];
  acceptance: string[];
  verification?: { commands?: string[] };
  expectedArtifacts?: Array<{ type: string; description: string; pathHint?: string; validation?: unknown }>;
  constraints?: { maxFilesChanged?: number; mustPassTests: boolean; codeStyle?: string };
  evidence?: { required?: string[]; tests?: string[]; filesChanged?: string[]; traceIds?: string[] };
  priority?: string;
  estimatedComplexity?: number;
  blocking?: boolean;
  figma?: FigmaTraceability;
  testStrategy?: TestStrategy;
}

export interface FigmaTraceability {
  url?: string;
  nodeIds?: string[];
  pageMode?: 'existing' | 'incremental' | 'new' | string;
  routeOrScreen?: string;
  entryPoint?: string;
  assetRequirements?: string[];
  blockedReason?: string;
}

export interface ProjectEnvironment {
  language: string;
  framework: string;
  buildTool: string;
  testFramework: string;
  buildCommand?: string;
  testCommand?: string;
}

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
  figmaTraceability?: FigmaTraceability;
  testStrategy?: TestStrategy;
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
    testStrategy?: TestStrategy;
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

export interface McpServerConfig {
  configured: boolean;
  serverName: string;
  platform?: string;
}

export interface McpServers {
  figma?: McpServerConfig;
  mobile?: McpServerConfig;
}

export interface NovaState {
  version: number;
  project: string;
  environment: string[];
  currentPhase: string;
  activeChange?: string;
  integrations?: MethodologyIntegrations;
  mcpServers?: McpServers;
  artifacts?: WorkflowArtifacts;
  testStrategy?: TestStrategy;
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
  mcpServers?: McpServers;
  homeDir?: string;
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
