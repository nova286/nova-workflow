import { StateManager } from './state';
import {
  validateTaskSchema,
  validateTaskIds,
  validateAcceptance,
  validateFiles,
  validateSpecBoundExecution,
} from './quality-check';

export interface GuardFailure {
  label: string;
  errors: string[];
}

export interface GuardResult {
  pass: boolean;
  failures: GuardFailure[];
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
    { label: 'Proposal document exists', check: (s) => !!s.phases.propose?.proposal },
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
  ],
  'implement:verify': [
    { label: 'Implement phase is done', check: (s) => s.phases.implement?.status === 'done' },
    {
      label: 'All tasks completed or ECC review passed',
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
    return { pass: true, failures: [] };
  }

  const failures: GuardFailure[] = [];
  for (const rule of rules) {
    const result = rule.check(state);
    const failure = toFailure(rule.label, result);
    if (failure) failures.push(failure);
  }

  return { pass: failures.length === 0, failures };
}
