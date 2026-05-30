import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { execFile } from 'child_process';
import * as yaml from 'yaml';
import inquirer from 'inquirer';
import { ui } from '../cli/ui';
import { EnvironmentAdapter, AdapterSetupOptions, McpServers } from './types';
import { detectProjectType } from './project-detect';
import { ClaudeCodeAdapter } from './adapters/claude-code';
import { CodexAdapter } from './adapters/codex';
import { OpenClawAdapter } from './adapters/openclaw';
import { HermesAgentAdapter } from './adapters/hermes-agent';
import { OpenCodeAdapter } from './adapters/opencode';

const ADAPTER_FACTORIES: Record<string, () => EnvironmentAdapter> = {
  'claude-code': () => new ClaudeCodeAdapter(),
  'codex': () => new CodexAdapter(),
  'openclaw': () => new OpenClawAdapter(),
  'hermes-agent': () => new HermesAgentAdapter(),
  'opencode': () => new OpenCodeAdapter(),
};

export class InitManager {
  private cwd: string;
  private options: { eccPath?: string; force?: boolean; skillsDir?: 'project' | 'user' };
  private backupDir?: string;
  private resolvedSkillsDir?: 'project' | 'user';
  private steps: Array<{ name: string; run: () => Promise<void>; rollback: () => Promise<void> }> = [];

  constructor(cwd: string, opts: { eccPath?: string; force?: boolean; skillsDir?: 'project' | 'user' }) {
    this.cwd = cwd;
    this.options = opts;
  }

  async run() {
    if (await this.isInitialized() && !this.options.force) {
      throw new Error('Nova already initialized. Use --force to reinitialize.');
    }
    if (await this.isInitialized()) await this.backup();

    const envs = await this.detectAIEnvironment();
    const envAdapters = envs.map(e => this.getAdapter(e));
    const mcpServers = await this.detectMcpServers();

    const skillsDir = this.options.skillsDir ?? await this.promptSkillsDir(envs);
    this.resolvedSkillsDir = skillsDir;
    const adapterOptions: AdapterSetupOptions = { skillsDir };

    this.steps = [
      { name: 'Create directory structure', run: () => this.createDirs(), rollback: () => this.removeDirs() },
      { name: 'Generate .nova.yaml', run: () => this.generateConfig(envs, mcpServers), rollback: () => this.removeFile('.nova.yaml') },
      { name: 'Install ECC skills', run: () => this.installEcc(), rollback: () => this.removeDir('.nova/ecc') },
      { name: 'Generate environment commands', run: async () => {
        for (const adapter of envAdapters) await adapter.setup(this.cwd, adapterOptions);
      }, rollback: () => this.cleanEnvCommands(envs) },
      { name: 'Generate templates', run: () => this.generateTemplates(), rollback: () => this.removeDir('docs') }
    ];

    for (const step of this.steps) {
      const spinner = ui.spinner(step.name);
      try {
        await step.run();
        spinner.succeed(step.name);
      } catch (err) {
        spinner.fail(step.name);
        await this.rollback();
        throw err;
      }
    }
    if (this.backupDir) await fs.rm(this.backupDir, { recursive: true, force: true });
  }

  private async isInitialized() {
    try { await fs.access(path.join(this.cwd, '.nova.yaml')); return true; } catch { return false; }
  }

  private async promptSkillsDir(envs: string[]): Promise<'project' | 'user'> {
    if (!envs.includes('claude-code')) return 'project';
    const { skillsDir } = await inquirer.prompt([{
      type: 'list',
      name: 'skillsDir',
      message: 'Where to install Nova skills?',
      choices: [
        { name: 'User (~/.agents/skills/) — shared across all AI tools', value: 'user' },
        { name: 'Project (.claude/skills/) — project-specific', value: 'project' },
      ],
      default: 'user',
    }]);
    return skillsDir;
  }

  private async backup() {
    this.backupDir = path.join(this.cwd, '.nova-backup-' + Date.now());
    await fs.mkdir(this.backupDir, { recursive: true });
    const files = await fs.readdir(this.cwd);
    for (const f of files) {
      if (f.startsWith('.nova') || f === 'docs' || f === '.nova.yaml') {
        try { await fs.cp(path.join(this.cwd, f), path.join(this.backupDir, f), { recursive: true }); } catch {}
      }
    }
  }

  private async rollback() {
    for (let i = this.steps.length - 1; i >= 0; i--) {
      try { await this.steps[i].rollback(); } catch {}
    }
    if (this.backupDir) {
      const files = await fs.readdir(this.backupDir);
      for (const f of files) await fs.cp(path.join(this.backupDir, f), path.join(this.cwd, f), { recursive: true, force: true });
      await fs.rm(this.backupDir, { recursive: true, force: true });
    }
  }

  private async commandExists(cmd: string): Promise<boolean> {
    return new Promise((resolve) => {
      execFile('which', [cmd], (err) => resolve(!err));
    });
  }

