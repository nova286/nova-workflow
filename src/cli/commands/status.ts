import { ui } from '../ui';
import { StateManager } from '../../cli-core/state';
import { withErrorHandling } from '../error-handler';

const PHASE_ORDER = ['propose', 'design', 'implement', 'verify', 'archive'] as const;

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

export const statusCommand = withErrorHandling(async () => {
  const state = await StateManager.load();

  ui.step(`Project: ${state.project}`);
  ui.info(`Environment: ${state.environment.join(', ') || '(none)'}`);
  ui.info('');

  const warnings: string[] = [];

  for (const phase of PHASE_ORDER) {
    const data = state.phases[phase] || {};
    const status: string = data.status || 'pending';
    const icon = STATUS_ICON[status] || '⬜';
    const label = PHASE_LABEL[phase] || phase;
    const extra: string[] = [];

    // 耗时统计
    const duration = StateManager.getPhaseDuration(data);
    if (duration) extra.push(duration);

    if (phase === 'implement' && data.tasks) {
      const entries = Object.entries(data.tasks) as [string, any][];
      const done = entries.filter(([, t]) => t.status === 'done').length;
      extra.push(`tasks: ${done}/${entries.length} done`);
    }

    ui.info(`  ${icon} ${label}: ${status}${extra.length ? ` (${extra.join(', ')})` : ''}`);

    // 卡住检测
    if (status === 'in-progress' && data.startedAt) {
      const elapsed = Date.now() - new Date(data.startedAt).getTime();
      const threshold = STUCK_THRESHOLDS[phase] || 60 * 60 * 1000;
      if (elapsed > threshold) {
        warnings.push(`${label}: ${STUCK_MESSAGE[phase]}`);
      }
    }
  }

  if (warnings.length > 0) {
    ui.warn('');
    for (const w of warnings) ui.warn(w);
  }
});
