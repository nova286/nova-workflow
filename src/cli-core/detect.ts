import * as fs from 'fs/promises';
import * as path from 'path';
import { execFile } from 'child_process';
import * as yaml from 'yaml';

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
  agent: AgentDetection;
  tools: ToolDetection[];
}

export interface DetectOptions {
  cwd?: string;
  homeDir?: string;
  agent?: string;
  env?: Record<string, string | undefined>;
  commandExists?: (cmd: string) => Promise<boolean>;
}

export interface AgentDetection {
  active: {
    id: string | null;
    name: string;
    source: 'option' | 'environment' | 'unknown';
    confidence: 'high' | 'low' | 'none';
    summary: string;
  };
  configured: string[];
  available: Array<{ id: string; name: string; available: boolean }>;
}

const AI_TOOLS = [
  { id: 'claude-code', name: 'Claude Code', cmd: 'claude' },
  { id: 'codex', name: 'Codex', cmd: 'codex' },
  { id: 'openclaw', name: 'OpenClaw', cmd: 'openclaw' },
  { id: 'hermes-agent', name: 'Hermes Agent', cmd: 'hermes-agent' },
  { id: 'opencode', name: 'OpenCode', cmd: 'opencode' },
  { id: 'pi-coding-agent', name: 'Pi Coding Agent', cmd: 'pi' },
];

export async function detectNovaEnvironment(options: DetectOptions = {}): Promise<DetectResult> {
  const cwd = options.cwd ?? process.cwd();
  const homeDir = options.homeDir ?? process.env.HOME ?? '';
  const env = options.env ?? process.env;
  const commandExists = options.commandExists ?? defaultCommandExists;

  const tools: ToolDetection[] = [];
  const agent = await detectAgentContext(cwd, commandExists, options.agent, env);

  tools.push(await detectNovaState(cwd));
  tools.push(await detectCodeGraph(cwd, commandExists));
  tools.push(await detectOpenSpec(cwd, commandExists));
  tools.push(await detectSuperpowers(homeDir));
  tools.push(await detectEcc(cwd, homeDir, commandExists));
  tools.push(await detectFigmaMcp(cwd, homeDir));
  tools.push(await detectMobileMcp(cwd, homeDir));

  return {
    pass: tools.filter(t => t.category === 'required').every(t => t.status === 'available'),
    agent,
    tools,
  };
}

async function detectAgentContext(
  cwd: string,
  commandExists: (cmd: string) => Promise<boolean>,
  requestedAgent?: string,
  env: Record<string, string | undefined> = {}
): Promise<AgentDetection> {
  const configured = await readConfiguredAgents(cwd);
  const available = await Promise.all(
    AI_TOOLS.map(async tool => ({
      id: tool.id,
      name: tool.name,
      available: await commandExists(tool.cmd),
    }))
  );

  if (requestedAgent) {
    const known = AI_TOOLS.find(tool => tool.id === requestedAgent);
    return {
      active: {
        id: requestedAgent,
        name: known?.name ?? requestedAgent,
        source: 'option',
        confidence: known ? 'high' : 'low',
        summary: known ? `Active Agent supplied by --agent: ${known.name}` : `Unknown Agent supplied by --agent: ${requestedAgent}`,
      },
      configured,
      available,
    };
  }

  const inferred = inferAgentFromEnv(env);
  if (inferred) {
    return {
      active: {
        id: inferred.id,
        name: inferred.name,
        source: 'environment',
        confidence: 'high',
        summary: `Active Agent inferred from environment: ${inferred.name}`,
      },
      configured,
      available,
    };
  }

  return {
    active: {
      id: null,
      name: 'Unknown',
      source: 'unknown',
      confidence: 'none',
      summary: 'Active Agent cannot be known from a plain CLI process. Run from an Agent session or pass --agent <id>.',
    },
    configured,
    available,
  };
}

async function readConfiguredAgents(cwd: string): Promise<string[]> {
  try {
    const raw = await fs.readFile(path.join(cwd, '.nova.yaml'), 'utf-8');
    const state = yaml.parse(raw);
    return Array.isArray(state?.environment)
      ? state.environment.filter((item: unknown) => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

function inferAgentFromEnv(env: Record<string, string | undefined>) {
  if (env.CODEX_SHELL || env.CODEX_THREAD_ID || env.CODEX_INTERNAL_ORIGINATOR_OVERRIDE) {
    return { id: 'codex', name: 'Codex' };
  }
  if (env.CLAUDECODE || env.CLAUDE_CODE || env.CLAUDE_DESKTOP) {
    return { id: 'claude-code', name: 'Claude Code' };
  }
  if (env.OPENCODE || env.OPENCODE_SESSION) {
    return { id: 'opencode', name: 'OpenCode' };
  }
  return null;
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