  private async detectAIEnvironment(): Promise<string[]> {
    const detectors: { env: string; cmd: string }[] = [
      { env: 'claude-code', cmd: 'claude' },
      { env: 'codex', cmd: 'codex' },
      { env: 'openclaw', cmd: 'openclaw' },
      { env: 'hermes-agent', cmd: 'hermes-agent' },
      { env: 'opencode', cmd: 'opencode' },
    ];
    const detected: string[] = [];
    for (const d of detectors) {
      if (await this.commandExists(d.cmd)) detected.push(d.env);
    }
    return detected.length > 0 ? detected : ['claude-code'];
  }

  private async detectMcpServers(): Promise<McpServers> {
    const mcpServers: McpServers = {};
    const settingsPaths = [
      path.join(os.homedir(), '.claude', 'settings.json'),
      path.join(this.cwd, '.claude', 'settings.json'),
    ];
    for (const settingsPath of settingsPaths) {
      try {
        const raw = await fs.readFile(settingsPath, 'utf-8');
        const settings = JSON.parse(raw);
        const servers = settings.mcpServers ?? {};
        for (const [name, config] of Object.entries(servers)) {
          const lower = name.toLowerCase();
          if (!mcpServers.figma && (lower.includes('figma'))) {
            mcpServers.figma = { configured: true, serverName: name };
          }
          if (!mcpServers.mobile && (lower.includes('mobile') || lower.includes('simulator') || lower.includes('maestro'))) {
            mcpServers.mobile = { configured: true, serverName: name };
          }
        }
      } catch {}
    }
    return mcpServers;
  }

  private getAdapter(env: string): EnvironmentAdapter {
    const factory = ADAPTER_FACTORIES[env];
    if (!factory) throw new Error(`Unknown environment: ${env}`);
    return factory();
  }

  private async createDirs() {
    const dirs = ['docs/designs', 'docs/proposals', 'docs/reports', '.nova/contexts', '.openspec/changes'];
    for (const d of dirs) await fs.mkdir(path.join(this.cwd, d), { recursive: true });
  }
  private async removeDirs() { /* 不回滚用户目录 */ }

  private async generateConfig(envs: string[], mcpServers: McpServers) {
    const projectType = await this.detectProjectType();
    const config = {
      version: 1,
      project: path.basename(this.cwd),
      projectType,
      environment: envs,
      activeChange: '',
      integrations: {
        openspec: { mode: 'compatible' },
        superpowers: { mode: 'compatible' },
        ecc: { mode: 'compatible' },
      },
      mcpServers,
      artifacts: {
        openspecChange: '',
        proposal: '',
        specDelta: '',
        implementationPlan: '',
        verificationReport: '',
      },
      phases: {
        propose: { status: 'pending', proposal: '' },
        design: { status: 'pending', designDoc: '', tasks: [] },
        implement: { status: 'pending', tasks: {} },
        verify: { status: 'pending', pipelineResult: null },
        archive: { status: 'pending' }
      },
      metadata: { stateVersion: 0, lastModified: new Date().toISOString(), history: [] }
    };
    await fs.writeFile(path.join(this.cwd, '.nova.yaml'), yaml.stringify(config), 'utf-8');
  }

  private async detectProjectType(): Promise<string> {
    return detectProjectType(this.cwd);
  }

  private async installEcc() {
    const dest = path.join(this.cwd, '.nova/ecc');
    await fs.mkdir(dest, { recursive: true });
    if (this.options.eccPath) {
      await fs.cp(this.options.eccPath, dest, { recursive: true });
    } else {
      ui.info('No --with-ecc path provided. Skipping ECC skill installation.');
      ui.info('ECC skills are expected to be available in your AI environment.');
    }
  }

  private async generateTemplates() {
    await fs.cp(path.join(__dirname, '../../templates/docs'), path.join(this.cwd, 'docs'), { recursive: true });
  }

  private async cleanEnvCommands(envs: string[]) {
    const cleanupMap: Record<string, string[]> = {
      'claude-code': ['.agents/skills'],
      'codex': ['CODEX.md'],
      'openclaw': ['.openclaw'],
      'hermes-agent': ['HERMES.md'],
      'opencode': ['opencode.json'],
    };
    for (const env of envs) {
      const targets = cleanupMap[env] ?? [];
      for (const target of targets) {
        const baseDir = (env === 'claude-code' && this.resolvedSkillsDir === 'user')
          ? os.homedir()
          : this.cwd;
        await fs.rm(path.join(baseDir, target), { recursive: true, force: true });
      }
    }
  }

  private async removeFile(file: string) { try { await fs.unlink(path.join(this.cwd, file)); } catch {} }
  private async removeDir(dir: string) { try { await fs.rm(path.join(this.cwd, dir), { recursive: true, force: true }); } catch {} }
}
