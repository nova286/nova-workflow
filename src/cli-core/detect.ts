import * as fs from 'fs/promises';
import * as path from 'path';
import { execFile } from 'child_process';
import * as yaml from 'yaml';
import { McpServers } from './types';

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
  const agentId = agent.active.id;
  tools.push(await detectSuperpowers(homeDir, agentId));
  tools.push(await detectEcc(cwd, homeDir, commandExists, agentId));
  tools.push(await detectFigmaMcp(cwd, homeDir, agentId));
  tools.push(await detectMobileMcp(cwd, homeDir, agentId));

  return {
    pass: tools.filter(t => t.category === 'required').every(t => t.status === 'available'),
    agent,
    tools,
  };
}

export function mcpServersFromDetections(tools: ToolDetection[]): McpServers {
  const mcpServers: McpServers = {};
  const figma = tools.find(tool => tool.id === 'figma-mcp');
  const mobile = tools.find(tool => tool.id === 'mobile-mcp');

  if (figma?.status === 'available') {
    mcpServers.figma = {
      configured: true,
      serverName: detectedServerName(figma, 'figma-mcp'),
      platform: detectedPlatform(figma),
    };
  }

  if (mobile?.status === 'available') {
    mcpServers.mobile = {
      configured: true,
      serverName: detectedServerName(mobile, 'mobile-mcp'),
      platform: detectedPlatform(mobile),
    };
  }

  return mcpServers;
}

function detectedPlatform(tool: ToolDetection): string | undefined {
  const details = tool.details.join('\n').toLowerCase();
  if (details.includes('claude integration found')) return 'claude-code';
  if (details.includes('codex config found')) return 'codex';
  return undefined;
}

function detectedServerName(tool: ToolDetection, fallback: string): string {
  for (const detail of tool.details) {
    const match = detail.match(/server: ([^\s]+)/i);
    if (match) return match[1];
  }
  const platform = detectedPlatform(tool);
  if (platform === 'codex') return fallback;
  return fallback;
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

async function detectSuperpowers(homeDir: string, agentId?: string | null): Promise<ToolDetection> {
  const agentsSkill = await pathExists(path.join(homeDir, '.agents', 'skills', 'brainstorming'));
  const codexSkill = await pathExists(path.join(homeDir, '.codex', 'skills', 'brainstorming'));
  const found = agentId === 'codex' ? codexSkill || agentsSkill : agentsSkill;
  return {
    id: 'superpowers',
    name: 'Superpowers',
    category: 'recommended',
    status: found ? 'available' : 'missing',
    summary: found ? 'brainstorming skill found' : 'compatible mode will be used',
    install: installHint(agentId, 'superpowers'),
    details: agentId === 'codex'
      ? [
          codexSkill ? '~/.codex/skills/brainstorming found' : '~/.codex/skills/brainstorming missing',
          agentsSkill ? '~/.agents/skills/brainstorming found' : '~/.agents/skills/brainstorming missing',
        ]
      : [agentsSkill ? '~/.agents/skills/brainstorming found' : '~/.agents/skills/brainstorming missing'],
  };
}

async function detectEcc(cwd: string, homeDir: string, commandExists: (cmd: string) => Promise<boolean>, agentId?: string | null): Promise<ToolDetection> {
  const eccCli = await commandExists('ecc');
  const installCli = await commandExists('ecc-install');
  const claudePlugin = await hasClaudePlugin(cwd, homeDir, ['ecc@ecc', 'affaan-m/ecc', 'ecc-universal']);
  const codexPlugin = await hasCodexConfig(homeDir, ['ecc@ecc', 'affaan-m/ecc', 'ecc-universal']);
  const agentsConfigureSkill = await pathExists(path.join(homeDir, '.agents', 'skills', 'configure-ecc'));
  const codexConfigureSkill = await pathExists(path.join(homeDir, '.codex', 'skills', 'configure-ecc'));
  const claudeConfigureSkill = await pathExists(path.join(homeDir, '.claude', 'skills', 'configure-ecc'));
  const agentSpecificInstalled =
    agentId === 'codex'
      ? codexPlugin || codexConfigureSkill
      : agentId === 'claude-code'
      ? claudePlugin || claudeConfigureSkill
      : claudePlugin || codexPlugin || claudeConfigureSkill || codexConfigureSkill;
  const installed = eccCli || installCli || agentsConfigureSkill || agentSpecificInstalled;

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
      codexPlugin ? 'Codex ECC plugin config found' : 'Codex ECC plugin config missing',
      agentsConfigureSkill ? '~/.agents/skills/configure-ecc found' : '~/.agents/skills/configure-ecc missing',
      codexConfigureSkill ? '~/.codex/skills/configure-ecc found' : '~/.codex/skills/configure-ecc missing',
      claudeConfigureSkill ? '~/.claude/skills/configure-ecc found' : '~/.claude/skills/configure-ecc missing',
    ],
  };
}

