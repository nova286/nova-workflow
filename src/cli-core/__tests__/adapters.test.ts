import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { ClaudeCodeAdapter } from '../adapters/claude-code';
import { CodexAdapter } from '../adapters/codex';
import { OpenClawAdapter } from '../adapters/openclaw';
import { HermesAgentAdapter } from '../adapters/hermes-agent';
import { OpenCodeAdapter } from '../adapters/opencode';
import { PiCodingAgentAdapter } from '../adapters/pi-coding-agent';

describe('Environment Adapters', () => {
  let testDir: string;
  let originalHome: string | undefined;

  function expectTestStrategyChecklist(content: string) {
    expect(content).toContain('[ ] 自动化 UI 测试');
    expect(content).toContain('[ ] 单元测试');
    expect(content).toContain('testStrategy');
  }

  function expectLegacyPreflightRules(content: string) {
    expect(content).toContain('changeMode');
    expect(content).toContain('legacyPreflight');
    expect(content).toContain('[ ] 仅完成本次需求，不做重构');
    expect(content).toContain('[ ] 做最小必要重构，只处理会阻塞本次需求的部分');
    expect(content).toContain('[ ] 将相关模块一起重构到项目规范');
  }

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-adapter-'));
    originalHome = process.env.HOME;
  });

  afterEach(async () => {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('CodexAdapter', () => {
    test('creates CODEX.md with instructions', async () => {
      const adapter = new CodexAdapter();
      expect(adapter.name).toBe('codex');

      await adapter.setup(testDir);

      const content = await fs.readFile(path.join(testDir, 'CODEX.md'), 'utf-8');
      expect(content).toContain('Nova Workflow');
      expect(content).toContain('.nova.yaml');
    });

    test('does not overwrite existing CODEX.md', async () => {
      const existing = '# My Custom Instructions';
      await fs.writeFile(path.join(testDir, 'CODEX.md'), existing, 'utf-8');

      const adapter = new CodexAdapter();
      await adapter.setup(testDir);

      const content = await fs.readFile(path.join(testDir, 'CODEX.md'), 'utf-8');
      expect(content).toBe(existing);
    });

    test('includes Figma propose intake rules', async () => {
      const adapter = new CodexAdapter();
      await adapter.setup(testDir);

      const content = await fs.readFile(path.join(testDir, 'CODEX.md'), 'utf-8');
      expect(content).toContain('Figma 链接');
      expect(content).toContain('nova detect --agent codex --json');
      expect(content).toContain('存量页面修改还是增量新页面');
      expect(content).toContain('切图/图片/icon 资产');
    });

    test('includes test strategy checklist', async () => {
      const adapter = new CodexAdapter();
      await adapter.setup(testDir);

      const content = await fs.readFile(path.join(testDir, 'CODEX.md'), 'utf-8');
      expectTestStrategyChecklist(content);
      expectLegacyPreflightRules(content);
    });
  });

  describe('OpenClawAdapter', () => {
    test('creates .openclaw/instructions.md', async () => {
      const adapter = new OpenClawAdapter();
      expect(adapter.name).toBe('openclaw');

      await adapter.setup(testDir);

      const content = await fs.readFile(path.join(testDir, '.openclaw', 'instructions.md'), 'utf-8');
      expect(content).toContain('Nova Workflow');
    });

    test('does not overwrite existing instructions', async () => {
      const dir = path.join(testDir, '.openclaw');
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, 'instructions.md'), 'custom', 'utf-8');

      const adapter = new OpenClawAdapter();
      await adapter.setup(testDir);

      const content = await fs.readFile(path.join(dir, 'instructions.md'), 'utf-8');
      expect(content).toBe('custom');
    });

    test('includes test strategy checklist', async () => {
      const adapter = new OpenClawAdapter();
      await adapter.setup(testDir);

      const content = await fs.readFile(path.join(testDir, '.openclaw', 'instructions.md'), 'utf-8');
      expectTestStrategyChecklist(content);
      expectLegacyPreflightRules(content);
    });
  });

  describe('HermesAgentAdapter', () => {
    test('creates HERMES.md', async () => {
      const adapter = new HermesAgentAdapter();
      expect(adapter.name).toBe('hermes-agent');

      await adapter.setup(testDir);

      const content = await fs.readFile(path.join(testDir, 'HERMES.md'), 'utf-8');
      expect(content).toContain('Nova Workflow');
    });

    test('does not overwrite existing HERMES.md', async () => {
      await fs.writeFile(path.join(testDir, 'HERMES.md'), 'custom', 'utf-8');

      const adapter = new HermesAgentAdapter();
      await adapter.setup(testDir);

      const content = await fs.readFile(path.join(testDir, 'HERMES.md'), 'utf-8');
      expect(content).toBe('custom');
    });

    test('includes test strategy checklist', async () => {
      const adapter = new HermesAgentAdapter();
      await adapter.setup(testDir);

      const content = await fs.readFile(path.join(testDir, 'HERMES.md'), 'utf-8');
      expectTestStrategyChecklist(content);
      expectLegacyPreflightRules(content);
    });
  });

  describe('OpenCodeAdapter', () => {
    test('creates opencode.json with instructions', async () => {
      const adapter = new OpenCodeAdapter();
      expect(adapter.name).toBe('opencode');

      await adapter.setup(testDir);

      const raw = await fs.readFile(path.join(testDir, 'opencode.json'), 'utf-8');
      const config = JSON.parse(raw);
      expect(config.instructions).toContain('Nova Workflow');
    });

    test('does not overwrite existing opencode.json', async () => {
      const existing = { model: 'claude-sonnet-4-6' };
      await fs.writeFile(path.join(testDir, 'opencode.json'), JSON.stringify(existing), 'utf-8');

      const adapter = new OpenCodeAdapter();
      await adapter.setup(testDir);

      const raw = await fs.readFile(path.join(testDir, 'opencode.json'), 'utf-8');
      const config = JSON.parse(raw);
      expect(config.model).toBe('claude-sonnet-4-6');
    });

    test('includes test strategy checklist', async () => {
      const adapter = new OpenCodeAdapter();
      await adapter.setup(testDir);

      const raw = await fs.readFile(path.join(testDir, 'opencode.json'), 'utf-8');
      const instructions = JSON.parse(raw).instructions;
      expectTestStrategyChecklist(instructions);
      expectLegacyPreflightRules(instructions);
    });
  });

  describe('ClaudeCodeAdapter MCP injection', () => {
    test('injects Figma step into nova-design when figma MCP configured', async () => {
      const adapter = new ClaudeCodeAdapter();
      await adapter.setup(testDir, { skillsDir: 'project', mcpServers: { figma: { configured: true, serverName: 'figma-mcp' } } });

      const content = await fs.readFile(path.join(testDir, '.claude', 'skills', 'nova-design', 'SKILL.md'), 'utf-8');
      expect(content).toContain('Figma MCP detected');
      expect(content).toContain('Design Tokens');
    });

    test('injects Mobile step into nova-verify when mobile MCP configured', async () => {
      const adapter = new ClaudeCodeAdapter();
      await adapter.setup(testDir, { skillsDir: 'project', mcpServers: { mobile: { configured: true, serverName: 'mobile-mcp' } } });

      const content = await fs.readFile(path.join(testDir, '.claude', 'skills', 'nova-verify', 'SKILL.md'), 'utf-8');
      expect(content).toContain('Mobile MCP detected');
      expect(content).toContain('UI Verification');
    });

    test('nova-detect delegates to nova detect CLI', async () => {
      const adapter = new ClaudeCodeAdapter();
      await adapter.setup(testDir, { skillsDir: 'project' });

      const content = await fs.readFile(path.join(testDir, '.claude', 'skills', 'nova-detect', 'SKILL.md'), 'utf-8');
      expect(content).toContain('nova detect');
      expect(content).toContain('--agent claude-code');
      expect(content).toContain('Recommended');
      expect(content).toContain('Optional');
      expect(content).not.toContain('which openspec');
    });

    test('nova-propose handles Figma links before generating specs', async () => {
      const adapter = new ClaudeCodeAdapter();
      await adapter.setup(testDir, { skillsDir: 'project' });

      const content = await fs.readFile(path.join(testDir, '.claude', 'skills', 'nova-propose', 'SKILL.md'), 'utf-8');
      expect(content).toContain('Handle Figma Links');
      expect(content).toContain('nova detect --agent claude-code --json');
      expect(content).toContain('Existing page modification');
      expect(content).toContain('Incremental new page');
      expect(content).toContain('cut/export assets');
    });

    test('nova-propose asks for test strategy checklist', async () => {
      const adapter = new ClaudeCodeAdapter();
      await adapter.setup(testDir, { skillsDir: 'project' });

      const propose = await fs.readFile(path.join(testDir, '.claude', 'skills', 'nova-propose', 'SKILL.md'), 'utf-8');
      const design = await fs.readFile(path.join(testDir, '.claude', 'skills', 'nova-design', 'SKILL.md'), 'utf-8');
      expectTestStrategyChecklist(propose);
      expectLegacyPreflightRules(`${propose}\n${design}`);
    });

    test('no MCP steps when no MCP configured', async () => {
      const adapter = new ClaudeCodeAdapter();
      await adapter.setup(testDir, { skillsDir: 'project' });

      const design = await fs.readFile(path.join(testDir, '.claude', 'skills', 'nova-design', 'SKILL.md'), 'utf-8');
      const verify = await fs.readFile(path.join(testDir, '.claude', 'skills', 'nova-verify', 'SKILL.md'), 'utf-8');
      expect(design).not.toContain('Figma MCP detected');
      expect(verify).not.toContain('Mobile MCP detected');
    });

    test('creates shared skills directory and Claude skills symlink for user install', async () => {
      const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-adapter-home-'));
      process.env.HOME = homeDir;

      const adapter = new ClaudeCodeAdapter();
      await adapter.setup(testDir, { skillsDir: 'user', homeDir });

      const agentsSkillsDir = path.join(homeDir, '.agents', 'skills');
      const claudeSkillsDir = path.join(homeDir, '.claude', 'skills');
      const claudeSkillsStat = await fs.lstat(claudeSkillsDir);

      expect(claudeSkillsStat.isSymbolicLink()).toBe(true);
      expect(await fs.readlink(claudeSkillsDir)).toBe(agentsSkillsDir);
      await expect(fs.access(path.join(agentsSkillsDir, 'nova', 'SKILL.md'))).resolves.toBeUndefined();

      await fs.rm(homeDir, { recursive: true, force: true });
    });

    test('does not replace an existing Claude skills directory for user install', async () => {
      const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-adapter-home-'));
      process.env.HOME = homeDir;
      const claudeSkillsDir = path.join(homeDir, '.claude', 'skills');
      await fs.mkdir(claudeSkillsDir, { recursive: true });
      await fs.writeFile(path.join(claudeSkillsDir, 'custom.txt'), 'keep', 'utf-8');

      const adapter = new ClaudeCodeAdapter();
      await adapter.setup(testDir, { skillsDir: 'user', homeDir });

      const claudeSkillsStat = await fs.lstat(claudeSkillsDir);
      expect(claudeSkillsStat.isDirectory()).toBe(true);
      expect(claudeSkillsStat.isSymbolicLink()).toBe(false);
      await expect(fs.readFile(path.join(claudeSkillsDir, 'custom.txt'), 'utf-8')).resolves.toBe('keep');
      await expect(fs.access(path.join(homeDir, '.agents', 'skills', 'nova', 'SKILL.md'))).resolves.toBeUndefined();

      await fs.rm(homeDir, { recursive: true, force: true });
    });
  });

  describe('PiCodingAgentAdapter', () => {
    test('nova-propose handles Figma links before generating proposal', async () => {
      const adapter = new PiCodingAgentAdapter();
      await adapter.setup(testDir, { skillsDir: 'project' });

      const content = await fs.readFile(path.join(testDir, '.claude', 'skills', 'nova-propose', 'SKILL.md'), 'utf-8');
      expect(content).toContain('Handle Figma Links');
      expect(content).toContain('nova detect --agent pi-coding-agent --json');
      expect(content).toContain('existing page modification');
      expect(content).toContain('incremental new page');
      expect(content).toContain('cut/export assets');
    });

    test('nova-propose asks for test strategy checklist', async () => {
      const adapter = new PiCodingAgentAdapter();
      await adapter.setup(testDir, { skillsDir: 'project' });

      const propose = await fs.readFile(path.join(testDir, '.claude', 'skills', 'nova-propose', 'SKILL.md'), 'utf-8');
      const design = await fs.readFile(path.join(testDir, '.claude', 'skills', 'nova-design', 'SKILL.md'), 'utf-8');
      expectTestStrategyChecklist(propose);
      expectLegacyPreflightRules(`${propose}\n${design}`);
    });
  });
});
