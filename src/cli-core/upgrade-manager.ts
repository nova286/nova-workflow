import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as yaml from 'yaml';
import { ui } from '../cli/ui';
import { AdapterSetupOptions, EnvironmentAdapter, McpServers } from './types';
import { detectNovaEnvironment, mcpServersFromDetections } from './detect';
import { ClaudeCodeAdapter } from './adapters/claude-code';
import { CodexAdapter } from './adapters/codex';
import { OpenClawAdapter } from './adapters/openclaw';
import { HermesAgentAdapter } from './adapters/hermes-agent';
import { OpenCodeAdapter } from './adapters/opencode';
import { PiCodingAgentAdapter } from './adapters/pi-coding-agent';

const ADAPTER_FACTORIES: Record<string, () => EnvironmentAdapter> = {
  'claude-code': () => new ClaudeCodeAdapter(),
  'codex': () => new CodexAdapter(),
  'openclaw': () => new OpenClawAdapter(),
  'hermes-agent': () => new HermesAgentAdapter(),
  'opencode': () => new OpenCodeAdapter(),
  'pi-coding-agent': () => new PiCodingAgentAdapter(),
};

export interface UpgradeOptions {
  agent?: string;
  skillsDir?: 'project' | 'user';
  homeDir?: string;
}

type SkillsDir = 'project' | 'user';

export class UpgradeManager {
  private cwd: string;
  private options: UpgradeOptions;

  constructor(cwd: string, options: UpgradeOptions = {}) {
    this.cwd = cwd;
    this.options = options;
  }

  async run(): Promise<void> {
    const agents = await this.resolveAgents();
    if (agents.length === 0) {
      throw new Error('No installed Nova Agent skills found. Run nova init first, or pass --agent <id>.');
    }

    const mcpServers = await this.detectMcpServers();
    let updated = 0;
    for (const agent of agents) {
      const adapter = this.getAdapter(agent);
      const dirs = await this.resolveSkillsDirs(agent);
      if (dirs.length === 0) {
        ui.info(`  ${agent}: no installed Nova skills found; skipping`);
        continue;
      }

      for (const skillsDir of dirs) {
        const adapterOptions: AdapterSetupOptions = {
          skillsDir,
          mcpServers,
          homeDir: this.homeDir(),
        };
        await adapter.setup(this.cwd, adapterOptions);
        ui.info(`  ${agent}: upgraded ${skillsDir} skills`);
        updated++;
      }
    }

    if (updated === 0) {
      throw new Error('No installed Nova skills were upgraded. Run nova init first, or pass --skills-dir project|user.');
    }
  }

  private async resolveAgents(): Promise<string[]> {
    if (this.options.agent) {
      this.ensureKnownAgent(this.options.agent);
      return [this.options.agent];
    }

    const configured = await this.readConfiguredAgents();
    const installed = await this.detectInstalledAgents();
    const agents = [...configured, ...installed].filter((agent, index, all) => all.indexOf(agent) === index);
    for (const agent of agents) this.ensureKnownAgent(agent);
    return agents;
  }

  private async resolveSkillsDirs(agent: string): Promise<SkillsDir[]> {
    if (this.options.skillsDir) return [this.options.skillsDir];

    const dirs: SkillsDir[] = [];
    if (await this.hasInstalledSkills(agent, 'user')) dirs.push('user');
    if (await this.hasInstalledSkills(agent, 'project')) dirs.push('project');
    return dirs;
  }

  private async readConfiguredAgents(): Promise<string[]> {
    try {
      const raw = await fs.readFile(path.join(this.cwd, '.nova.yaml'), 'utf-8');
      const state = yaml.parse(raw);
      return Array.isArray(state?.environment)
        ? state.environment.filter((item: unknown) => typeof item === 'string')
        : [];
    } catch {
      return [];
    }
  }

  private async detectInstalledAgents(): Promise<string[]> {
    const agents = Object.keys(ADAPTER_FACTORIES);
    const installed: string[] = [];
    for (const agent of agents) {
      if (await this.hasInstalledSkills(agent, 'user') || await this.hasInstalledSkills(agent, 'project')) {
        installed.push(agent);
      }
    }
    return installed;
  }

  private async hasInstalledSkills(agent: string, skillsDir: SkillsDir): Promise<boolean> {
    const markers = this.skillMarkers(agent, skillsDir);
    for (const marker of markers) {
      if (await pathExists(marker)) return true;
    }
    return false;
  }

  private skillMarkers(agent: string, skillsDir: SkillsDir): string[] {
    const homeDir = this.homeDir();
    const base = skillsDir === 'user' ? homeDir : this.cwd;
    switch (agent) {
      case 'claude-code':
        return skillsDir === 'user'
          ? [
              path.join(base, '.agents', 'skills', 'nova', 'SKILL.md'),
              path.join(base, '.claude', 'skills', 'nova', 'SKILL.md'),
            ]
          : [path.join(base, '.claude', 'skills', 'nova', 'SKILL.md')];
      case 'codex':
        return skillsDir === 'user'
          ? [
              path.join(base, '.codex', 'skills', 'nova', 'SKILL.md'),
              path.join(base, '.agents', 'skills', 'nova', 'SKILL.md'),
            ]
          : [path.join(base, '.agents', 'skills', 'nova', 'SKILL.md')];
      case 'pi-coding-agent':
        return skillsDir === 'user'
          ? [path.join(base, '.agents', 'skills', 'nova', 'SKILL.md')]
          : [path.join(base, '.pi', 'skills', 'nova', 'SKILL.md')];
      case 'openclaw':
        return [path.join(base, '.openclaw', 'instructions.md')];
      case 'hermes-agent':
        return [path.join(base, 'HERMES.md')];
      case 'opencode':
        return [path.join(base, 'opencode.json')];
      default:
        return [];
    }
  }

  private async detectMcpServers(): Promise<McpServers> {
    const result = await detectNovaEnvironment({
      cwd: this.cwd,
      homeDir: this.homeDir(),
      agent: this.options.agent,
      env: {},
    });
    return mcpServersFromDetections(result.tools);
  }

  private getAdapter(agent: string): EnvironmentAdapter {
    this.ensureKnownAgent(agent);
    return ADAPTER_FACTORIES[agent]();
  }

  private ensureKnownAgent(agent: string): void {
    if (!ADAPTER_FACTORIES[agent]) {
      throw new Error(`Unknown Agent: ${agent}. Supported: ${Object.keys(ADAPTER_FACTORIES).join(', ')}`);
    }
  }

  private homeDir(): string {
    return this.options.homeDir ?? os.homedir();
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
