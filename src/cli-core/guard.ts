import { StateManager } from './state';
import {
  validateTaskSchema,
  validateTaskIds,
  validateAcceptance,
  validateFiles,
  validateSpecBoundExecution,
  validateTaskGranularity,
} from './quality-check';
import { validateState } from './state-validator';

export interface GuardFailure {
  label: string;
  errors: string[];
}

export interface GuardResult {
  pass: boolean;
  failures: GuardFailure[];
  warnings?: string[];
}

interface GuardCheck {
  label: string;
  check: (state: any) => boolean | { pass: boolean; errors: string[] };
}

function toFailure(label: string, result: boolean | { pass: boolean; errors: string[] }): GuardFailure | null {
  if (typeof result === 'boolean') {
    return result ? null : { label, errors: [] };
  }
  return result.pass ? null : { label, errors: result.errors };
}

const TRANSITION_RULES: Record<string, GuardCheck[]> = {
  'propose:design': [
    { label: 'Proposal phase is done', check: (s) => s.phases.propose?.status === 'done' },
    {
      label: 'Proposal contract is valid',
      check: (s) => {
        const result = validateState(s, { cwd: process.cwd() });
        const errors = result.errors
          .filter(error =>
            error.path?.startsWith('phases.propose') ||
            error.path === 'activeChange' ||
            error.path === 'artifacts.specDelta'
          )
          .map(error => error.message);
        return { pass: errors.length === 0, errors };
      },
    },
  ],
  'design:implement': [
    { label: 'Design phase is done', check: (s) => s.phases.design?.status === 'done' },
    { label: 'Design document exists', check: (s) => !!s.phases.design?.designDoc },
    {
      label: 'Task list is non-empty',
      check: (s) =>
        Array.isArray(s.phases.design?.tasks) && s.phases.design.tasks.length > 0,
    },
    {
      label: 'All tasks have required fields',
      check: (s) => validateTaskSchema(s.phases.design?.tasks || []),
    },
    {
      label: 'All task IDs are unique kebab-case',
      check: (s) => validateTaskIds(s.phases.design?.tasks || []),
    },
    {
      label: 'All tasks have valid file entries',
      check: (s) => validateFiles(s.phases.design?.tasks || []),
    },
    {
      label: 'All tasks have acceptance criteria',
      check: (s) => validateAcceptance(s.phases.design?.tasks || []),
    },
    {
      label: 'Implementation tasks are spec-bound',
      check: (s) => validateSpecBoundExecution(s.phases.design?.tasks || []),
    },
    {
      label: 'Project context contract is valid',
      check: (s) => {
        const result = validateState(s, { cwd: process.cwd(), requireProjectContext: true });
        const errors = result.errors
          .filter(error =>
            error.path?.startsWith('projectContext') ||
            error.path?.startsWith('phases.design.tasks')
          )
          .map(error => error.message);
        return { pass: errors.length === 0, errors };
      },
    },
  ],
  'implement:verify': [
    { label: 'Implement phase is done', check: (s) => s.phases.implement?.status === 'done' },
    {
      label: 'All tasks completed or ECC (Everything Claude Code) review passed',
      check: (s) => {
        if (s.phases.implement?.eccReviewPassed) return true;
        const tasks: Record<string, any> = s.phases.implement?.tasks || {};
        const entries = Object.values(tasks);
        if (entries.length === 0) return false;
        return entries.every((t: any) =>
          t.status === 'done' || (t.status === 'skipped' && t.blocking !== true)
        );
      },
    },
  ],
  'verify:archive': [
    { label: 'Verify phase is done', check: (s) => s.phases.verify?.status === 'done' },
    {
      label: 'Verification evidence is valid',
      check: (s) => {
        const result = validateState(s, { cwd: process.cwd(), requireProjectContext: Boolean(s.projectContext) });
        const errors = result.errors
          .filter(error =>
            error.path?.startsWith('phases.verify') ||
            error.path === 'artifacts.verificationReport' ||
            error.path?.startsWith('projectContext')
          )
          .map(error => error.message);
        return { pass: errors.length === 0, errors };
      },
    },
  ],
  // Rollback transitions — always allowed
  'implement:design': [
    { label: 'Implement phase has started (rollback)', check: (s) => s.phases.implement?.status !== 'pending' },
  ],
  'verify:implement': [
    { label: 'Verify phase has started (rollback)', check: (s) => s.phases.verify?.status !== 'pending' },
  ],
  'verify:design': [
    { label: 'Verify phase has started (rollback to design)', check: (s) => s.phases.verify?.status !== 'pending' },
  ],
  'design:propose': [
    { label: 'Design phase has started (rollback)', check: (s) => s.phases.design?.status !== 'pending' },
  ],
};

export async function guardPhaseTransition(from: string, to: string): Promise<GuardResult> {
  const state = await StateManager.load();
  const key = `${from}:${to}`;
  const rules = TRANSITION_RULES[key];

  if (!rules) {
    return {
      pass: false,
      failures: [{ label: `Unknown transition: ${from} → ${to}`, errors: [] }],
    };
  }

  const failures: GuardFailure[] = [];
  for (const rule of rules) {
    const result = rule.check(state);
    const failure = toFailure(rule.label, result);
    if (failure) failures.push(failure);
  }

  // Non-blocking granularity check for design→implement
  let warnings: string[] | undefined;
  if (key === 'design:implement') {
    const tasks = state.phases.design?.tasks || [];
    const granResult = validateTaskGranularity(tasks);
    if (granResult.warnings && granResult.warnings.length > 0) {
      warnings = granResult.warnings;
    }
  }

  return { pass: failures.length === 0, failures, warnings };
}

/**
 * Check if a phase can be re-entered from 'done' status.
 * Returns { allowed: true } if the phase is not 'done'.
 * Returns { allowed: false, message } if the phase is 'done' and re-entry needs confirmation.
 */
export async function canReEnterPhase(phase: string): Promise<{ allowed: boolean; message?: string }> {
  const state = await StateManager.load();
  const phaseData = state.phases[phase];

  if (!phaseData || phaseData.status !== 'done') {
    return { allowed: true };
  }

  const completedAt = phaseData.completedAt || 'unknown time';
  return {
    allowed: false,
    message: `Phase '${phase}' is already done (completed at ${completedAt}). Re-entering will reset it to in-progress. Use 'nova iterate ${phase}' or confirm re-entry.`,
  };
}