async function detectFigmaMcp(cwd: string, homeDir: string, agentId?: string | null): Promise<ToolDetection> {
  const claude = await findClaudeMcpServer(cwd, homeDir, ['figma']);
  const codex = await hasCodexConfig(homeDir, ['figma@', 'figma-mcp', 'mcp_servers.figma']);
  const configured = agentId === 'codex' ? codex : agentId === 'claude-code' ? claude : claude || codex;
  return {
    id: 'figma-mcp',
    name: 'Figma MCP',
    category: 'optional',
    status: configured ? 'available' : 'missing',
    summary: configured ? 'configured' : 'not configured',
    install: installHint(agentId, 'figma-mcp'),
    details: [
      claude ? `Figma integration found in Claude settings; server: ${claude}` : 'Figma integration missing from Claude settings',
      codex ? 'Figma integration found in Codex config' : 'Figma integration missing from Codex config',
    ],
  };
}

async function detectMobileMcp(cwd: string, homeDir: string, agentId?: string | null): Promise<ToolDetection> {
  const claude = await findClaudeMcpServer(cwd, homeDir, ['mobile', 'simulator', 'maestro', 'xcodebuild']);
  const codex = await hasCodexConfig(homeDir, ['build-ios-apps', 'mobile-mcp', 'xcodebuild', 'simulator', 'maestro']);
  const configured = agentId === 'codex' ? codex : agentId === 'claude-code' ? claude : claude || codex;
  return {
    id: 'mobile-mcp',
    name: 'Mobile MCP',
    category: 'optional',
    status: configured ? 'available' : 'missing',
    summary: configured ? 'configured' : 'not configured',
    install: installHint(agentId, 'mobile-mcp'),
    details: [
      claude ? `Mobile/simulator integration found in Claude settings; server: ${claude}` : 'Mobile/simulator integration missing from Claude settings',
      codex ? 'Mobile/simulator integration found in Codex config' : 'Mobile/simulator integration missing from Codex config',
    ],
  };
}

async function findClaudeMcpServer(cwd: string, homeDir: string, needles: string[]): Promise<string | null> {
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
        if (needles.some(needle => lower.includes(needle))) return name;
      }
    } catch {}
  }
  return null;
}

async function hasCodexConfig(homeDir: string, needles: string[]): Promise<boolean> {
  try {
    const raw = await fs.readFile(path.join(homeDir, '.codex', 'config.toml'), 'utf-8');
    const lower = raw.toLowerCase();
    return needles.some(needle => lower.includes(needle.toLowerCase()));
  } catch {
    return false;
  }
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

function installHint(agentId: string | null | undefined, tool: 'superpowers' | 'figma-mcp' | 'mobile-mcp'): string {
  const hints: Record<typeof tool, Record<string, string>> = {
    'superpowers': {
      codex: 'Install Superpowers skills into ~/.codex/skills, or into ~/.agents/skills if your Codex setup imports shared skills',
      'claude-code': 'Install Superpowers skills into ~/.agents/skills and symlink to ~/.claude/skills',
      default: 'Install Superpowers skills for your active Agent, or use compatible mode',
    },
    'figma-mcp': {
      codex: 'Enable the Figma connector/plugin in Codex, or add a Figma MCP server in ~/.codex/config.toml',
      'claude-code': 'Add a figma MCP server entry to ~/.claude/settings.json or .claude/settings.json',
      default: 'Configure Figma in the active Agent plugin/MCP settings',
    },
    'mobile-mcp': {
      codex: 'Enable the Codex iOS/mobile plugin, or add a mobile/simulator MCP server in ~/.codex/config.toml',
      'claude-code': 'Add a mobile/simulator MCP server entry to ~/.claude/settings.json or .claude/settings.json',
      default: 'Configure mobile/simulator support in the active Agent plugin/MCP settings',
    },
  };
  return hints[tool][agentId || ''] || hints[tool].default;
}
