import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as yaml from 'yaml';
import { guardPhaseTransition } from '../guard';

describe('guardPhaseTransition', () => {
  let testDir: string;
  let originalCwd: string;

  const baseState = {
    version: 1,
    project: 'test',
    environment: [],
    phases: {
      open: { status: 'pending', proposal: '' },
      design: { status: 'pending', designDoc: '', tasks: [] },
      build: { status: 'pending', tasks: {} },
      verify: { status: 'pending', pipelineResult: null },
      archive: { status: 'pending' },
    },
    metadata: { stateVersion: 0, lastModified: '' },
  };

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-guard-'));
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

  test('open-to-design passes when open is done with proposal', async () => {
    await writeState({
      ...baseState,
      phases: { ...baseState.phases, open: { status: 'done', proposal: 'docs/prop.md' } },
    });
    expect((await guardPhaseTransition('open', 'design')).pass).toBe(true);
  });

  test('open-to-design fails when open is pending', async () => {
    await writeState(baseState);
    expect((await guardPhaseTransition('open', 'design')).pass).toBe(false);
  });

  test('design-to-build passes when design is done with tasks', async () => {
    await writeState({
      ...baseState,
      phases: {
        ...baseState.phases,
        design: { status: 'done', designDoc: 'docs/design.md', tasks: [{ id: 'task-1', title: 'T1', type: 'implementation', files: [], acceptance: ['done'] }] },
      },
    });
    expect((await guardPhaseTransition('design', 'build')).pass).toBe(true);
  });

  test('design-to-build fails when tasks are empty', async () => {
    await writeState({
      ...baseState,
      phases: {
        ...baseState.phases,
        design: { status: 'done', designDoc: 'docs/design.md', tasks: [] },
      },
    });
    expect((await guardPhaseTransition('design', 'build')).pass).toBe(false);
  });

  test('build-to-verify passes when build is done with completed tasks', async () => {
    await writeState({
      ...baseState,
      phases: {
        ...baseState.phases,
        build: { status: 'done', tasks: { 'task-1': { status: 'done' } } },
      },
    });
    expect((await guardPhaseTransition('build', 'verify')).pass).toBe(true);
  });

  test('build-to-verify passes when eccReviewPassed is true', async () => {
    await writeState({
      ...baseState,
      phases: {
        ...baseState.phases,
        build: {
          status: 'done',
          tasks: { 'task-1': { status: 'failed' } },
          eccReviewPassed: true,
        },
      },
    });
    expect((await guardPhaseTransition('build', 'verify')).pass).toBe(true);
  });

  test('verify-to-archive passes when verify is done', async () => {
    await writeState({
      ...baseState,
      phases: { ...baseState.phases, verify: { status: 'done', pipelineResult: {} } },
    });
    expect((await guardPhaseTransition('verify', 'archive')).pass).toBe(true);
  });

  test('unknown transition returns true', async () => {
    await writeState(baseState);
    expect((await guardPhaseTransition('unknown', 'transition')).pass).toBe(true);
  });

  test('design-to-build fails with structured errors for bad tasks', async () => {
    await writeState({
      ...baseState,
      phases: {
        ...baseState.phases,
        design: {
          status: 'done',
          designDoc: 'docs/design.md',
          tasks: [
            { title: 'No ID task', type: 'implementation', files: [], acceptance: [] },
            { id: 'dup', title: 'First', type: 'implementation', files: [], acceptance: [] },
            { id: 'dup', title: 'Second', type: 'implementation', files: [], acceptance: [] },
          ],
        },
      },
    });
    const result = await guardPhaseTransition('design', 'build');
    expect(result.pass).toBe(false);
    expect(result.failures.length).toBeGreaterThan(0);
    const labels = result.failures.map(f => f.label);
    expect(labels).toContain('All tasks have required fields');
  });

  test('build-to-verify passes when non-blocking tasks are skipped', async () => {
    await writeState({
      ...baseState,
      phases: {
        ...baseState.phases,
        build: {
          status: 'done',
          tasks: {
            'task-1': { status: 'done' },
            'task-2': { status: 'skipped', blocking: false },
          },
        },
      },
    });
    expect((await guardPhaseTransition('build', 'verify')).pass).toBe(true);
  });
});
