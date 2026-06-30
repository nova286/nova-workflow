import { ui } from '../ui';
import { StateManager } from '../../cli-core/state';
import { withErrorHandling } from '../error-handler';

const PHASE_ORDER = ['propose', 'design', 'implement', 'verify', 'archive'] as const;
type PhaseName = typeof PHASE_ORDER[number];

interface StatusCommandOptions {
  json?: boolean;
}

interface PhaseStatusSummary {
  status: string;
  duration?: string;
  tasks?: {
    done: number;
    total: number;
  };
}

interface ProjectStatusSummary {
  project: string;
  environment: string[];
  phases: Record<PhaseName, PhaseStatusSummary>;
  warnings: Array<{ phase: PhaseName; message: string }>;
}

const PHASE_LABEL: Record<string, string> = {
  propose: 'propose',
  design: 'design',
  implement: 'implement',
  verify: 'verify',
  archive: 'archive',
};

const STATUS_ICON: Record<string, string> = {
  done: '✅',
  'in-progress': '🔄',
  pending: '⬜',
};

// 超时阈值（毫秒）
const STUCK_THRESHOLDS: Record<string, number> = {
  propose: 30 * 60 * 1000,     // 30 min
  design: 60 * 60 * 1000,    // 1 hour
  implement: 120 * 60 * 1000,    // 2 hours
  verify: 30 * 60 * 1000,    // 30 min
  archive: 15 * 60 * 1000,   // 15 min
};

const STUCK_MESSAGE: Record<string, string> = {
  propose: 'Proposal has been in progress for a while. Consider running "nova propose --done" or "--rollback".',
  design: 'Design has been in progress for a while. Consider running "nova design --done" or "--rollback".',
  implement: 'Implementation has been in progress for a while. Check task status and consider "--rollback" if stuck.',
  verify: 'Verification has been in progress for a while. Consider running "nova verify --rollback" if needed.',
  archive: 'Archive has been in progress. Run "nova archive --done" to finish or "--rollback" to reset.',
};

function buildStatusSummary(state: any): ProjectStatusSummary {
  const warnings: ProjectStatusSummary['warnings'] = [];
  const phases = {} as Record<PhaseName, PhaseStatusSummary>;

  for (const phase of PHASE_ORDER) {
    const data = state.phases[phase] || {};
    const status: string = data.status || 'pending';
    const summary: PhaseStatusSummary = { status };

    const duration = StateManager.getPhaseDuration(data);
    if (duration) summary.duration = duration;

    if (phase === 'implement' && data.tasks) {
      const entries = Object.entries(data.tasks) as [string, any][];
      const done = entries.filter(([, task]) => task.status === 'done').length;
      summary.tasks = { done, total: entries.length };
    }

    if (status === 'in-progress' && data.startedAt) {
      const elapsed = Date.now() - new Date(data.startedAt).getTime();
      const threshold = STUCK_THRESHOLDS[phase] || 60 * 60 * 1000;
      if (elapsed > threshold) {
        warnings.push({ phase, message: STUCK_MESSAGE[phase] });
      }
    }

    phases[phase] = summary;
  }

  return {
    project: state.project,
    environment: Array.isArray(state.environment) ? state.environment : [],
    phases,
    warnings,
  };
}

export const statusCommand = withErrorHandling(async (options: StatusCommandOptions = {}) => {
  const state = await StateManager.load();
  const summary = buildStatusSummary(state);

  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  ui.step(`Project: ${summary.project}`);
  ui.info(`Environment: ${summary.environment.join(', ') || '(none)'}`);
  ui.info('');

  for (const phase of PHASE_ORDER) {
    const data = summary.phases[phase];
    const status = data.status;
    const icon = STATUS_ICON[status] || '⬜';
    const label = PHASE_LABEL[phase] || phase;
    const extra: string[] = [];

    if (data.duration) extra.push(data.duration);

    if (data.tasks) {
      extra.push(`tasks: ${data.tasks.done}/${data.tasks.total} done`);
    }

    ui.info(`  ${icon} ${label}: ${status}${extra.length ? ` (${extra.join(', ')})` : ''}`);
  }

  if (summary.warnings.length > 0) {
    ui.warn('');
    for (const warning of summary.warnings) {
      const label = PHASE_LABEL[warning.phase] || warning.phase;
      ui.warn(`${label}: ${warning.message}`);
    }
  }
});
