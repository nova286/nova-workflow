import { ui } from '../ui';
import { guardPhaseTransition } from '../../cli-core/guard';
import { withErrorHandling } from '../error-handler';

export const guardCommand = withErrorHandling(async (from: string, to: string) => {
  if (!from || !to) {
    ui.error('Usage: nova guard <from> <to>');
    process.exit(1);
  }

  const result = await guardPhaseTransition(from, to);
  if (result.pass) {
    ui.success(`Guard passed: ${from} → ${to}`);
  } else {
    ui.error(`Guard failed: ${from} → ${to}`);
    for (const f of result.failures) {
      if (f.errors.length > 0) {
        for (const e of f.errors) {
          ui.info(`  ✗ ${e}`);
        }
      } else {
        ui.info(`  ✗ ${f.label}`);
      }
    }
    process.exit(1);
  }
});
