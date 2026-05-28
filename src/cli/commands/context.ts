import { ui } from '../ui';
import { StateManager } from '../../cli-core/state';
import { ContextGenerator } from '../../cli-core/context-generator';
import { withErrorHandling } from '../error-handler';

export const contextCommand = withErrorHandling(async (options: { taskId?: string }) => {
  if (!options.taskId) {
    ui.error('--task-id is required.');
    process.exit(1);
  }

  const state = await StateManager.load();
  const tasks: any[] = state.phases.design?.tasks || [];
  const task = tasks.find((t) => t.id === options.taskId);

  if (!task) {
    ui.error(`Task "${options.taskId}" not found in design phase.`);
    process.exit(1);
  }

  const context = await ContextGenerator.generateFromTask(task);
  console.log(JSON.stringify(context, null, 2));
});
