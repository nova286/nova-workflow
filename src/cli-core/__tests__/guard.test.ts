import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as yaml from 'yaml';
import { guardPhaseTransition, canReEnterPhase } from '../guard';

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
      implement: { status: 'pending', tasks: {} },
      verify: { status: 'pending', pipelineResult: null },
      archive: { status: 'pending' },
    },
    metadata: { stateVersion: 0, lastModified: '' },
  };

  const noExtraTestStrategy = {
    automatedUiTesting: false,
    unitTesting: false,
    rationale: 'No additional test automation selected for this fixture.',
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

  async function writeCoreArtifacts() {
    await fs.mkdir('docs', { recursive: true });
    await fs.writeFile('docs/prop.md', '# Proposal', 'utf-8');
    await fs.writeFile('docs/design.md', '# Design', 'utf-8');
  }

  test('open-to-design passes when open is done with proposal', async () => {
    await writeCoreArtifacts();
    await writeState({
      ...baseState,
      activeChange: 'change-one',
      artifacts: { specDelta: '.openspec/changes/change-one/specs/example/spec.md' },
      phases: {
        ...baseState.phases,
        propose: { status: 'done', proposal: 'docs/prop.md', testStrategy: noExtraTestStrategy },
      },
    });
    expect((await guardPhaseTransition('propose', 'design')).pass).toBe(true);
  });

  test('open-to-design fails when open is pending', async () => {
    await writeState(baseState);
    expect((await guardPhaseTransition('propose', 'design')).pass).toBe(false);
  });

  test('design-to-build passes when design is done with tasks', async () => {
    await writeCoreArtifacts();
    await writeState({
      ...baseState,
      phases: {
        ...baseState.phases,
        design: {
          status: 'done',
          designDoc: 'docs/design.md',
          tasks: [
            {
              id: 'task-1',
              title: 'T1',
              type: 'implementation',
              method: 'tdd',
              specRefs: ['workflow.requirements.task-1'],
              acceptanceRefs: ['workflow.acceptance.task-1'],
              verification: { commands: ['npm test -- task-1'] },
              files: [{ path: 'x.ts', action: 'create' }],
              acceptance: ['done'],
            },
          ],
        },
      },
    });
    expect((await guardPhaseTransition('design', 'implement')).pass).toBe(true);
  });

  test('design-to-build fails when tasks are empty', async () => {
    await writeState({
      ...baseState,
      phases: {
        ...baseState.phases,
        design: { status: 'done', designDoc: 'docs/design.md', tasks: [] },
      },
    });
    expect((await guardPhaseTransition('design', 'implement')).pass).toBe(false);
  });

  test('design-to-build fails when implementation task lacks spec-bound execution metadata', async () => {
    await writeState({
      ...baseState,
      phases: {
        ...baseState.phases,
        design: {
          status: 'done',
          designDoc: 'docs/design.md',
          tasks: [
            {
              id: 'task-1',
              title: 'T1',
              type: 'implementation',
              files: [{ path: 'x.ts', action: 'create' }],
              acceptance: ['done'],
            },
          ],
        },
      },
    });

    const result = await guardPhaseTransition('design', 'implement');

    expect(result.pass).toBe(false);
    expect(result.failures.map(f => f.label)).toContain('Implementation tasks are spec-bound');
  });

  test('build-to-verify passes when build is done with completed tasks', async () => {
    await writeState({
      ...baseState,
      phases: {
        ...baseState.phases,
        implement: { status: 'done', tasks: { 'task-1': { status: 'done' } } },
      },
    });
    expect((await guardPhaseTransition('implement', 'verify')).pass).toBe(true);
  });

  test('build-to-verify passes when eccReviewPassed is true', async () => {
    await writeState({
      ...baseState,
      phases: {
        ...baseState.phases,
        implement: {
          status: 'done',
          tasks: { 'task-1': { status: 'failed' } },
          eccReviewPassed: true,
        },
      },
    });
    expect((await guardPhaseTransition('implement', 'verify')).pass).toBe(true);
  });

  test('verify-to-archive passes when verify is done', async () => {
    await writeState({
      ...baseState,
      phases: { ...baseState.phases, verify: { status: 'done', pipelineResult: {} } },
    });
    expect((await guardPhaseTransition('verify', 'archive')).pass).toBe(true);
  });

  test('unknown transition fails', async () => {
    await writeState(baseState);
    const result = await guardPhaseTransition('unknown', 'transition');
    expect(result.pass).toBe(false);
    expect(result.failures[0].label).toContain('Unknown transition');
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
    const result = await guardPhaseTransition('design', 'implement');
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
        implement: {
          status: 'done',
          tasks: {
            'task-1': { status: 'done' },
            'task-2': { status: 'skipped', blocking: false },
          },
        },
      },
    });
    expect((await guardPhaseTransition('implement', 'verify')).pass).toBe(true);
  });
});

describe('canReEnterPhase', () => {
  let testDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-reenter-'));
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

  test('allows re-entry when phase is not done', async () => {
    await writeState({
      version: 1,
      project: 'test',
      environment: [],
      phases: {
        implement: { status: 'in-progress', tasks: {} },
      },
      metadata: { stateVersion: 0, lastModified: '' },
    });
    const result = await canReEnterPhase('implement');
    expect(result.allowed).toBe(true);
  });

  test('blocks re-entry when phase is done', async () => {
    await writeState({
      version: 1,
      project: 'test',
      environment: [],
      phases: {
        implement: { status: 'done', completedAt: '2026-06-01T10:00:00.000Z', tasks: {} },
      },
      metadata: { stateVersion: 0, lastModified: '' },
    });
    const result = await canReEnterPhase('implement');
    expect(result.allowed).toBe(false);
    expect(result.message).toContain('already done');
    expect(result.message).toContain('2026-06-01');
  });

  test('allows re-entry when phase does not exist', async () => {
    await writeState({
      version: 1,
      project: 'test',
      environment: [],
      phases: {},
      metadata: { stateVersion: 0, lastModified: '' },
    });
    const result = await canReEnterPhase('nonexistent');
    expect(result.allowed).toBe(true);
  });
});
