import { execFile } from 'child_process';
import { upgradeCommand } from '../upgrade';
import { UpgradeManager } from '../../../cli-core/upgrade-manager';

jest.mock('child_process', () => ({
  execFile: jest.fn((_cmd, _args, _opts, cb) => cb(null, '', '')),
}));

jest.mock('../../../cli-core/upgrade-manager', () => ({
  UpgradeManager: jest.fn().mockImplementation(() => ({
    run: jest.fn().mockResolvedValue(undefined),
  })),
}));

describe('upgradeCommand', () => {
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    (execFile as unknown as jest.Mock).mockClear();
    (UpgradeManager as jest.Mock).mockClear();
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  test('updates the global npm package and re-runs upgraded nova to refresh skills', async () => {
    await upgradeCommand({ agent: 'codex', skillsDir: 'user' });

    expect(execFile).toHaveBeenNthCalledWith(
      1,
      'npm',
      ['install', '-g', '@nova286/nova-workflow@latest'],
      { cwd: process.cwd() },
      expect.any(Function)
    );
    expect(execFile).toHaveBeenNthCalledWith(
      2,
      'nova',
      ['upgrade', '--skip-npm', '--agent', 'codex', '--skills-dir', 'user'],
      { cwd: process.cwd() },
      expect.any(Function)
    );
    expect(UpgradeManager).not.toHaveBeenCalled();
  });

  test('skipNpm only refreshes installed Agent skills in the current process', async () => {
    await upgradeCommand({ agent: 'codex', skillsDir: 'user', skipNpm: true });

    expect(execFile).not.toHaveBeenCalled();
    expect(UpgradeManager).toHaveBeenCalledWith(process.cwd(), {
      agent: 'codex',
      skillsDir: 'user',
    });
  });
});
