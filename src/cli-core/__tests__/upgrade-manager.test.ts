import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'yaml';
import { UpgradeManager } from '../upgrade-manager';

describe('UpgradeManager', () => {
  let testDir: string;
  let homeDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-upgrade-'));
    homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-upgrade-home-'));
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
    await fs.rm(homeDir, { recursive: true, force: true });
  });

  test('upgrades existing user Codex Nova skills without reinitializing state', async () => {
    const skillDir = path.join(homeDir, '.codex', 'skills', 'nova');
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), 'old nova skill', 'utf-8');
    await fs.writeFile(
      path.join(testDir, '.nova.yaml'),
      yaml.stringify({ version: 1, environment: ['codex'], project: 'demo' }),
      'utf-8'
    );

    const manager = new UpgradeManager(testDir, { agent: 'codex', skillsDir: 'user', homeDir });
    await manager.run();

    const content = await fs.readFile(path.join(skillDir, 'SKILL.md'), 'utf-8');
    expect(content).toContain('description:');
    expect(content).toContain('Nova');
    const state = yaml.parse(await fs.readFile(path.join(testDir, '.nova.yaml'), 'utf-8'));
    expect(state.project).toBe('demo');
    await expect(fs.access(path.join(testDir, 'docs'))).rejects.toThrow();
  });

  test('throws when no installed Nova skills are found', async () => {
    const manager = new UpgradeManager(testDir, { agent: 'codex', homeDir });

    await expect(manager.run()).rejects.toThrow('No installed Nova skills');
  });
});
