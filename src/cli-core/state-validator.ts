import {
  validateAcceptance,
  validateFiles,
  validateSpecBoundExecution,
  validateTaskIds,
  validateTaskSchema,
} from './quality-check';

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

const PHASES = ['propose', 'design', 'implement', 'verify', 'archive'] as const;
const PHASE_STATUS = new Set(['pending', 'in-progress', 'done', 'failed']);
const TASK_STATUS = new Set(['pending', 'in-progress', 'done', 'failed', 'skipped']);

function issue(code: string, message: string, path?: string): ValidationIssue {
  return { code, message, path };
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

export function validateState(state: any): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

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

  const design = phases.design || {};
  const tasks = design.tasks || [];
  if (design.status === 'done') {
    if (!design.designDoc) {
      errors.push(issue('design.doc.missing', 'design is done but designDoc is empty', 'phases.design.designDoc'));
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
    warnings.push(issue('verify.evidence.missing', 'verify is done but no pipeline result or verification report is recorded', 'phases.verify'));
  }

  return { pass: errors.length === 0, errors, warnings };
}
