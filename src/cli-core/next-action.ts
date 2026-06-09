import { StateManager } from './state';
import { guardPhaseTransition } from './guard';
import { ValidationIssue, validateState } from './state-validator';

export type NextPhase = 'propose' | 'design' | 'implement' | 'verify' | 'archive' | 'complete';
export type NextStatus = 'ready' | 'blocked' | 'complete';

export interface NextActionResult {
  phase: NextPhase;
  status: NextStatus;
  command: string;
  reason: string;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

function phaseStatus(state: any, phase: string): string {
  return state.phases?.[phase]?.status || 'pending';
}

function blocked(phase: NextPhase, command: string, reason: string, errors: ValidationIssue[], warnings: ValidationIssue[]): NextActionResult {
  return { phase, status: 'blocked', command, reason, errors, warnings };
}

function ready(phase: NextPhase, command: string, reason: string, warnings: ValidationIssue[] = []): NextActionResult {
  return { phase, status: 'ready', command, reason, errors: [], warnings };
}

export async function getNextAction(): Promise<NextActionResult> {
  const state = await StateManager.load();
  const validation = validateState(state);

  if (phaseStatus(state, 'propose') !== 'done') {
    const proposeErrors = validation.errors.filter(e => e.path?.startsWith('phases.propose') || e.path === 'phases.propose');
    if (proposeErrors.length > 0) {
      return blocked('propose', 'nova validate', 'Proposal phase state is invalid.', proposeErrors, validation.warnings);
    }
    return ready('propose', '/nova-propose', 'Proposal is not complete.', validation.warnings);
  }

  if (phaseStatus(state, 'design') !== 'done') {
    const guard = await guardPhaseTransition('propose', 'design');
    if (!guard.pass) {
      return blocked('design', 'nova guard propose design', 'Cannot enter design until proposal guard passes.', guardFailuresToIssues(guard.failures), validation.warnings);
    }
    return ready('design', '/nova-design', 'Proposal is complete and design is next.', validation.warnings);
  }

  if (phaseStatus(state, 'implement') !== 'done') {
    const guard = await guardPhaseTransition('design', 'implement');
    const guardWarnings = (guard.warnings || []).map((message) => ({ code: 'guard.warning', message }));
    if (!guard.pass) {
      return blocked('implement', 'nova validate', 'Cannot start implementation until design is valid.', guardFailuresToIssues(guard.failures), [...validation.warnings, ...guardWarnings]);
    }
    return ready('implement', '/nova-implement', 'Design is complete and implementation is next.', [...validation.warnings, ...guardWarnings]);
  }

  if (phaseStatus(state, 'verify') !== 'done') {
    const guard = await guardPhaseTransition('implement', 'verify');
    if (!guard.pass) {
      return blocked('verify', 'nova guard implement verify', 'Cannot verify until implementation guard passes.', guardFailuresToIssues(guard.failures), validation.warnings);
    }
    return ready('verify', '/nova-verify', 'Implementation is complete and verification is next.', validation.warnings);
  }

  if (phaseStatus(state, 'archive') !== 'done') {
    const guard = await guardPhaseTransition('verify', 'archive');
    if (!guard.pass) {
      return blocked('archive', 'nova guard verify archive', 'Cannot archive until verification guard passes.', guardFailuresToIssues(guard.failures), validation.warnings);
    }
    return ready('archive', '/nova-archive', 'Verification is complete and archive is next.', validation.warnings);
  }

  return {
    phase: 'complete',
    status: 'complete',
    command: '',
    reason: 'All workflow phases are complete.',
    errors: [],
    warnings: validation.warnings,
  };
}

function guardFailuresToIssues(failures: Array<{ label: string; errors: string[] }>): ValidationIssue[] {
  return failures.flatMap((failure) => {
    if (failure.errors.length === 0) {
      return [{ code: 'guard.failed', message: failure.label }];
    }
    return failure.errors.map((message) => ({
      code: 'guard.failed',
      message: `${failure.label}: ${message}`,
    }));
  });
}
