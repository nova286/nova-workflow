import * as fs from 'fs/promises';
import * as path from 'path';
import { execFile } from 'child_process';

export type DetectionCategory = 'required' | 'recommended' | 'optional';
export type DetectionStatus = 'available' | 'missing' | 'partial';

export interface ToolDetection {
  id: string;
  name: string;
  category: DetectionCategory;
  status: DetectionStatus;
  summary: string;
  install?: string;
  details: string[];
}

export interface DetectResult {
  pass: boolean;
  tools: ToolDetection[];
}

export interface DetectOptions {
  cwd?: string;
  homeDir?: string;
  commandExists?: (cmd: string) => Promise<boolean>;
}

export async function detectNovaEnvironment(options: DetectOptions = {}): Promise<DetectResult> {
  const cwd = options.cwd ?? process.cwd();
  const homeDir = options.homeDir ?? process.env.HOME ?? '';
  const commandExists = options.commandExists ?? defaultCommandExists;

  const tools: ToolDetection[] = [];

  tools.push(await detectNovaState(cwd));
  tools.push(await detectCodeGraph(cwd, commandExists));
  tools.push(await detectOpenSpec(cwd, commandExists));
  tools.push(await detectSuperpowers(homeDir));
  tools.push(await detectEcc(cwd, homeDir, commandExists));
  tools.push(await detectFigmaMcp(cwd, homeDir));
  tools.push(await detectMobileMcp(cwd, homeDir));

  return {
    pass: tools.filter(t => t.category === 'required').every(t => t.status === 'available'),
    tools,
  };
}

async function detectNovaState(cwd: string): Promise<ToolDetection> {
  const exists = await pathExists(path.join(cwd, '.nova.yaml'));
  return {
    id: 'nova-state',
    name: 'Nova state',
    category: 'required',
    status: exists ? 'available' : 'missing',
    summary: exists ? '.nova.yaml found' : '.nova.yaml not found',
    install: exists ? undefined : 'nova init',
    details: [exists ? 'Project is initialized for Nova.' : 'Run nova init in this project.'],
  };
}

async function detectCodeGraph(cwd: string, commandExists: (cmd: string) => Promise<boolean>): Promise<ToolDetection> {
  const projectDir = await pathExists(path.join(cwd, '.codegraph'));
  const cli = await commandExists('codegraph');
  const status = projectDir || cli ? (projectDir && cli ? 'available' : 'partial') : 'missing';
  return {
    id: 'codegraph',
    name: 'CodeGraph',
    category: 'optional',
    status,
    summary: status === 'available' ? 'project and CLI available' : status === 'partial' ? 'partially available' : 'not installed',
    install: 'npm install -g codegraph && codegraph init -i',
    details: [
      projectDir ? '.codegraph directory found' : '.codegraph directory missing',
      cli ? 'codegraph CLI found' : 'codegraph CLI missing',
    ],
  };
}

async function detectOpenSpec(cwd: string, commandExists: (cmd: string) => Promise<boolean>): Promise<ToolDetection> {
  const projectDir = await pathExists(path.join(cwd, '.openspec'));
  const cli = await commandExists('openspec');
  const status = projectDir || cli ? (projectDir && cli ? 'available' : 'partial') : 'missing';
  return {
    id: 'openspec',
    name: 'OpenSpec',
    category: 'recommended',
    status,
    summary: status === 'available' ? 'project and CLI available' : status === 'partial' ? 'compatible mode can still run' : 'compatible mode will be used',
    install: 'npm install -g @fission-ai/openspec@latest && openspec init',
    details: [
      projectDir ? '.openspec directory found' : '.openspec directory missing',
      cli ? 'openspec CLI found' : 'openspec CLI missing',
    ],
  };
}

async function detectSuperpowers(homeDir: string): Promise<ToolDetection> {
  const found = await pathExists(path.join(homeDir, '.agents', 'skills', 'brainstorming'));
  return {
    id: 'superpowers',
    name: 'Superpowers',
    category: 'recommended',
    status: found ? 'available' : 'missing',
    summary: found ? 'brainstorming skill found' : 'compatible mode will be used',
    install: 'Install Superpowers skills into ~/.agents/skills and symlink to ~/.claude/skills',
    details: [found ? '~/.agents/skills/brainstorming found' : '~/.agents/skills/brainstorming missing'],
  };
}

