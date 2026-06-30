import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'yaml';
import { statusCommand } from '../status';
import { ui } from '../../ui';

describe('statusCommand', () => {
  let testDir: string;
  let originalCwd: string;
  let logSpy: jest.SpyInstance;
  let stepSpy: jest.SpyInstance;
  let infoSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  const baseState = {
    version: 1,
    project: 'test-project',
    environment: ['codex'],
    phases: {
      propose: { status: 'done', proposal: 'docs/proposal.md' },
      design: { status: 'done', designDoc: 'docs/design.md', tasks: [] },
      implement: {
        status: 'in-progress',
        startedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        tasks: {
          'task-one': { status: 'done' },
          'task-two': { status: 'pending' },
        },
      },
      verify: { status: 'pending', pipelineResult: null },
      archive: { status: 'pending' },
    },
    metadata: { stateVersion: 0, lastModified: '', history: [] },
  };

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-status-cmd-'));
    originalCwd = process.cwd();
    process.chdir(testDir);
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    stepSpy = jest.spyOn(ui, 'step').mockImplementation(() => {});
    infoSpy = jest.spyOn(ui, 'info').mockImplementation(() => {});
    warnSpy = jest.spyOn(ui, 'warn').mockImplementation(() => {});
    await fs.writeFile('.nova.yaml', yaml.stringify(baseState), 'utf-8');
  });

  afterEach(async () => {
    logSpy.mockRestore();
    stepSpy.mockRestore();
    infoSpy.mockRestore();
    warnSpy.mockRestore();
    process.chdir(originalCwd);
    await fs.rm(testDir, { recursive: true, force: true });
  });

  test('prints structured JSON when requested', async () => {
    await statusCommand({ json: true });

    expect(stepSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledTimes(1);

    const result = JSON.parse(logSpy.mock.calls[0][0]);
    expect(result.project).toBe('test-project');
    expect(result.environment).toEqual(['codex']);
    expect(result.phases.implement.status).toBe('in-progress');
    expect(result.phases.implement.tasks).toEqual({ done: 1, total: 2 });
    expect(result.warnings).toEqual([]);
  });
});
