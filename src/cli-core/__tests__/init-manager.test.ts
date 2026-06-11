import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as yaml from 'yaml';
import { InitManager } from '../init-manager';

describe('InitManager', () => {
  let testDir: string;
  let homeDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-init-'));
    homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-init-home-'));
    originalCwd = process.cwd();
    process.chdir(testDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(testDir, { recursive: true, force: true });
    await fs.rm(homeDir, { recursive: true, force: true });
  });

  describe('re-init detection', () => {
    test('throws when .nova.yaml already exists without --force', async () => {
      await fs.writeFile('.nova.yaml', 'version: 1\n', 'utf-8');
      const mgr = new InitManager(testDir, { homeDir });

      await expect(mgr.run()).rejects.toThrow('Nova already initialized');
    });

    test('force re-init proceeds and creates new state', async () => {
      await fs.writeFile('.nova.yaml', 'version: 1\nproject: old\n', 'utf-8');

      const mgr = new InitManager(testDir, { force: true, skillsDir: 'project', homeDir });
      await mgr.run();

      const raw = await fs.readFile('.nova.yaml', 'utf-8');
      const state = yaml.parse(raw);
      expect(state.project).not.toBe('old');
    });
  });

  describe('directory creation', () => {
    test('creates all required directories', async () => {
      const mgr = new InitManager(testDir, { force: false, skillsDir: 'project', homeDir });
      await mgr.run();

      const dirs = ['docs/designs', 'docs/proposals', 'docs/reports', '.nova/contexts', '.openspec/changes'];
      for (const d of dirs) {
        await expect(
          fs.access(path.join(testDir, d))
        ).resolves.toBeUndefined();
      }
    });

    test('prepares shared skills directories for any init agent', async () => {
      const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-init-home-'));
      const mgr = new InitManager(testDir, { force: false, skillsDir: 'project', agent: 'codex', homeDir });
      await mgr.run();

      const agentsSkillsDir = path.join(homeDir, '.agents', 'skills');
      const claudeSkillsDir = path.join(homeDir, '.claude', 'skills');
      const codexSkillsDir = path.join(homeDir, '.codex', 'skills');
      const claudeSkillsStat = await fs.lstat(claudeSkillsDir);
      const codexSkillsStat = await fs.lstat(codexSkillsDir);

      await expect(fs.access(agentsSkillsDir)).resolves.toBeUndefined();
      expect(claudeSkillsStat.isSymbolicLink()).toBe(true);
      expect(codexSkillsStat.isSymbolicLink()).toBe(true);
      expect(await fs.readlink(claudeSkillsDir)).toBe(agentsSkillsDir);
      expect(await fs.readlink(codexSkillsDir)).toBe(agentsSkillsDir);

      await fs.rm(homeDir, { recursive: true, force: true });
    });

    test('does not replace an existing Claude skills directory during init', async () => {
      const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-init-home-'));
      const claudeSkillsDir = path.join(homeDir, '.claude', 'skills');
      await fs.mkdir(claudeSkillsDir, { recursive: true });
      await fs.writeFile(path.join(claudeSkillsDir, 'custom.txt'), 'keep', 'utf-8');

      const mgr = new InitManager(testDir, { force: false, skillsDir: 'project', agent: 'codex', homeDir });
      await mgr.run();

      const claudeSkillsStat = await fs.lstat(claudeSkillsDir);
      expect(claudeSkillsStat.isDirectory()).toBe(true);
      expect(claudeSkillsStat.isSymbolicLink()).toBe(false);
      await expect(fs.readFile(path.join(claudeSkillsDir, 'custom.txt'), 'utf-8')).resolves.toBe('keep');
      await expect(fs.access(path.join(homeDir, '.agents', 'skills'))).resolves.toBeUndefined();

      await fs.rm(homeDir, { recursive: true, force: true });
    });
  });

  describe('.nova.yaml generation', () => {
    test('generates valid .nova.yaml with correct structure', async () => {
      const mgr = new InitManager(testDir, { force: false, skillsDir: 'project', homeDir });
      await mgr.run();

      const raw = await fs.readFile('.nova.yaml', 'utf-8');
      const state = yaml.parse(raw);

      expect(state.version).toBe(1);
      expect(state.project).toBeTruthy();
      expect(state.environment).toContain('claude-code');
      expect(state.phases.propose.status).toBe('pending');
      expect(state.phases.design.status).toBe('pending');
      expect(state.phases.implement.status).toBe('pending');
      expect(state.phases.verify.status).toBe('pending');
      expect(state.phases.archive.status).toBe('pending');
      expect(state.activeChange).toBe('');
      expect(state.integrations).toEqual({
        openspec: { mode: 'compatible' },
        superpowers: { mode: 'compatible' },
        ecc: { mode: 'compatible' },
      });
      expect(state.artifacts).toEqual({
        openspecChange: '',
        proposal: '',
        specDelta: '',
        implementationPlan: '',
        verificationReport: '',
      });
      expect(state.metadata.stateVersion).toBe(0);
      expect(state.metadata.lastModified).toBeTruthy();
    });

    test('detects project type when package.json exists', async () => {
      await fs.writeFile(
        'package.json',
        JSON.stringify({ name: 'test-pkg', dependencies: { express: '^4.0.0' } }),
        'utf-8'
      );

      const mgr = new InitManager(testDir, { force: false, skillsDir: 'project', homeDir });
      await mgr.run();

      const raw = await fs.readFile('.nova.yaml', 'utf-8');
      const state = yaml.parse(raw);
      expect(state.projectType).toBeTruthy();
    });

    test('uses explicit agent option instead of auto-detecting all installed agents', async () => {
      const mgr = new InitManager(testDir, { force: false, skillsDir: 'project', agent: 'codex', homeDir });
      await mgr.run();

      const raw = await fs.readFile('.nova.yaml', 'utf-8');
      const state = yaml.parse(raw);

      expect(state.environment).toEqual(['codex']);
      await expect(fs.access(path.join(testDir, 'CODEX.md'))).resolves.toBeUndefined();
      await expect(fs.access(path.join(testDir, '.claude', 'skills'))).rejects.toThrow();
    });

    test('rejects unknown explicit agent option', async () => {
      const mgr = new InitManager(testDir, { force: false, skillsDir: 'project', agent: 'unknown-agent', homeDir });

      await expect(mgr.run()).rejects.toThrow('Unknown Agent: unknown-agent');
    });
  });

  describe('MCP server detection', () => {
    test('detects figma and mobile MCP from project settings', async () => {
      const claudeDir = path.join(testDir, '.claude');
      await fs.mkdir(claudeDir, { recursive: true });
      await fs.writeFile(
        path.join(claudeDir, 'settings.json'),
        JSON.stringify({
          mcpServers: {
            'figma-mcp': { command: 'npx', args: ['figma-mcp'] },
            'mobile-mcp': { command: 'npx', args: ['mobile-mcp'] },
          },
        }),
        'utf-8'
      );

      const mgr = new InitManager(testDir, { force: false, skillsDir: 'project', homeDir });
      await mgr.run();

      const raw = await fs.readFile('.nova.yaml', 'utf-8');
      const state = yaml.parse(raw);
      expect(state.mcpServers.figma).toEqual({ configured: true, serverName: 'figma-mcp' });
      expect(state.mcpServers.mobile).toEqual({ configured: true, serverName: 'mobile-mcp' });
    });

    test('detects simulator-based mobile MCP', async () => {
      const claudeDir = path.join(testDir, '.claude');
      await fs.mkdir(claudeDir, { recursive: true });
      await fs.writeFile(
        path.join(claudeDir, 'settings.json'),
        JSON.stringify({
          mcpServers: {
            'ios-simulator': { command: 'npx', args: ['sim-mcp'] },
          },
        }),
        'utf-8'
      );

      const mgr = new InitManager(testDir, { force: false, skillsDir: 'project', homeDir });
      await mgr.run();

      const raw = await fs.readFile('.nova.yaml', 'utf-8');
      const state = yaml.parse(raw);
      expect(state.mcpServers.mobile).toEqual({ configured: true, serverName: 'ios-simulator' });
    });

    test('mcpServers is empty when no settings file exists', async () => {
      const mgr = new InitManager(testDir, { force: false, skillsDir: 'project', homeDir });
      await mgr.run();

      const raw = await fs.readFile('.nova.yaml', 'utf-8');
      const state = yaml.parse(raw);
      expect(state.mcpServers).toEqual({});
    });
  });

  describe('environment command generation', () => {
    test('generates all Nova skill dirs with SKILL.md in project', async () => {
      const mgr = new InitManager(testDir, { force: false, skillsDir: 'project', homeDir });
      await mgr.run();

      const skillsDir = path.join(testDir, '.claude', 'skills');
      const dirs = await fs.readdir(skillsDir);
      const novaDirs = dirs.filter(d => d.startsWith('nova'));

      expect(novaDirs).toContain('nova');
      expect(novaDirs).toContain('nova-propose');
      expect(novaDirs).toContain('nova-design');
      expect(novaDirs).toContain('nova-implement');
      expect(novaDirs).toContain('nova-verify');
      expect(novaDirs).toContain('nova-iterate');
      expect(novaDirs).toContain('nova-status');

      for (const d of novaDirs) {
        const content = await fs.readFile(path.join(skillsDir, d, 'SKILL.md'), 'utf-8');
        expect(content).toContain('description:');
      }
    });

    test('generates Nova skills in ~/.agents/skills/ with symlinks when skillsDir=user', async () => {
      const agentsSkillsDir = path.join(homeDir, '.agents', 'skills');
      const claudeSkillsDir = path.join(homeDir, '.claude', 'skills');
      const codexSkillsDir = path.join(homeDir, '.codex', 'skills');
      const mgr = new InitManager(testDir, { force: false, skillsDir: 'user', homeDir });
      await mgr.run();

      // Verify SKILL.md exists in each nova dir
      const dirs = await fs.readdir(agentsSkillsDir);
      const novaDirs = dirs.filter(d => d.startsWith('nova'));
      expect(novaDirs.length).toBeGreaterThanOrEqual(7);

      for (const d of novaDirs) {
        const content = await fs.readFile(path.join(agentsSkillsDir, d, 'SKILL.md'), 'utf-8');
        expect(content).toContain('description:');
      }
      await expect(fs.access(claudeSkillsDir)).resolves.toBeUndefined();
      await expect(fs.access(codexSkillsDir)).resolves.toBeUndefined();
      expect((await fs.lstat(claudeSkillsDir)).isSymbolicLink()).toBe(true);
      expect((await fs.lstat(codexSkillsDir)).isSymbolicLink()).toBe(true);
      expect(await fs.readlink(claudeSkillsDir)).toBe(agentsSkillsDir);
      expect(await fs.readlink(codexSkillsDir)).toBe(agentsSkillsDir);
    });

    test('generates all Codex Nova skills in project agents skills', async () => {
      const mgr = new InitManager(testDir, { force: false, skillsDir: 'project', agent: 'codex', homeDir });
      await mgr.run();

      const skillsDir = path.join(testDir, '.agents', 'skills');
      const expected = [
        'nova',
        'nova-propose',
        'nova-design',
        'nova-implement',
        'nova-verify',
        'nova-archive',
        'nova-iterate',
        'nova-status',
        'nova-detect',
      ];

      for (const skill of expected) {
        const content = await fs.readFile(path.join(skillsDir, skill, 'SKILL.md'), 'utf-8');
        expect(content).toContain('description:');
      }
    });
  });

  describe('ECC installation', () => {
    test('copies ECC skills when --with-ecc provided', async () => {
      const eccDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ecc-src-'));
      await fs.writeFile(path.join(eccDir, 'test-skill.md'), '# Test', 'utf-8');

      const mgr = new InitManager(testDir, { eccPath: eccDir, skillsDir: 'project', homeDir });
      await mgr.run();

      const destFile = path.join(testDir, '.nova', 'ecc', 'test-skill.md');
      const content = await fs.readFile(destFile, 'utf-8');
      expect(content).toBe('# Test');

      await fs.rm(eccDir, { recursive: true, force: true });
    });

    test('creates empty .nova/ecc without --with-ecc', async () => {
      const mgr = new InitManager(testDir, { force: false, skillsDir: 'project', homeDir });
      await mgr.run();

      await expect(
        fs.access(path.join(testDir, '.nova', 'ecc'))
      ).resolves.toBeUndefined();

      const files = await fs.readdir(path.join(testDir, '.nova', 'ecc'));
      expect(files.length).toBe(0);
    });

    test('reports ECC in unified integration detection when active Agent has ECC configured', async () => {
      const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-init-home-'));
      await fs.mkdir(path.join(homeDir, '.codex'), { recursive: true });
      await fs.writeFile(
        path.join(homeDir, '.codex', 'config.toml'),
        '[plugins."ecc@ecc"]\nenabled = true\n',
        'utf-8'
      );
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      try {
        const mgr = new InitManager(testDir, { force: false, skillsDir: 'project', agent: 'codex', homeDir });
        await mgr.run();

        const output = logSpy.mock.calls.flat().join('\n');
        expect(output).toContain('ECC: available');
        expect(output).toContain('OpenSpec:');
        expect(output).toContain('Superpowers:');
        expect(output).toContain('CodeGraph:');
        expect(output).toContain('Figma MCP:');
        expect(output).toContain('Mobile MCP:');
        expect(output).not.toContain('ECC was not detected');
        expect(output).not.toContain('expected to be available');
      } finally {
        logSpy.mockRestore();
        await fs.rm(homeDir, { recursive: true, force: true });
      }
    });
  });

  describe('document templates', () => {
    test('copies proposal, design, and verification-report templates to docs/', async () => {
      const mgr = new InitManager(testDir, { force: false, skillsDir: 'project', homeDir });
      await mgr.run();

      await expect(
        fs.access(path.join(testDir, 'docs', 'proposal.md'))
      ).resolves.toBeUndefined();
      await expect(
        fs.access(path.join(testDir, 'docs', 'design.md'))
      ).resolves.toBeUndefined();
      await expect(
        fs.access(path.join(testDir, 'docs', 'verification-report.md'))
      ).resolves.toBeUndefined();
    });
  });
});