async function detectEcc(cwd: string, homeDir: string, commandExists: (cmd: string) => Promise<boolean>): Promise<ToolDetection> {
  const eccCli = await commandExists('ecc');
  const installCli = await commandExists('ecc-install');
  const claudePlugin = await hasClaudePlugin(cwd, homeDir, ['ecc@ecc', 'affaan-m/ecc', 'ecc-universal']);
  const agentsConfigureSkill = await pathExists(path.join(homeDir, '.agents', 'skills', 'configure-ecc'));
  const claudeConfigureSkill = await pathExists(path.join(homeDir, '.claude', 'skills', 'configure-ecc'));
  const installed = eccCli || installCli || claudePlugin || agentsConfigureSkill || claudeConfigureSkill;

  return {
    id: 'ecc',
    name: 'ECC',
    category: 'recommended',
    status: installed ? 'available' : 'missing',
    summary: installed ? 'affaan-m/ECC detected' : 'compatible review mode will be used',
    install: 'npm install -g ecc-universal && ecc-install typescript',
    details: [
      eccCli ? 'ecc CLI found' : 'ecc CLI missing',
      installCli ? 'ecc-install CLI found' : 'ecc-install CLI missing',
      claudePlugin ? 'Claude ECC plugin config found' : 'Claude ECC plugin config missing',
      agentsConfigureSkill ? '~/.agents/skills/configure-ecc found' : '~/.agents/skills/configure-ecc missing',
      claudeConfigureSkill ? '~/.claude/skills/configure-ecc found' : '~/.claude/skills/configure-ecc missing',
    ],
  };
}

async function detectFigmaMcp(cwd: string, homeDir: string): Promise<ToolDetection> {
  const configured = await hasMcpServer(cwd, homeDir, ['figma']);
  return {
    id: 'figma-mcp',
    name: 'Figma MCP',
    category: 'optional',
    status: configured ? 'available' : 'missing',
    summary: configured ? 'configured' : 'not configured',
    install: 'Add a figma MCP server entry to ~/.claude/settings.json or .claude/settings.json',
    details: [configured ? 'Figma MCP server found in Claude settings' : 'No Figma MCP server found in Claude settings'],
  };
}

async function detectMobileMcp(cwd: string, homeDir: string): Promise<ToolDetection> {
  const configured = await hasMcpServer(cwd, homeDir, ['mobile', 'simulator', 'maestro']);
  return {
    id: 'mobile-mcp',
    name: 'Mobile MCP',
    category: 'optional',
    status: configured ? 'available' : 'missing',
    summary: configured ? 'configured' : 'not configured',
    install: 'Add a mobile/simulator MCP server entry to ~/.claude/settings.json or .claude/settings.json',
    details: [configured ? 'Mobile MCP server found in Claude settings' : 'No Mobile MCP server found in Claude settings'],
  };
}

async function hasMcpServer(cwd: string, homeDir: string, needles: string[]): Promise<boolean> {
  const settingsPaths = [
    path.join(homeDir, '.claude', 'settings.json'),
    path.join(cwd, '.claude', 'settings.json'),
  ];

  for (const settingsPath of settingsPaths) {
    try {
      const raw = await fs.readFile(settingsPath, 'utf-8');
      const settings = JSON.parse(raw);
      const servers = settings.mcpServers ?? {};
      for (const name of Object.keys(servers)) {
        const lower = name.toLowerCase();
        if (needles.some(needle => lower.includes(needle))) return true;
      }
    } catch {}
  }
  return false;
}

async function hasClaudePlugin(cwd: string, homeDir: string, needles: string[]): Promise<boolean> {
  const settingsPaths = [
    path.join(homeDir, '.claude', 'settings.json'),
    path.join(cwd, '.claude', 'settings.json'),
  ];

  for (const settingsPath of settingsPaths) {
    try {
      const raw = await fs.readFile(settingsPath, 'utf-8');
      const lower = raw.toLowerCase();
      if (needles.some(needle => lower.includes(needle))) return true;
    } catch {}
  }
  return false;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function defaultCommandExists(cmd: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('which', [cmd], (err) => resolve(!err));
  });
}
