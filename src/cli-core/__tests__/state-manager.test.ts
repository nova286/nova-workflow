import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as yaml from 'yaml';
import { StateManager } from '../state';

describe('StateManager', () => {
  let testDir: string;
  let originalCwd: string;

  const baseState = {
    version: 1,
    project: 'test-project',
    environment: ['claude-code'],
    phases: {
      propose: { status: 'pending', proposal: '' },
      design: { status: 'pending', designDoc: '', tasks: [] },
      implement: { status: 'pending', tasks: {} },
      verify: { status: 'pending', pipelineResult: null },
      archive: { status: 'pending' },
    },
    metadata: { stateVersion: 0, lastModified: '', history: [] },
  };

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-state-'));
    originalCwd = process.cwd();
    process.chdir(testDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(testDir, { recursive: true, force: true });
  });

  async function writeState(data: any) {
    await fs.writeFile('.nova.yaml', yaml.stringify(data), 'utf-8');
  }

  test('load reads .nova.yaml', async () => {
    await writeState(baseState);
    const state = await StateManager.load();
    expect(state.project).toBe('test-project');
    expect(state.environment).toEqual(['claude-code']);
  });

  test('update atomically modifies state', async () => {
    await writeState(baseState);
    const next = await StateManager.update((s) => {
      s.phases.propose.status = 'done';
      return s;
    });

    expect(next.phases.propose.status).toBe('done');
    expect(next.metadata.stateVersion).toBe(1);
    expect(next.metadata.lastModified).toBeTruthy();

    const raw = await fs.readFile('.nova.yaml', 'utf-8');
    const disk = yaml.parse(raw);
    expect(disk.phases.propose.status).toBe('done');
  });

  test('setPhaseField updates a single phase field', async () => {
    await writeState(baseState);
    await StateManager.setPhaseField('implement', 'status', 'in-progress');

    const state = await StateManager.load();
    expect(state.phases.implement.status).toBe('in-progress');
  });

  test('getTask finds task by id', async () => {
    const stateWithTasks = {
      ...baseState,
      phases: {
        ...baseState.phases,
        design: {
          ...baseState.phases.design,
          tasks: [
            { id: 'task-1', title: 'First task' },
            { id: 'task-2', title: 'Second task' },
          ],
        },
      },
    };
    await writeState(stateWithTasks);

    const task = await StateManager.getTask('task-2');
    expect(task).toBeDefined();
    expect(task.id).toBe('task-2');
    expect(task.title).toBe('Second task');
  });

  test('getTask returns undefined for missing task', async () => {
    await writeState(baseState);
    const task = await StateManager.getTask('nonexistent');
    expect(task).toBeUndefined();
  });
});
