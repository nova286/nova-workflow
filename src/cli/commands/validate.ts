import { ui } from '../ui';
import { StateManager } from '../../cli-core/state';
import { validateState } from '../../cli-core/state-validator';
import { withErrorHandling } from '../error-handler';

export const validateCommand = withErrorHandling(async (options: { json?: boolean }) => {
  const state = await StateManager.load();
  const result = validateState(state);

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.pass) {
    ui.success('Nova state is valid.');
    for (const warning of result.warnings) {
      ui.warn(`${warning.code}: ${warning.message}`);
    }
  } else {
    ui.error('Nova state is invalid.');
    for (const error of result.errors) {
      ui.info(`  ${error.code}: ${error.message}${error.path ? ` (${error.path})` : ''}`);
    }
    for (const warning of result.warnings) {
      ui.warn(`${warning.code}: ${warning.message}`);
    }
  }

  if (!result.pass) process.exit(1);
});
