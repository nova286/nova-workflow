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

      const mgr = new InitManager(testDir, { force: true });
      await mgr.run();

      const raw = await fs.readFile('.nova.yaml', 'utf-8');
      const state = yaml.parse(raw);
      expect(state.project).not.toBe('old');
    });
  });

  describe('directory creation', () => {
    test('creates all required directories', async () => {
      const mgr = new InitManager(testDir, { force: false });
      await mgr.run();

      const dirs = ['docs/designs', 'docs/proposals', 'docs/reports', '.nova/contexts'];
      for (const d of dirs) {
        await expect(
          fs.access(path.join(testDir, d))
        ).resolves.toBeUndefined();
      }
    });
  });

  describe('.nova.yaml generation', () => {
    test('generates valid .nova.yaml with correct structure', async () => {
      const mgr = new InitManager(testDir, { force: false });
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
      expect(state.metadata.stateVersion).toBe(0);
      expect(state.metadata.lastModified).toBeTruthy();
    });

    test('detects project type when package.json exists', async () => {
      await fs.writeFile(
        'package.json',
        JSON.stringify({ name: 'test-pkg', dependencies: { express: '^4.0.0' } }),
        'utf-8'
      );

      const mgr = new InitManager(testDir, { force: false });
      await mgr.run();

      const raw = await fs.readFile('.nova.yaml', 'utf-8');
      const state = yaml.parse(raw);
      expect(state.projectType).toBeTruthy();
    });
  });

  describe('environment command generation', () => {
    test('generates all 6 Claude Code command files', async () => {
      const mgr = new InitManager(testDir, { force: false });
      await mgr.run();

      const commandsDir = path.join(testDir, '.claude', 'commands');
      const files = await fs.readdir(commandsDir);

      expect(files).toContain('nova-propose.md');
      expect(files).toContain('nova-design.md');
      expect(files).toContain('nova-implement.md');
      expect(files).toContain('nova-verify.md');
      expect(files).toContain('nova-iterate.md');
      expect(files).toContain('nova-status.md');

      for (const f of files) {
        const content = await fs.readFile(path.join(commandsDir, f), 'utf-8');
        expect(content).toContain('description:');
      }
    });
  });

  describe('ECC installation', () => {
    test('copies ECC skills when --with-ecc provided', async () => {
      const eccDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ecc-src-'));
      await fs.writeFile(path.join(eccDir, 'test-skill.md'), '# Test', 'utf-8');

      const mgr = new InitManager(testDir, { eccPath: eccDir });
      await mgr.run();

      const destFile = path.join(testDir, '.nova', 'ecc', 'test-skill.md');
      const content = await fs.readFile(destFile, 'utf-8');
      expect(content).toBe('# Test');

      await fs.rm(eccDir, { recursive: true, force: true });
    });

    test('creates empty .nova/ecc without --with-ecc', async () => {
      const mgr = new InitManager(testDir, { force: false });
      await mgr.run();

      await expect(
        fs.access(path.join(testDir, '.nova', 'ecc'))
      ).resolves.toBeUndefined();

      const files = await fs.readdir(path.join(testDir, '.nova', 'ecc'));
      expect(files.length).toBe(0);
    });
  });

  describe('document templates', () => {
    test('copies proposal and design templates to docs/', async () => {
      const mgr = new InitManager(testDir, { force: false });
      await mgr.run();

      await expect(
        fs.access(path.join(testDir, 'docs', 'proposal.md'))
      ).resolves.toBeUndefined();
      await expect(
        fs.access(path.join(testDir, 'docs', 'design.md'))
      ).resolves.toBeUndefined();
    });
  });
});
