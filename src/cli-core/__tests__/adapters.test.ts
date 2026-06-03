import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { ClaudeCodeAdapter } from '../adapters/claude-code';
import { CodexAdapter } from '../adapters/codex';
import { OpenClawAdapter } from '../adapters/openclaw';
import { HermesAgentAdapter } from '../adapters/hermes-agent';
import { OpenCodeAdapter } from '../adapters/opencode';

describe('Environment Adapters', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-adapter-'));
  });

  afterEach(async () => {
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
      expect(content).toContain('Recommended');
      expect(content).toContain('Optional');
      expect(content).not.toContain('which openspec');
    });

    test('no MCP steps when no MCP configured', async () => {
      const adapter = new ClaudeCodeAdapter();
      await adapter.setup(testDir, { skillsDir: 'project' });

      const design = await fs.readFile(path.join(testDir, '.claude', 'skills', 'nova-design', 'SKILL.md'), 'utf-8');
      const verify = await fs.readFile(path.join(testDir, '.claude', 'skills', 'nova-verify', 'SKILL.md'), 'utf-8');
      expect(design).not.toContain('Figma MCP detected');
      expect(verify).not.toContain('Mobile MCP detected');
    });
  });
});
