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
export type ChangeMode = 'existing' | 'incremental' | 'new';
export type RefactorPolicy = 'none' | 'minimal' | 'full';
export type ComplianceVerdictStatus = 'PASS' | 'CHANGES_REQUESTED' | 'BLOCKED';
export type ReviewIndependenceMode = 'subagent' | 'fresh-context' | 'same-session-fallback';
export type VerificationCommandStatus = 'PASS' | 'FAIL' | 'SKIPPED';

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
  unitTargets?: string[];
  unitTestTargets?: string[];
  rationale?: string;
}

export interface LegacyPreflightIssue {
  area: string;
  finding: string;
  severity: 'low' | 'medium' | 'high' | string;
  recommendation?: string;
}

export interface LegacyPreflight {
  required: boolean;
  performed: boolean;
  affectedAreas: string[];
  hasIssues: boolean;
  issues?: LegacyPreflightIssue[];
  refactorPolicy?: RefactorPolicy;
  userDecision?: string;
  rationale?: string;
}

export interface ComplianceRefs {
  projectRules?: string[];
  bestPractices?: string[];
}

export interface DeviationRationale {
  ref: string;
  reason: string;
  impact?: string;
  mitigation?: string;
  accepted?: boolean;
}

export interface ComplianceEvidence {
  followed?: string[];
  deviations?: DeviationRationale[];
  noOpRationale?: string;
}

export interface ComplianceVerdict {
  status: ComplianceVerdictStatus;
  deviations?: DeviationRationale[];
  rationale?: string;
}

export interface ReviewIndependence {
  mode: ReviewIndependenceMode;
  agent?: string;
  reviewer?: string;
  traceId?: string;
  rationale?: string;
}

export interface VerificationCommandResult {
  command: string;
  status: VerificationCommandStatus;
  exitCode?: number;
  summary?: string;
  rationale?: string;
}

export interface ProjectContextRules {
  sources: string[];
  must: string[];
  mustNot: string[];
  verificationCommands: string[];
}

export interface ProjectContextBestPractices {
  projectType: string;
  sources: string[];
  must: string[];
  should: string[];
  risks: string[];
}

export interface ProjectContextConflict {
  projectRule: string;
  bestPractice: string;
  resolution: 'project-rule' | 'best-practice' | 'case-by-case' | string;
  rationale: string;
}

export interface ProjectContextContract {
  rules: ProjectContextRules;
  bestPractices: ProjectContextBestPractices;
  conflicts?: ProjectContextConflict[];
  stack?: string[];
  risks?: string[];
  updatedAt?: string;
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
  complianceRefs?: ComplianceRefs;
  priority?: string;
  estimatedComplexity?: number;
  blocking?: boolean;
  figma?: FigmaTraceability;
  testStrategy?: TestStrategy;
  legacyPreflight?: LegacyPreflight;
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
  projectContext?: string;
  figmaTraceability?: FigmaTraceability;
  testStrategy?: TestStrategy;
  changeMode?: ChangeMode;
  legacyPreflight?: LegacyPreflight;
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
    legacyPreflight?: LegacyPreflight;
    complianceRefs?: ComplianceRefs;
  };
  projectContext?: ProjectContextContract;
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
    complianceRefs?: ComplianceRefs;
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
  changeMode?: ChangeMode;
  integrations?: MethodologyIntegrations;
  mcpServers?: McpServers;
  artifacts?: WorkflowArtifacts;
  projectContext?: ProjectContextContract;
  testStrategy?: TestStrategy;
  legacyPreflight?: LegacyPreflight;
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
