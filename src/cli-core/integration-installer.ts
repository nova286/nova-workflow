import * as fs from 'fs/promises';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import inquirer from 'inquirer';
import { ui } from '../cli/ui';
import { DetectResult, ToolDetection, detectNovaEnvironment } from './detect';

const execFileAsync = promisify(execFile);

export interface IntegrationInstallerOptions {
  cwd: string;
  agent?: string;
  homeDir?: string;
  tools: ToolDetection[];
  envs?: string[];
  interactive?: boolean;
  skillsDir?: 'project' | 'user';
  commandExists?: (cmd: string) => Promise<boolean>;
}

export interface IntegrationInstallAction {
  id: string;
  label: string;
  toolId: string;
  run: () => Promise<void>;
}

export async function assistRecommendedIntegrationInstall(options: IntegrationInstallerOptions): Promise<DetectResult | null> {
  const actions = recommendedInstallActions(options);
  if (actions.length === 0) {
    const missingManual = options.tools.filter(tool =>
      tool.category === 'recommended' &&
      tool.status !== 'available' &&
      tool.install
    );
    if (missingManual.length > 0) {
      ui.info('  Some recommended integrations need manual setup; see install guidance above.');
      for (const tool of missingManual) {
        ui.info(`  ${tool.name}: ${tool.install}`);
      }
    }
    return null;
  }

  if (options.interactive !== false && (!process.stdin.isTTY || !process.stdout.isTTY)) {
    ui.info('  Recommended integrations can be installed later with the guidance above.');
    return null;
  }

  const selected = options.interactive === false
    ? actions.map(action => action.id)
    : await promptInstallActions(actions);
  if (selected.length === 0) return null;

  for (const action of actions) {
    if (!selected.includes(action.id)) continue;
    ui.info(`  Installing ${action.label}`);
    await action.run();
  }

  return detectNovaEnvironment({
    cwd: options.cwd,
    homeDir: options.homeDir,
    agent: options.agent,
    env: {},
    commandExists: options.commandExists,
  });
}

export function recommendedInstallActions(options: IntegrationInstallerOptions): IntegrationInstallAction[] {
  const actions: IntegrationInstallAction[] = [];
  const tool = (id: string) => options.tools.find(item => item.id === id);
  const needsInstall = (id: string) => {
    const found = tool(id);
    return Boolean(found && found.category === 'recommended' && found.status !== 'available');
  };

  if (needsInstall('openspec')) {
    actions.push({
      id: 'openspec',
      toolId: 'openspec',
      label: 'OpenSpec (npm install -g @fission-ai/openspec@latest && openspec init)',
      run: async () => {
        await execFileAsync('npm', ['install', '-g', '@fission-ai/openspec@latest'], { cwd: options.cwd });
        await execFileAsync('openspec', ['init'], { cwd: options.cwd });
      },
    });
  }

  const installableAgents = installableUiUxAgents(options);
  if (needsInstall('ui-ux-pro-max') && installableAgents.length > 0) {
    for (const agent of installableAgents) {
      const ai = agent === 'claude-code' ? 'claude' : 'codex';
      actions.push({
        id: `ui-ux-pro-max:${agent}`,
        toolId: 'ui-ux-pro-max',
        label: `UI UX Pro Max for ${agent} (npx uipro-cli init --ai ${ai})`,
        run: async () => {
          await execFileAsync('npx', ['uipro-cli', 'init', '--ai', ai], { cwd: options.cwd });
          await relocateProjectUiUxSkillIfNeeded(options, agent);
        },
      });
    }
  }

  if (needsInstall('ecc')) {
    actions.push({
      id: 'ecc',
      toolId: 'ecc',
      label: 'ECC (npm install -g ecc-universal && ecc-install typescript)',
      run: async () => {
        await execFileAsync('npm', ['install', '-g', 'ecc-universal'], { cwd: options.cwd });
        await execFileAsync('ecc-install', ['typescript'], { cwd: options.cwd });
      },
    });
  }

  return actions;
}

async function promptInstallActions(actions: IntegrationInstallAction[]): Promise<string[]> {
  const { integrations } = await inquirer.prompt([{
    type: 'checkbox',
    name: 'integrations',
    message: 'Install recommended integrations now?',
    choices: actions.map(action => ({
      name: action.label,
      value: action.id,
      checked: true,
    })),
    default: actions.map(action => action.id),
  }]);
  return Array.isArray(integrations) ? integrations : [];
}

function installableUiUxAgents(options: IntegrationInstallerOptions): string[] {
  const envs = options.envs && options.envs.length > 0
    ? options.envs
    : options.agent
    ? [options.agent]
    : [];
  return envs.filter(env => ['claude-code', 'codex'].includes(env));
}

export async function relocateProjectUiUxSkillIfNeeded(options: IntegrationInstallerOptions, agent: string): Promise<void> {
  if (options.skillsDir !== 'user') return;

  const homeDir = options.homeDir ?? process.env.HOME ?? '';
  if (!homeDir) return;

  const sourceRoot = agent === 'claude-code'
    ? path.join(options.cwd, '.claude', 'skills')
    : agent === 'codex'
    ? path.join(options.cwd, '.codex', 'skills')
    : null;
  const destRoot = agent === 'claude-code'
    ? path.join(homeDir, '.claude', 'skills')
    : agent === 'codex'
    ? path.join(homeDir, '.codex', 'skills')
    : null;
  if (!sourceRoot || !destRoot) return;

  const source = path.join(sourceRoot, 'ui-ux-pro-max');
  const dest = path.join(destRoot, 'ui-ux-pro-max');
  if (!await pathExists(source)) return;

  if (await pathExists(dest)) {
    ui.info(`  UI UX Pro Max already exists at ${displayHomePath(dest, homeDir)}; leaving project copy at ${path.relative(options.cwd, source)}`);
    return;
  }

  await fs.mkdir(destRoot, { recursive: true });
  try {
    await fs.rename(source, dest);
  } catch (err: any) {
    if (err?.code !== 'EXDEV') throw err;
    await fs.cp(source, dest, { recursive: true });
    await fs.rm(source, { recursive: true, force: true });
  }
  ui.info(`  Moved UI UX Pro Max to ${displayHomePath(dest, homeDir)}`);
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function displayHomePath(filePath: string, homeDir: string): string {
  return filePath.startsWith(homeDir) ? `~${filePath.slice(homeDir.length)}` : filePath;
}
