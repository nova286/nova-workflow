import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as yaml from 'yaml';
import { InitManager } from '../init-manager';

describe('InitManager', () => {
  let testDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-init-'));
    originalCwd = process.cwd();
    process.chdir(testDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('re-init detection', () => {
    test('throws when .nova.yaml already exists without --force', async () => {
      await fs.writeFile('.nova.yaml', 'version: 1\n', 'utf-8');
      const mgr = new InitManager(testDir, {});

      await expect(mgr.run()).rejects.toThrow('Nova already initialized');
    });

    test('force re-init proceeds and creates new state', async () => {
      await fs.writeFile('.nova.yaml', 'version: 1\nproject: old\n', 'utf-8');

      const mgr = new InitManager(testDir, { force: true, skillsDir: 'project' });
      await mgr.run();

      const raw = await fs.readFile('.nova.yaml', 'utf-8');
      const state = yaml.parse(raw);
      expect(state.project).not.toBe('old');
    });
  });

  describe('directory creation', () => {
    test('creates all required directories', async () => {
      const mgr = new InitManager(testDir, { force: false, skillsDir: 'project' });
      await mgr.run();

      const dirs = ['docs/designs', 'docs/proposals', 'docs/reports', '.nova/contexts', '.openspec/changes'];
      for (const d of dirs) {
        await expect(
          fs.access(path.join(testDir, d))
        ).resolves.toBeUndefined();
      }
    });
  });

  describe('.nova.yaml generation', () => {
    test('generates valid .nova.yaml with correct structure', async () => {
      const mgr = new InitManager(testDir, { force: false, skillsDir: 'project' });
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

      const mgr = new InitManager(testDir, { force: false, skillsDir: 'project' });
      await mgr.run();

      const raw = await fs.readFile('.nova.yaml', 'utf-8');
      const state = yaml.parse(raw);
      expect(state.projectType).toBeTruthy();
    });

    test('uses explicit agent option instead of auto-detecting all installed agents', async () => {
      const mgr = new InitManager(testDir, { force: false, skillsDir: 'project', agent: 'codex' });
      await mgr.run();

      const raw = await fs.readFile('.nova.yaml', 'utf-8');
      const state = yaml.parse(raw);

      expect(state.environment).toEqual(['codex']);
      await expect(fs.access(path.join(testDir, 'CODEX.md'))).resolves.toBeUndefined();
      await expect(fs.access(path.join(testDir, '.claude', 'skills'))).rejects.toThrow();
    });

    test('rejects unknown explicit agent option', async () => {
      const mgr = new InitManager(testDir, { force: false, skillsDir: 'project', agent: 'unknown-agent' });

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

      const mgr = new InitManager(testDir, { force: false, skillsDir: 'project' });
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

      const mgr = new InitManager(testDir, { force: false, skillsDir: 'project' });
      await mgr.run();

      const raw = await fs.readFile('.nova.yaml', 'utf-8');
      const state = yaml.parse(raw);
      expect(state.mcpServers.mobile).toEqual({ configured: true, serverName: 'ios-simulator' });
    });

    test('mcpServers is empty when no settings file exists', async () => {
      const mgr = new InitManager(testDir, { force: false, skillsDir: 'project' });
      await mgr.run();

      const raw = await fs.readFile('.nova.yaml', 'utf-8');
      const state = yaml.parse(raw);
      expect(state.mcpServers).toEqual({});
    });
  });

  describe('environment command generation', () => {
    test('generates all Nova skill dirs with SKILL.md in project', async () => {
      const mgr = new InitManager(testDir, { force: false, skillsDir: 'project' });
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
      const agentsSkillsDir = path.join(os.homedir(), '.agents', 'skills');
      const claudeSkillsDir = path.join(os.homedir(), '.claude', 'skills');
      const existingDirs = new Set<string>();
      const existingLinks = new Set<string>();
      try {
        for (const f of await fs.readdir(agentsSkillsDir)) {
          if (f.startsWith('nova')) existingDirs.add(f);
        }
      } catch {}
      try {
        for (const f of await fs.readdir(claudeSkillsDir)) {
          if (f.startsWith('nova')) existingLinks.add(f);
        }
      } catch {}

      const mgr = new InitManager(testDir, { force: false, skillsDir: 'user' });
      await mgr.run();

      // Verify SKILL.md exists in each nova dir
      const dirs = await fs.readdir(agentsSkillsDir);
      const novaDirs = dirs.filter(d => d.startsWith('nova'));
      expect(novaDirs.length).toBeGreaterThanOrEqual(7);

      for (const d of novaDirs) {
        const content = await fs.readFile(path.join(agentsSkillsDir, d, 'SKILL.md'), 'utf-8');
        expect(content).toContain('description:');
      }

      // Cleanup: remove dirs and symlinks we created
      for (const d of novaDirs) {
        if (!existingDirs.has(d)) {
          await fs.rm(path.join(agentsSkillsDir, d), { recursive: true, force: true });
        }
      }
      const links = (await fs.readdir(claudeSkillsDir)).filter(f => f.startsWith('nova'));
      for (const l of links) {
        if (!existingLinks.has(l)) {
          await fs.unlink(path.join(claudeSkillsDir, l));
        }
      }
    });
  });

  describe('ECC installation', () => {
    test('copies ECC skills when --with-ecc provided', async () => {
      const eccDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ecc-src-'));
      await fs.writeFile(path.join(eccDir, 'test-skill.md'), '# Test', 'utf-8');

      const mgr = new InitManager(testDir, { eccPath: eccDir, skillsDir: 'project' });
      await mgr.run();

      const destFile = path.join(testDir, '.nova', 'ecc', 'test-skill.md');
      const content = await fs.readFile(destFile, 'utf-8');
      expect(content).toBe('# Test');

      await fs.rm(eccDir, { recursive: true, force: true });
    });

    test('creates empty .nova/ecc without --with-ecc', async () => {
      const mgr = new InitManager(testDir, { force: false, skillsDir: 'project' });
      await mgr.run();

      await expect(
        fs.access(path.join(testDir, '.nova', 'ecc'))
      ).resolves.toBeUndefined();

      const files = await fs.readdir(path.join(testDir, '.nova', 'ecc'));
      expect(files.length).toBe(0);
    });
  });

  describe('document templates', () => {
    test('copies proposal, design, and verification-report templates to docs/', async () => {
      const mgr = new InitManager(testDir, { force: false, skillsDir: 'project' });
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
