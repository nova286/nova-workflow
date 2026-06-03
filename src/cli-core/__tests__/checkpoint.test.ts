import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'yaml';
import { checkpointPhase, checkpointTask } from '../checkpoint';
import { StateManager } from '../state';

describe('checkpoint', () => {
  let testDir: string;
  let originalCwd: string;

  const task = {
    id: 'task-one',
    title: 'Task one',
    type: 'implementation',
    method: 'implementation',
    files: [{ path: 'src/task.ts', action: 'modify' }],
    specRefs: ['spec.task-one'],
    acceptanceRefs: ['accept.task-one'],
    acceptance: ['Task works'],
    verification: { commands: ['npm test'] },
  };

  const baseState = {
    version: 1,
    project: 'test-project',
    environment: ['claude-code'],
    phases: {
      propose: { status: 'pending', proposal: '' },
      design: { status: 'done', designDoc: 'docs/design.md', tasks: [task] },
      implement: { status: 'pending', tasks: {} },
      verify: { status: 'pending', pipelineResult: null },
      archive: { status: 'pending' },
    },
    metadata: { stateVersion: 0, lastModified: '', history: [] },
  };

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-checkpoint-'));
    originalCwd = process.cwd();
    process.chdir(testDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(testDir, { recursive: true, force: true });
  });

  async function writeState(state: any) {
    await fs.writeFile('.nova.yaml', yaml.stringify(state), 'utf-8');
  }

  test('checkpointPhase updates status and timestamps', async () => {
    await writeState(baseState);
    await checkpointPhase('implement', 'in-progress');

    const state = await StateManager.load();
    expect(state.phases.implement.status).toBe('in-progress');
    expect(state.phases.implement.startedAt).toBeTruthy();
  });

  test('checkpointTask records and merges evidence', async () => {
    await writeState(baseState);
    await checkpointTask({
      taskId: 'task-one',
      status: 'done',
      filesChanged: ['src/task.ts'],
      tests: ['npm test'],
      traceId: 'trace-1',
    });
    await checkpointTask({
      taskId: 'task-one',
      status: 'done',
      filesChanged: ['src/task.ts', 'src/task.test.ts'],
      tests: ['npx tsc --noEmit'],
      traceId: 'trace-2',
      note: 'verified',
    });

    const state = await StateManager.load();
    const result = state.phases.implement.tasks['task-one'];
    expect(result.status).toBe('done');
    expect(result.filesChanged).toEqual(['src/task.ts', 'src/task.test.ts']);
    expect(result.tests).toEqual(['npm test', 'npx tsc --noEmit']);
    expect(result.traceIds).toEqual(['trace-1', 'trace-2']);
    expect(result.notes).toEqual(['verified']);
    expect(result.updatedAt).toBeTruthy();
  });

  test('checkpointTask fails for unknown design task', async () => {
    await writeState(baseState);
    await expect(
      checkpointTask({ taskId: 'missing-task', status: 'done' })
    ).rejects.toThrow('not found');
  });

  test('checkpointPhase refuses done when validation fails', async () => {
    await writeState({
      ...baseState,
      phases: {
        ...baseState.phases,
        design: { status: 'done', designDoc: 'docs/design.md', tasks: [] },
      },
    });

    await expect(checkpointPhase('design', 'done')).rejects.toThrow('Cannot mark design done');
  });
});
