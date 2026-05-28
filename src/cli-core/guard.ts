import { StateManager } from './state';

interface GuardCheck {
  label: string;
  check: (state: any) => boolean;
}

const TRANSITION_RULES: Record<string, GuardCheck[]> = {
  'open:design': [
    { label: 'Proposal phase is done', check: (s) => s.phases.open?.status === 'done' },
    { label: 'Proposal document exists', check: (s) => !!s.phases.open?.proposal },
  ],
  'design:build': [
    { label: 'Design phase is done', check: (s) => s.phases.design?.status === 'done' },
    { label: 'Design document exists', check: (s) => !!s.phases.design?.designDoc },
    {
      label: 'Task list is non-empty',
      check: (s) =>
        Array.isArray(s.phases.design?.tasks) && s.phases.design.tasks.length > 0,
    },
  ],
  'build:verify': [
    { label: 'Build phase is done', check: (s) => s.phases.build?.status === 'done' },
    {
      label: 'All tasks completed or ECC review passed',
      check: (s) => {
        if (s.phases.build?.eccReviewPassed) return true;
        const tasks: Record<string, any> = s.phases.build?.tasks || {};
        const entries = Object.values(tasks);
        return entries.length > 0 && entries.every((t: any) => t.status === 'done');
      },
    },
  ],
  'verify:archive': [
    { label: 'Verify phase is done', check: (s) => s.phases.verify?.status === 'done' },
  ],
  // Rollback transitions — always allowed (iteration is expected)
  'build:design': [
    { label: 'Build phase has started (rollback)', check: (s) => s.phases.build?.status !== 'pending' },
  ],
  'verify:build': [
    { label: 'Verify phase has started (rollback)', check: (s) => s.phases.verify?.status !== 'pending' },
  ],
  'verify:design': [
    { label: 'Verify phase has started (rollback to design)', check: (s) => s.phases.verify?.status !== 'pending' },
  ],
  'design:open': [
    { label: 'Design phase has started (rollback)', check: (s) => s.phases.design?.status !== 'pending' },
  ],
};

export async function guardPhaseTransition(from: string, to: string): Promise<boolean> {
  const state = await StateManager.load();
  const key = `${from}:${to}`;
  const rules = TRANSITION_RULES[key];

  if (!rules) {
    return true;
  }

  return rules.every((rule) => rule.check(state));
}
