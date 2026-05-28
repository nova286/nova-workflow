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
    expect(await guardPhaseTransition('open', 'design')).toBe(true);
  });

  test('open-to-design fails when open is pending', async () => {
    await writeState(baseState);
    expect(await guardPhaseTransition('open', 'design')).toBe(false);
  });

  test('design-to-build passes when design is done with tasks', async () => {
    await writeState({
      ...baseState,
      phases: {
        ...baseState.phases,
        design: { status: 'done', designDoc: 'docs/design.md', tasks: [{ id: '1' }] },
      },
    });
    expect(await guardPhaseTransition('design', 'build')).toBe(true);
  });

  test('design-to-build fails when tasks are empty', async () => {
    await writeState({
      ...baseState,
      phases: {
        ...baseState.phases,
        design: { status: 'done', designDoc: 'docs/design.md', tasks: [] },
      },
    });
    expect(await guardPhaseTransition('design', 'build')).toBe(false);
  });

  test('build-to-verify passes when build is done with completed tasks', async () => {
    await writeState({
      ...baseState,
      phases: {
        ...baseState.phases,
        build: { status: 'done', tasks: { 'task-1': { status: 'done' } } },
      },
    });
    expect(await guardPhaseTransition('build', 'verify')).toBe(true);
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
    expect(await guardPhaseTransition('build', 'verify')).toBe(true);
  });

  test('verify-to-archive passes when verify is done', async () => {
    await writeState({
      ...baseState,
      phases: { ...baseState.phases, verify: { status: 'done', pipelineResult: {} } },
    });
    expect(await guardPhaseTransition('verify', 'archive')).toBe(true);
  });

  test('unknown transition returns true', async () => {
    await writeState(baseState);
    expect(await guardPhaseTransition('unknown', 'transition')).toBe(true);
  });
});
