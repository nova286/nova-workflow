import { ui } from '../ui';
import { InitManager } from '../../cli-core/init-manager';
import { withErrorHandling } from '../error-handler';

export const initCommand = withErrorHandling(async (options: { withEcc?: string; force?: boolean }) => {
  ui.step('Welcome to Nova! Initializing your project...');
  const manager = new InitManager(process.cwd(), {
    eccPath: options.withEcc,
    force: options.force
  });
  try {
    await manager.run();
    ui.success('Nova initialized successfully!');
  } catch (err: any) {
    ui.error(`Initialization failed: ${err.message}`);
    process.exit(1);
  }
});
