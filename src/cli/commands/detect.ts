import { detectNovaEnvironment, ToolDetection } from '../../cli-core/detect';
import { ui } from '../ui';
import { withErrorHandling } from '../error-handler';

export const detectCommand = withErrorHandling(async (options: { json?: boolean } = {}) => {
  const result = await detectNovaEnvironment();

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    ui.step('Nova Environment Detection');
    for (const category of ['required', 'recommended', 'optional'] as const) {
      const tools = result.tools.filter(tool => tool.category === category);
      ui.info('');
      ui.info(categoryLabel(category));
      for (const tool of tools) {
        printTool(tool);
      }
    }

    const missingRecommended = result.tools.filter(t => t.category === 'recommended' && t.status !== 'available');
    const missingOptional = result.tools.filter(t => t.category === 'optional' && t.status !== 'available');

    if (missingRecommended.length > 0) {
      ui.warn('');
      ui.warn('Recommended tools are missing. Nova will still run in compatible mode.');
    }
    if (missingOptional.length > 0) {
      ui.info('');
      ui.info('Optional integrations can be installed later when needed.');
    }
  }

  if (!result.pass) process.exit(1);
});

function categoryLabel(category: ToolDetection['category']): string {
  switch (category) {
    case 'required':
      return 'Required';
    case 'recommended':
      return 'Recommended';
    case 'optional':
      return 'Optional';
  }
}

function printTool(tool: ToolDetection) {
  const marker =
    tool.status === 'available'
      ? 'available'
      : tool.status === 'partial'
      ? 'partial'
      : 'missing';
  ui.info(`  ${tool.name}: ${marker} - ${tool.summary}`);
  if (tool.status !== 'available' && tool.install) {
    ui.info(`    Install: ${tool.install}`);
  }
}
