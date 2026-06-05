import {
  validateAcceptance,
  validateFiles,
  validateSpecBoundExecution,
  validateTaskIds,
  validateTaskSchema,
} from './quality-check';
import * as fs from 'fs';
import * as path from 'path';

export interface ValidationIssue {
  code: string;
  message: string;
  path?: string;
}

export interface ValidationResult {
  pass: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export interface ValidationOptions {
  cwd?: string;
  checkFiles?: boolean;
}

const PHASES = ['propose', 'design', 'implement', 'verify', 'archive'] as const;
const PHASE_STATUS = new Set(['pending', 'in-progress', 'done', 'failed']);
const TASK_STATUS = new Set(['pending', 'in-progress', 'done', 'failed', 'skipped']);

function issue(code: string, message: string, path?: string): ValidationIssue {
  return { code, message, path };
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function artifactExists(filePath: unknown, cwd: string): boolean {
  if (!hasText(filePath)) return false;
  return fs.existsSync(path.resolve(cwd, filePath));
}

function readArtifact(filePath: unknown, cwd: string): string {
  if (!hasText(filePath)) return '';
  try {
    return fs.readFileSync(path.resolve(cwd, filePath), 'utf-8');
  } catch {
    return '';
  }
}

function hasFigmaUrl(text: unknown): boolean {
  return typeof text === 'string' && /https?:\/\/(?:www\.)?figma\.com\//i.test(text);
}

function validateFigmaTraceability(state: any, proposalContent: string, errors: ValidationIssue[]) {
  const trace = state.phases?.propose?.figma || state.figma || state.artifacts?.figmaTraceability;
  const requiresTrace = Boolean(trace) || hasFigmaUrl(proposalContent) || hasFigmaUrl(state.phases?.propose?.proposal);
  if (!requiresTrace) return;

  if (hasText(trace?.blockedReason)) return;

  const requiredFields = ['url', 'pageMode', 'routeOrScreen', 'entryPoint'];
  for (const field of requiredFields) {
    if (!hasText(trace?.[field])) {
      errors.push(issue('figma.traceability.missing', `Figma traceability is missing ${field}`, `phases.propose.figma.${field}`));
    }
  }

  if (!Array.isArray(trace?.nodeIds) || trace.nodeIds.length === 0) {
    errors.push(issue('figma.traceability.missing', 'Figma traceability is missing nodeIds', 'phases.propose.figma.nodeIds'));
  }
  if (!Array.isArray(trace?.assetRequirements) || trace.assetRequirements.length === 0) {
    errors.push(issue('figma.traceability.missing', 'Figma traceability is missing assetRequirements', 'phases.propose.figma.assetRequirements'));
  }
}

function resolveTestStrategy(state: any) {
  return state.phases?.propose?.testStrategy || state.testStrategy || state.artifacts?.testStrategy;
}

function commandLooksLikeUiTest(command: unknown): boolean {
  if (typeof command !== 'string') return false;
  return /\b(playwright|cypress|detox|maestro|appium|mobile|simulator|xcodebuild|e2e|ui[-:]?test)\b/i.test(command);
}

function commandLooksLikeUnitTest(command: unknown): boolean {
  if (typeof command !== 'string') return false;
  if (commandLooksLikeUiTest(command)) return false;
  return /\b(test|jest|vitest|mocha|pytest|go test|cargo test|xctest|phpunit|rspec)\b/i.test(command);
}

function taskHasCommand(task: any, predicate: (command: unknown) => boolean): boolean {
  return Array.isArray(task.verification?.commands) && task.verification.commands.some(predicate);
}

function validateTestStrategy(state: any, tasks: any[], errors: ValidationIssue[]) {
  const strategy = resolveTestStrategy(state);
  if (state.phases?.propose?.status === 'done' && !strategy) {
    errors.push(issue('test-strategy.missing', 'propose is done but testStrategy is missing', 'phases.propose.testStrategy'));
    return;
  }
  if (!strategy) return;

  if (typeof strategy !== 'object' || Array.isArray(strategy)) {
    errors.push(issue('test-strategy.invalid', 'testStrategy must be an object', 'phases.propose.testStrategy'));
    return;
  }
  if (typeof strategy.automatedUiTesting !== 'boolean') {
    errors.push(issue('test-strategy.invalid', 'testStrategy.automatedUiTesting must be a boolean', 'phases.propose.testStrategy.automatedUiTesting'));
  }
  if (typeof strategy.unitTesting !== 'boolean') {
    errors.push(issue('test-strategy.invalid', 'testStrategy.unitTesting must be a boolean', 'phases.propose.testStrategy.unitTesting'));
  }
  if (typeof strategy.automatedUiTesting !== 'boolean' || typeof strategy.unitTesting !== 'boolean') {
    return;
  }

  if (strategy.automatedUiTesting === true) {
    const uiFlows = Array.isArray(strategy.uiFlows) ? strategy.uiFlows : [];
    const hasBlockedReason = typeof strategy.rationale === 'string' && strategy.rationale.trim().length > 0;
    if (uiFlows.length === 0 && !hasBlockedReason) {
      errors.push(issue('test-strategy.ui-flow.missing', 'automated UI testing is selected but no UI flow or rationale is recorded', 'phases.propose.testStrategy.uiFlows'));
    }
    for (const [index, flow] of uiFlows.entries()) {
      const base = `phases.propose.testStrategy.uiFlows.${index}`;
      if (!hasText(flow?.name)) errors.push(issue('test-strategy.ui-flow.invalid', 'UI flow is missing name', `${base}.name`));
      if (!hasText(flow?.entryPoint)) errors.push(issue('test-strategy.ui-flow.invalid', 'UI flow is missing entryPoint', `${base}.entryPoint`));
      if (!Array.isArray(flow?.steps) || flow.steps.length === 0) errors.push(issue('test-strategy.ui-flow.invalid', 'UI flow is missing steps', `${base}.steps`));
      if (!hasText(flow?.expectedResult)) errors.push(issue('test-strategy.ui-flow.invalid', 'UI flow is missing expectedResult', `${base}.expectedResult`));
    }

    if (state.phases?.design?.status === 'done') {
      const hasUiTaskOrCommand = tasks.some(task =>
        task.type === 'testing' && (
          task.testKind === 'ui' ||
          task.testType === 'ui' ||
          task.uiFlowRef ||
          taskHasCommand(task, commandLooksLikeUiTest)
        )
      ) || tasks.some(task => taskHasCommand(task, commandLooksLikeUiTest));
      if (!hasUiTaskOrCommand) {
        errors.push(issue('test-strategy.ui-task.missing', 'automated UI testing is selected but design has no UI testing task or UI verification command', 'phases.design.tasks'));
      }
    }
  }

  if (strategy.unitTesting === true && state.phases?.design?.status === 'done') {
    const targets = Array.isArray(strategy.unitTestTargets) ? strategy.unitTestTargets : [];
    const hasUnitCommand = tasks.some(task =>
      (task.type === 'implementation' || task.type === 'testing') && taskHasCommand(task, commandLooksLikeUnitTest)
    );
    if (targets.length === 0) {
      errors.push(issue('test-strategy.unit-targets.missing', 'unit testing is selected but no unitTestTargets are recorded', 'phases.propose.testStrategy.unitTestTargets'));
    }
    if (!hasUnitCommand) {
      errors.push(issue('test-strategy.unit-command.missing', 'unit testing is selected but design tasks have no unit test verification command', 'phases.design.tasks'));
    }
  }
}

function pushQualityErrors(
  errors: ValidationIssue[],
  code: string,
  path: string,
  messages: string[]
) {
  for (const message of messages) {
    errors.push(issue(code, message, path));
  }
}

export function validateState(state: any, options: ValidationOptions = {}): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const cwd = options.cwd ?? process.cwd();
  const checkFiles = options.checkFiles !== false;

  if (!state || typeof state !== 'object') {
    return {
      pass: false,
      errors: [issue('state.invalid', 'State must be a YAML object')],
      warnings,
    };
  }

  if (typeof state.version !== 'number') {
    errors.push(issue('state.version.invalid', 'version must be a number', 'version'));
  }
  if (typeof state.project !== 'string' || state.project.length === 0) {
    errors.push(issue('state.project.invalid', 'project must be a non-empty string', 'project'));
  }
  if (!Array.isArray(state.environment)) {
    errors.push(issue('state.environment.invalid', 'environment must be an array', 'environment'));
  }
  if (!state.phases || typeof state.phases !== 'object') {
    errors.push(issue('state.phases.missing', 'phases must be an object', 'phases'));
  }
  if (!state.metadata || typeof state.metadata !== 'object') {
    errors.push(issue('state.metadata.missing', 'metadata must be an object', 'metadata'));
  }

  const phases = state.phases || {};
  for (const phase of PHASES) {
    const data = phases[phase];
    if (!data || typeof data !== 'object') {
      errors.push(issue('phase.missing', `${phase} phase is missing`, `phases.${phase}`));
      continue;
    }
    if (!PHASE_STATUS.has(data.status)) {
      errors.push(
        issue('phase.status.invalid', `${phase} status is invalid: ${data.status}`, `phases.${phase}.status`)
      );
    }
  }

  const propose = phases.propose || {};
  if (propose.status === 'done' && !propose.proposal) {
    errors.push(issue('propose.proposal.missing', 'propose is done but proposal is empty', 'phases.propose.proposal'));
  }
  const proposalPath = propose.proposal || state.artifacts?.proposal;
  let proposalContent = '';
  if (propose.status === 'done' && checkFiles) {
    if (!artifactExists(proposalPath, cwd)) {
      errors.push(issue('propose.proposal.not-found', `proposal file not found: ${proposalPath || '(empty)'}`, 'phases.propose.proposal'));
    } else {
      proposalContent = readArtifact(proposalPath, cwd);
    }
    if (!hasText(state.activeChange)) {
      errors.push(issue('propose.active-change.missing', 'propose is done but activeChange is empty', 'activeChange'));
    }
    if (!hasText(state.artifacts?.specDelta)) {
      errors.push(issue('propose.spec-delta.missing', 'propose is done but artifacts.specDelta is empty', 'artifacts.specDelta'));
    }
  }
  validateFigmaTraceability(state, proposalContent, errors);

  const design = phases.design || {};
  const tasks = design.tasks || [];
  if (design.status === 'done') {
    if (!design.designDoc) {
      errors.push(issue('design.doc.missing', 'design is done but designDoc is empty', 'phases.design.designDoc'));
    }
    if (checkFiles && !artifactExists(design.designDoc, cwd)) {
      errors.push(issue('design.doc.not-found', `design document not found: ${design.designDoc || '(empty)'}`, 'phases.design.designDoc'));
    }
    if (!Array.isArray(tasks) || tasks.length === 0) {
      errors.push(issue('design.tasks.empty', 'design is done but tasks is empty', 'phases.design.tasks'));
    }
  }

  if (Array.isArray(tasks) && tasks.length > 0) {
    const schema = validateTaskSchema(tasks);
    const ids = validateTaskIds(tasks);
    const files = validateFiles(tasks);
    const acceptance = validateAcceptance(tasks);
    const spec = validateSpecBoundExecution(tasks);

    pushQualityErrors(errors, 'task.schema.invalid', 'phases.design.tasks', schema.errors);
    pushQualityErrors(errors, 'task.id.invalid', 'phases.design.tasks', ids.errors);
    pushQualityErrors(errors, 'task.files.invalid', 'phases.design.tasks', files.errors);
    pushQualityErrors(errors, 'task.acceptance.invalid', 'phases.design.tasks', acceptance.errors);
    pushQualityErrors(errors, 'task.spec.invalid', 'phases.design.tasks', spec.errors);
  }

  validateTestStrategy(state, Array.isArray(tasks) ? tasks : [], errors);

  const implement = phases.implement || {};
  const taskResults = implement.tasks || {};
  if (implement.status === 'done') {
    if (!taskResults || typeof taskResults !== 'object' || Object.keys(taskResults).length === 0) {
      errors.push(issue('implement.tasks.empty', 'implement is done but task results are empty', 'phases.implement.tasks'));
    }

    if (Array.isArray(tasks)) {
      for (const task of tasks.filter((t: any) => t.type === 'implementation' || t.type === 'testing')) {
        const result = taskResults[task.id];
        if (!result) {
          errors.push(issue('implement.task.missing', `${task.id}: missing implementation result`, `phases.implement.tasks.${task.id}`));
          continue;
        }
        if (!TASK_STATUS.has(result.status)) {
          errors.push(issue('implement.task.status.invalid', `${task.id}: invalid task status`, `phases.implement.tasks.${task.id}.status`));
        }
        const nonBlockingSkip = result.status === 'skipped' && result.blocking === false;
        if (result.status !== 'done' && !nonBlockingSkip) {
          errors.push(issue('implement.task.not-done', `${task.id}: task is not done`, `phases.implement.tasks.${task.id}.status`));
        }
        const hasEvidence =
          Array.isArray(result.filesChanged) && result.filesChanged.length > 0 ||
          Array.isArray(result.tests) && result.tests.length > 0 ||
          Array.isArray(result.traceIds) && result.traceIds.length > 0;
        if (result.status === 'done' && !hasEvidence) {
          errors.push(issue('implement.task.evidence.missing', `${task.id}: done task has no evidence`, `phases.implement.tasks.${task.id}`));
        }
      }
    }
  }

  const verify = phases.verify || {};
  if (verify.status === 'done' && !verify.pipelineResult && !state.artifacts?.verificationReport) {
    errors.push(issue('verify.evidence.missing', 'verify is done but no pipeline result or verification report is recorded', 'phases.verify'));
  }
  if (verify.status === 'done' && state.artifacts?.verificationReport && checkFiles && !artifactExists(state.artifacts.verificationReport, cwd)) {
    errors.push(issue('verify.report.not-found', `verification report not found: ${state.artifacts.verificationReport}`, 'artifacts.verificationReport'));
  }

  return { pass: errors.length === 0, errors, warnings };
}
