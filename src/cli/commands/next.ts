import { ui } from '../ui';
import { getNextAction } from '../../cli-core/next-action';
import { withErrorHandling } from '../error-handler';

export const nextCommand = withErrorHandling(async (options: { json?: boolean } = {}) => {
  const result = await getNextAction();

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    ui.step(`Current: ${result.phase}`);
    if (result.status === 'complete') {
      ui.success(result.reason);
    } else if (result.status === 'blocked') {
      ui.error(`Blocked: ${result.reason}`);
      ui.info(`Run: ${result.command}`);
    } else {
      ui.success(`Next: ${result.command}`);
      ui.info(result.reason);
    }

    for (const error of result.errors) {
      ui.info(`  ${error.code}: ${error.message}${error.path ? ` (${error.path})` : ''}`);
    }
    for (const warning of result.warnings) {
      ui.warn(`${warning.code}: ${warning.message}`);
    }
  }

  if (result.status === 'blocked') process.exit(1);
});
