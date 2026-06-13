import { detectNovaEnvironment, ToolDetection } from '../../cli-core/detect';
import { assistRecommendedIntegrationInstall } from '../../cli-core/integration-installer';
import { ui } from '../ui';
import { withErrorHandling } from '../error-handler';

export const detectCommand = withErrorHandling(async (options: { json?: boolean; agent?: string; install?: boolean } = {}) => {
  let result = await detectNovaEnvironment({ agent: options.agent });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printDetectResult(result);

    if (options.install) {
      ui.info('');
      ui.step('Install Recommended Integrations');
      const updated = await assistRecommendedIntegrationInstall({
        cwd: process.cwd(),
        agent: options.agent,
        tools: result.tools,
      });
      if (updated) {
        result = updated;
        ui.success('Install Recommended Integrations');
        ui.info('');
        printDetectResult(result);
      } else {
        ui.success('Install Recommended Integrations');
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

function printDetectResult(result: Awaited<ReturnType<typeof detectNovaEnvironment>>) {
  ui.step('Nova Environment Detection');
  ui.info('');
  ui.info(`Active Agent: ${result.agent.active.name} (${result.agent.active.source})`);
  ui.info(`  ${result.agent.active.summary}`);
  if (result.agent.configured.length > 0) {
    ui.info(`Configured agents: ${result.agent.configured.join(', ')}`);
  }
  const availableAgents = result.agent.available.filter(agent => agent.available);
  if (availableAgents.length > 0) {
    ui.info(`Available agent CLIs: ${availableAgents.map(agent => agent.id).join(', ')}`);
  }
  for (const category of ['required', 'recommended', 'optional'] as const) {
    const tools = result.tools.filter(tool => tool.category === category);
    ui.info('');
    ui.info(categoryLabel(category));
    for (const tool of tools) {
      printTool(tool);
    }
  }
}

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
