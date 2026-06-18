import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'yaml';
import { registerCheckpointCommand } from '../checkpoint';
import { ui } from '../../ui';

describe('checkpoint command', () => {
  let testDir: string;
  let originalCwd: string;
  let warnSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;

  const baseState = {
    version: 1,
    project: 'test-project',
    environment: ['claude-code'],
    phases: {
      propose: { status: 'done', proposal: 'docs/proposal.md', changeMode: 'new', testStrategy: {} },
      design: { status: 'done', designDoc: 'docs/design.md', tasks: [] },
      implement: { status: 'pending', tasks: {} },
      verify: { status: 'pending', pipelineResult: null },
      archive: { status: 'pending' },
    },
    metadata: { stateVersion: 0, lastModified: '', history: [] },
  };

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-checkpoint-cmd-'));
    originalCwd = process.cwd();
    process.chdir(testDir);
    warnSpy = jest.spyOn(ui, 'warn').mockImplementation(() => {});
    logSpy = jest.spyOn(ui, 'success').mockImplementation(() => {});
    await fs.writeFile('.nova.yaml', yaml.stringify(baseState), 'utf-8');
  });

  afterEach(async () => {
    warnSpy.mockRestore();
    logSpy.mockRestore();
    process.chdir(originalCwd);
    await fs.rm(testDir, { recursive: true, force: true });
  });

  test('prints compatibility warning and migration success for legacy unitTargets on checkpoint artifacts', async () => {
    const program = new Command();
    registerCheckpointCommand(program);

    await program.parseAsync([
      'node',
      'nova',
      'checkpoint',
      'artifacts',
      '--test-strategy',
      JSON.stringify({
        automatedUiTesting: false,
        unitTesting: true,
        unitTargets: ['src/task.ts'],
      }),
    ]);

    expect(warnSpy).toHaveBeenCalledWith('检测到已废弃字段 unitTargets：已自动迁移为 unitTestTargets，请后续改用 unitTestTargets。');
    expect(logSpy).toHaveBeenCalledWith('已完成字段迁移：unitTargets 已自动转写到 unitTestTargets。');
    expect(logSpy).toHaveBeenCalledWith('Checkpointed workflow artifacts.');

    const state = yaml.parse(await fs.readFile('.nova.yaml', 'utf-8'));
    expect(state.phases.propose.testStrategy.unitTestTargets).toEqual(['src/task.ts']);
    expect(state.phases.propose.testStrategy.uiFidelityTesting).toBe(false);
  });
});
