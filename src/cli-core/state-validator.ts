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
  requireProjectContext?: boolean;
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

function resolveChangeMode(state: any) {
  return state.phases?.propose?.changeMode || state.changeMode || state.artifacts?.changeMode;
}

function resolveLegacyPreflight(state: any) {
  return state.phases?.design?.legacyPreflight || state.legacyPreflight || state.artifacts?.legacyPreflight;
}

function isValidChangeMode(value: unknown): boolean {
  return value === 'existing' || value === 'incremental' || value === 'new';
}

function isValidRefactorPolicy(value: unknown): boolean {
  return value === 'none' || value === 'minimal' || value === 'full';
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

function validateChangeModeAndLegacyPreflight(state: any, errors: ValidationIssue[]) {
  const changeMode = resolveChangeMode(state);
  if (state.phases?.propose?.status === 'done' && !changeMode) {
    errors.push(issue('change-mode.missing', 'propose is done but changeMode is missing', 'phases.propose.changeMode'));
    return;
  }
  if (changeMode && !isValidChangeMode(changeMode)) {
    errors.push(issue('change-mode.invalid', 'changeMode must be one of existing, incremental, new', 'phases.propose.changeMode'));
    return;
  }

  if (changeMode !== 'existing' || state.phases?.design?.status !== 'done') return;

  const preflight = resolveLegacyPreflight(state);
  if (!preflight) {
    errors.push(issue('legacy-preflight.missing', 'existing change requires legacyPreflight before design is done', 'phases.design.legacyPreflight'));
    return;
  }
  if (typeof preflight !== 'object' || Array.isArray(preflight)) {
    errors.push(issue('legacy-preflight.invalid', 'legacyPreflight must be an object', 'phases.design.legacyPreflight'));
    return;
  }
  if (preflight.required !== true) {
    errors.push(issue('legacy-preflight.invalid', 'legacyPreflight.required must be true for existing changes', 'phases.design.legacyPreflight.required'));
  }
  if (preflight.performed !== true) {
    errors.push(issue('legacy-preflight.not-performed', 'legacy preflight must be performed before design is done', 'phases.design.legacyPreflight.performed'));
  }
  if (!Array.isArray(preflight.affectedAreas) || preflight.affectedAreas.length === 0) {
    errors.push(issue('legacy-preflight.areas.missing', 'legacyPreflight must record affectedAreas', 'phases.design.legacyPreflight.affectedAreas'));
  }
  if (typeof preflight.hasIssues !== 'boolean') {
    errors.push(issue('legacy-preflight.invalid', 'legacyPreflight.hasIssues must be a boolean', 'phases.design.legacyPreflight.hasIssues'));
    return;
  }
  if (preflight.hasIssues === true) {
    if (!Array.isArray(preflight.issues) || preflight.issues.length === 0) {
      errors.push(issue('legacy-preflight.issues.missing', 'legacy preflight found issues but no issues are recorded', 'phases.design.legacyPreflight.issues'));
    }
    if (!isValidRefactorPolicy(preflight.refactorPolicy)) {
      errors.push(issue('legacy-preflight.refactor-policy.missing', 'legacy preflight found issues but refactorPolicy is missing or invalid', 'phases.design.legacyPreflight.refactorPolicy'));
    }
    if (!hasText(preflight.userDecision)) {
      errors.push(issue('legacy-preflight.user-decision.missing', 'legacy preflight found issues but userDecision is missing', 'phases.design.legacyPreflight.userDecision'));
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

function hasStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function validateProjectContextContract(contract: any, errors: ValidationIssue[]) {
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) {
    errors.push(issue('project-context.missing', 'projectContext contract is missing', 'projectContext'));
    return;
  }

  if (!contract.rules || typeof contract.rules !== 'object' || Array.isArray(contract.rules)) {
    errors.push(issue('project-context.rules.missing', 'projectContext.rules is missing', 'projectContext.rules'));
  } else {
    for (const field of ['sources', 'must', 'mustNot', 'verificationCommands']) {
      if (!hasStringArray(contract.rules[field])) {
        errors.push(issue('project-context.rules.invalid', `projectContext.rules.${field} must be a string array`, `projectContext.rules.${field}`));
      }
    }
    if (hasStringArray(contract.rules.sources) && contract.rules.sources.length === 0) {
      errors.push(issue('project-context.rules.sources.empty', 'projectContext.rules.sources must record at least one source', 'projectContext.rules.sources'));
    }
  }

  if (!contract.bestPractices || typeof contract.bestPractices !== 'object' || Array.isArray(contract.bestPractices)) {
    errors.push(issue('project-context.best-practices.missing', 'projectContext.bestPractices is missing', 'projectContext.bestPractices'));
  } else {
    if (!hasText(contract.bestPractices.projectType)) {
      errors.push(issue('project-context.best-practices.project-type.missing', 'projectContext.bestPractices.projectType is missing', 'projectContext.bestPractices.projectType'));
    }
    for (const field of ['sources', 'must', 'should', 'risks']) {
      if (!hasStringArray(contract.bestPractices[field])) {
        errors.push(issue('project-context.best-practices.invalid', `projectContext.bestPractices.${field} must be a string array`, `projectContext.bestPractices.${field}`));
      }
    }
    if (hasStringArray(contract.bestPractices.sources) && contract.bestPractices.sources.length === 0) {
      errors.push(issue('project-context.best-practices.sources.empty', 'projectContext.bestPractices.sources must record at least one source', 'projectContext.bestPractices.sources'));
    }
  }

  if (contract.conflicts !== undefined) {
    if (!Array.isArray(contract.conflicts)) {
      errors.push(issue('project-context.conflicts.invalid', 'projectContext.conflicts must be an array', 'projectContext.conflicts'));
      return;
    }
    contract.conflicts.forEach((conflict: any, index: number) => {
      const base = `projectContext.conflicts.${index}`;
      if (!conflict || typeof conflict !== 'object' || Array.isArray(conflict)) {
        errors.push(issue('project-context.conflict.invalid', 'projectContext conflict must be an object', base));
        return;
      }
      for (const field of ['projectRule', 'bestPractice', 'resolution', 'rationale']) {
        if (!hasText(conflict[field])) {
          errors.push(issue('project-context.conflict.invalid', `projectContext conflict is missing ${field}`, `${base}.${field}`));
        }
      }
    });
  }
}

function taskTouchesImplementationSurface(task: any): boolean {
  return (task.type === 'implementation' || task.type === 'testing') &&
    Array.isArray(task.files) &&
    task.files.length > 0;
}

function validateTaskComplianceRefs(tasks: any[], errors: ValidationIssue[]) {
  tasks.forEach((task, index) => {
    if (!taskTouchesImplementationSurface(task)) return;
    const refs = task.complianceRefs;
    const hasProjectRules = hasStringArray(refs?.projectRules) && refs.projectRules.length > 0;
    const hasBestPractices = hasStringArray(refs?.bestPractices) && refs.bestPractices.length > 0;
    if (!hasProjectRules || !hasBestPractices) {
      errors.push(issue(
        'task.compliance-refs.missing',
        `${task.id || `task ${index + 1}`}: implementation/testing task must reference project rules and best practices`,
        `phases.design.tasks.${index}.complianceRefs`
      ));
    }
  });
}

function validDeviationRationale(deviation: any): boolean {
  return deviation &&
    typeof deviation === 'object' &&
    !Array.isArray(deviation) &&
    hasText(deviation.ref) &&
    hasText(deviation.reason);
}

function hasComplianceEvidence(result: any): boolean {
  const compliance = result?.compliance;
  if (!compliance || typeof compliance !== 'object' || Array.isArray(compliance)) return false;
  if (hasStringArray(compliance.followed) && compliance.followed.length > 0) return true;
  if (Array.isArray(compliance.deviations) && compliance.deviations.length > 0) {
    return compliance.deviations.every(validDeviationRationale);
  }
  return hasText(compliance.noOpRationale);
}

function validateImplementCompliance(tasks: any[], taskResults: Record<string, any>, errors: ValidationIssue[]) {
  for (const task of tasks.filter(taskTouchesImplementationSurface)) {
    const result = taskResults[task.id];
    if (result?.status === 'done' && !hasComplianceEvidence(result)) {
      errors.push(issue(
        'implement.task.compliance.missing',
        `${task.id}: done task must record compliance evidence or a no-op rationale`,
        `phases.implement.tasks.${task.id}.compliance`
      ));
    }
  }
}

function normalizeVerdict(verdict: unknown): { status?: string; deviations: any[] } {
  if (typeof verdict === 'string') return { status: verdict, deviations: [] };
  if (verdict && typeof verdict === 'object' && !Array.isArray(verdict)) {
    const value = verdict as any;
    return {
      status: value.status,
      deviations: Array.isArray(value.deviations) ? value.deviations : [],
    };
  }
  return { deviations: [] };
}

function validateComplianceVerdict(verdict: unknown, label: string, path: string, errors: ValidationIssue[]) {
  if (verdict === undefined || verdict === null) {
    errors.push(issue('verify.compliance-verdict.missing', `verify is done but ${label} verdict is missing`, path));
    return;
  }
  const normalized = normalizeVerdict(verdict);
  if (normalized.status !== 'PASS') {
    errors.push(issue('verify.compliance-verdict.failed', `${label} verdict must be PASS before verify can be marked done`, path));
  }
  for (const [index, deviation] of normalized.deviations.entries()) {
    if (!validDeviationRationale(deviation) || deviation.accepted !== true) {
      errors.push(issue(
        'verify.compliance-deviation.unaccepted',
        `${label} deviation ${index + 1} must include an accepted rationale`,
        `${path}.deviations.${index}`
      ));
    }
  }
}

function validateReviewIndependence(review: any, errors: ValidationIssue[]) {
  if (!review || typeof review !== 'object' || Array.isArray(review)) {
    errors.push(issue('verify.review-independence.missing', 'verify is done but reviewIndependence is missing', 'phases.verify.reviewIndependence'));
    return;
  }

  if (review.mode !== 'subagent' && review.mode !== 'fresh-context' && review.mode !== 'same-session-fallback') {
    errors.push(issue(
      'verify.review-independence.invalid',
      'reviewIndependence.mode must be subagent, fresh-context, or same-session-fallback',
      'phases.verify.reviewIndependence.mode'
    ));
    return;
  }

  if (review.mode === 'same-session-fallback' && !hasText(review.rationale)) {
    errors.push(issue(
      'verify.review-independence.rationale.missing',
      'same-session-fallback review requires a rationale explaining why independent review was unavailable',
      'phases.verify.reviewIndependence.rationale'
    ));
  }
}

function validateVerificationCommands(requiredCommands: unknown, commandResults: any, errors: ValidationIssue[]) {
  const required = Array.isArray(requiredCommands)
    ? requiredCommands.filter((command): command is string => hasText(command))
    : [];
  if (required.length === 0) return;

  if (!Array.isArray(commandResults) || commandResults.length === 0) {
    errors.push(issue(
      'verify.commands.missing',
      'verify is done but required verification command results are missing',
      'phases.verify.verificationCommands'
    ));
    return;
  }

  const byCommand = new Map<string, any>();
  commandResults.forEach((result: any, index: number) => {
    const base = `phases.verify.verificationCommands.${index}`;
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      errors.push(issue('verify.commands.invalid', 'verification command result must be an object', base));
      return;
    }
    if (!hasText(result.command)) {
      errors.push(issue('verify.commands.invalid', 'verification command result is missing command', `${base}.command`));
      return;
    }
    if (result.status !== 'PASS' && result.status !== 'FAIL' && result.status !== 'SKIPPED') {
      errors.push(issue('verify.commands.invalid', `${result.command}: status must be PASS, FAIL, or SKIPPED`, `${base}.status`));
    }
    if (result.status === 'SKIPPED' && !hasText(result.rationale)) {
      errors.push(issue('verify.commands.skip-rationale.missing', `${result.command}: skipped verification command requires rationale`, `${base}.rationale`));
    }
    byCommand.set(result.command, result);
  });

  for (const command of required) {
    const result = byCommand.get(command);
    if (!result) {
      errors.push(issue('verify.commands.required.missing', `${command}: required verification command result is missing`, 'phases.verify.verificationCommands'));
      continue;
    }
    if (result.status !== 'PASS') {
      errors.push(issue('verify.commands.failed', `${command}: required verification command must PASS before verify can be marked done`, 'phases.verify.verificationCommands'));
    }
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
  validateChangeModeAndLegacyPreflight(state, errors);
  if (state.projectContext || options.requireProjectContext) {
    validateProjectContextContract(state.projectContext, errors);
  }

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
    if (state.projectContext || options.requireProjectContext) {
      validateTaskComplianceRefs(tasks, errors);
    }
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
      if (state.projectContext) {
        validateImplementCompliance(tasks, taskResults, errors);
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
  if (verify.status === 'done' && state.projectContext) {
    const projectRulesVerdict = verify.projectRulesVerdict ?? verify.pipelineResult?.projectRulesVerdict;
    const bestPracticesVerdict = verify.bestPracticesVerdict ?? verify.pipelineResult?.bestPracticesVerdict;
    const verificationCommands = verify.verificationCommands ?? verify.pipelineResult?.verificationCommands;
    validateComplianceVerdict(projectRulesVerdict, 'projectRulesVerdict', 'phases.verify.projectRulesVerdict', errors);
    validateComplianceVerdict(bestPracticesVerdict, 'bestPracticesVerdict', 'phases.verify.bestPracticesVerdict', errors);
    validateReviewIndependence(verify.reviewIndependence ?? verify.pipelineResult?.reviewIndependence, errors);
    validateVerificationCommands(state.projectContext.rules?.verificationCommands, verificationCommands, errors);
  }

  return { pass: errors.length === 0, errors, warnings };
}
