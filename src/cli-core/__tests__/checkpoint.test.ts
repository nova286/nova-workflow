import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'yaml';
import { checkpointArtifacts, checkpointPhase, checkpointTask } from '../checkpoint';
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
    complianceRefs: {
      projectRules: ['rules.must.0'],
      bestPractices: ['bestPractices.must.0'],
    },
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

  const projectContext = {
    rules: {
      sources: ['AGENTS.md'],
      must: ['Use structured logging'],
      mustNot: ['Use fmt.Println'],
      verificationCommands: ['npm test'],
    },
    bestPractices: {
      projectType: 'node',
      sources: ['package.json'],
      must: ['Keep TypeScript strict'],
      should: ['Keep modules focused'],
      risks: ['ESM interop'],
    },
    conflicts: [],
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
      compliance: {
        followed: ['rules.must.0'],
      },
    });
    await checkpointTask({
      taskId: 'task-one',
      status: 'done',
      filesChanged: ['src/task.ts', 'src/task.test.ts'],
      tests: ['npx tsc --noEmit'],
      traceId: 'trace-2',
      note: 'verified',
      compliance: {
        followed: ['bestPractices.must.0'],
        deviations: [{ ref: 'bestPractices.should.0', reason: 'Existing module boundary forces this placement' }],
      },
    });

    const state = await StateManager.load();
    const result = state.phases.implement.tasks['task-one'];
    expect(result.status).toBe('done');
    expect(result.filesChanged).toEqual(['src/task.ts', 'src/task.test.ts']);
    expect(result.tests).toEqual(['npm test', 'npx tsc --noEmit']);
    expect(result.traceIds).toEqual(['trace-1', 'trace-2']);
    expect(result.notes).toEqual(['verified']);
    expect(result.compliance.followed).toEqual(['rules.must.0', 'bestPractices.must.0']);
    expect(result.compliance.deviations).toEqual([
      { ref: 'bestPractices.should.0', reason: 'Existing module boundary forces this placement' },
    ]);
    expect(result.updatedAt).toBeTruthy();
  });

  test('checkpointTask fails for unknown design task', async () => {
    await writeState(baseState);
    await expect(
      checkpointTask({ taskId: 'missing-task', status: 'done' })
    ).rejects.toThrow('not found');
  });

  test('checkpointArtifacts records test strategy in phase and artifacts', async () => {
    await writeState(baseState);
    const testStrategy = {
      automatedUiTesting: false,
      unitTesting: true,
      unitTestTargets: ['src/task.ts'],
      rationale: 'Core behavior should be covered by unit tests.',
    };

    await checkpointArtifacts({ testStrategy });

    const state = await StateManager.load();
    expect(state.phases.propose.testStrategy).toEqual(testStrategy);
    expect(state.artifacts?.testStrategy).toEqual(testStrategy);
  });

  test('checkpointArtifacts records change mode and legacy preflight', async () => {
    await writeState(baseState);
    const legacyPreflight = {
      required: true,
      performed: true,
      affectedAreas: ['src/task.ts'],
      hasIssues: false,
      rationale: 'Existing module follows project conventions.',
    };

    await checkpointArtifacts({ changeMode: 'existing', legacyPreflight });

    const state = await StateManager.load();
    expect(state.changeMode).toBe('existing');
    expect(state.phases.propose.changeMode).toBe('existing');
    expect(state.artifacts?.changeMode).toBe('existing');
    expect(state.legacyPreflight).toEqual(legacyPreflight);
    expect(state.phases.design.legacyPreflight).toEqual(legacyPreflight);
    expect(state.artifacts?.legacyPreflight).toEqual(legacyPreflight);
  });

  test('checkpointArtifacts records project context contract and artifact path', async () => {
    await writeState(baseState);

    await checkpointArtifacts({
      projectContext,
      projectContextPath: 'docs/project-context.md',
    });

    const state = await StateManager.load();
    expect(state.projectContext?.rules.must).toEqual(['Use structured logging']);
    expect(state.projectContext?.updatedAt).toBeTruthy();
    expect(state.artifacts?.projectContext).toBe('docs/project-context.md');
  });

  test('checkpointArtifacts records verify compliance verdicts', async () => {
    await writeState(baseState);

    await checkpointArtifacts({
      verificationReport: 'docs/reports/verification-report.md',
      projectRulesVerdict: 'PASS',
      bestPracticesVerdict: { status: 'PASS', deviations: [] },
      reviewIndependence: { mode: 'subagent', agent: 'codex-reviewer', traceId: 'review-1' },
      verificationCommands: [{ command: 'npm test', status: 'PASS', exitCode: 0 }],
    });

    const state = await StateManager.load();
    expect(state.artifacts?.verificationReport).toBe('docs/reports/verification-report.md');
    expect(state.phases.verify.projectRulesVerdict).toBe('PASS');
    expect(state.phases.verify.bestPracticesVerdict).toEqual({ status: 'PASS', deviations: [] });
    expect(state.phases.verify.reviewIndependence).toEqual({
      mode: 'subagent',
      agent: 'codex-reviewer',
      traceId: 'review-1',
    });
    expect(state.phases.verify.verificationCommands).toEqual([
      { command: 'npm test', status: 'PASS', exitCode: 0 },
    ]);
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
