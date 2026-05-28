import { ui } from '../ui';
import { guardPhaseTransition } from '../../cli-core/guard';
import { withErrorHandling } from '../error-handler';

export const guardCommand = withErrorHandling(async (from: string, to: string) => {
  if (!from || !to) {
    ui.error('Usage: nova guard <from> <to>');
    process.exit(1);
  }

  const passed = await guardPhaseTransition(from, to);
  if (passed) {
    ui.success(`Guard passed: ${from} → ${to}`);
  } else {
    ui.error(`Guard failed: ${from} → ${to}`);
    process.exit(1);
  }
});
