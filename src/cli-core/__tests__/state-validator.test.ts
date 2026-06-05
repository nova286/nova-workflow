import { validateState } from '../state-validator';

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

const validTask = {
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

describe('validateState', () => {
  test('passes a freshly initialized state', () => {
    const result = validateState(baseState);
    expect(result.pass).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('fails invalid phase status', () => {
    const result = validateState({
      ...baseState,
      phases: {
        ...baseState.phases,
        design: { status: 'complete', designDoc: '', tasks: [] },
      },
    });

    expect(result.pass).toBe(false);
    expect(result.errors.some(e => e.code === 'phase.status.invalid')).toBe(true);
  });

  test('fails when design is done without tasks', () => {
    const result = validateState({
      ...baseState,
      phases: {
        ...baseState.phases,
        design: { status: 'done', designDoc: 'docs/design.md', tasks: [] },
      },
    });

    expect(result.pass).toBe(false);
    expect(result.errors.some(e => e.code === 'design.tasks.empty')).toBe(true);
  });

  test('fails invalid design task schema', () => {
    const result = validateState({
      ...baseState,
      phases: {
        ...baseState.phases,
        design: {
          status: 'done',
          designDoc: 'docs/design.md',
          tasks: [{ id: 'Bad_Task', title: 'Bad', type: 'implementation', files: [], acceptance: [] }],
        },
      },
    });

    expect(result.pass).toBe(false);
    expect(result.errors.some(e => e.code === 'task.id.invalid')).toBe(true);
    expect(result.errors.some(e => e.code === 'task.files.invalid')).toBe(true);
  });

  test('fails when implement is done without task evidence', () => {
    const result = validateState({
      ...baseState,
      phases: {
        ...baseState.phases,
        design: {
          status: 'done',
          designDoc: 'docs/design.md',
          tasks: [validTask],
        },
        implement: {
          status: 'done',
          tasks: { 'task-one': { status: 'done' } },
        },
      },
    });

    expect(result.pass).toBe(false);
    expect(result.errors.some(e => e.code === 'implement.task.evidence.missing')).toBe(true);
  });

  test('fails when propose is done without test strategy', () => {
    const result = validateState({
      ...baseState,
      phases: {
        ...baseState.phases,
        propose: {
          status: 'done',
          proposal: 'docs/proposal.md',
        },
      },
    }, { checkFiles: false });

    expect(result.pass).toBe(false);
    expect(result.errors.some(e => e.code === 'test-strategy.missing')).toBe(true);
  });

  test('fails when test strategy is malformed', () => {
    const result = validateState({
      ...baseState,
      phases: {
        ...baseState.phases,
        propose: {
          status: 'done',
          proposal: 'docs/proposal.md',
          testStrategy: {
            automatedUiTesting: 'true',
            unitTesting: undefined,
          },
        },
      },
    }, { checkFiles: false });

    expect(result.pass).toBe(false);
    expect(result.errors.filter(e => e.code === 'test-strategy.invalid')).toHaveLength(2);
  });

  test('fails when automated UI testing is selected without UI flow', () => {
    const result = validateState({
      ...baseState,
      phases: {
        ...baseState.phases,
        propose: {
          status: 'done',
          proposal: 'docs/proposal.md',
          testStrategy: { automatedUiTesting: true, unitTesting: false },
        },
      },
    }, { checkFiles: false });

    expect(result.pass).toBe(false);
    expect(result.errors.some(e => e.code === 'test-strategy.ui-flow.missing')).toBe(true);
  });

  test('fails when unit testing is selected but design has no unit command', () => {
    const result = validateState({
      ...baseState,
      phases: {
        ...baseState.phases,
        propose: {
          status: 'done',
          proposal: 'docs/proposal.md',
          testStrategy: {
            automatedUiTesting: false,
            unitTesting: true,
            unitTestTargets: ['src/task.ts'],
          },
        },
        design: {
          status: 'done',
          designDoc: 'docs/design.md',
          tasks: [{ ...validTask, verification: { commands: ['npx tsc --noEmit'] } }],
        },
      },
    }, { checkFiles: false });

    expect(result.pass).toBe(false);
    expect(result.errors.some(e => e.code === 'test-strategy.unit-command.missing')).toBe(true);
  });

  test('does not count UI automation commands as unit test commands', () => {
    const result = validateState({
      ...baseState,
      phases: {
        ...baseState.phases,
        propose: {
          status: 'done',
          proposal: 'docs/proposal.md',
          testStrategy: {
            automatedUiTesting: false,
            unitTesting: true,
            unitTestTargets: ['src/task.ts'],
          },
        },
        design: {
          status: 'done',
          designDoc: 'docs/design.md',
          tasks: [{
            ...validTask,
            type: 'testing',
            verification: { commands: ['npx playwright test login'] },
          }],
        },
      },
    }, { checkFiles: false });

    expect(result.pass).toBe(false);
    expect(result.errors.some(e => e.code === 'test-strategy.unit-command.missing')).toBe(true);
  });

  test('does not force test tasks when no test strategy is selected', () => {
    const result = validateState({
      ...baseState,
      phases: {
        ...baseState.phases,
        propose: {
          status: 'done',
          proposal: 'docs/proposal.md',
          testStrategy: {
            automatedUiTesting: false,
            unitTesting: false,
            rationale: 'Small docs-only change.',
          },
        },
        design: {
          status: 'done',
          designDoc: 'docs/design.md',
          tasks: [{ ...validTask, verification: { commands: ['npx tsc --noEmit'] } }],
        },
      },
    }, { checkFiles: false });

    expect(result.errors.some(e => e.code.startsWith('test-strategy.'))).toBe(false);
  });

  test('passes selected UI and unit testing when flows and commands exist', () => {
    const result = validateState({
      ...baseState,
      phases: {
        ...baseState.phases,
        propose: {
          status: 'done',
          proposal: 'docs/proposal.md',
          testStrategy: {
            automatedUiTesting: true,
            unitTesting: true,
            unitTestTargets: ['src/task.ts'],
            uiFlows: [{
              name: 'Login happy path',
              entryPoint: '/login',
              routeOrScreen: 'LoginScreen',
              steps: ['Open login', 'Submit credentials'],
              expectedResult: 'Dashboard is shown',
              requiresMobileMcp: true,
            }],
          },
        },
        design: {
          status: 'done',
          designDoc: 'docs/design.md',
          tasks: [
            validTask,
            {
              id: 'ui-flow',
              title: 'Automate UI flow',
              type: 'testing',
              method: 'tdd',
              files: [{ path: 'tests/login.e2e.ts', action: 'create' }],
              specRefs: ['spec.ui'],
              acceptanceRefs: ['accept.ui'],
              acceptance: ['Flow passes'],
              verification: { commands: ['npx playwright test login'] },
            },
          ],
        },
      },
    }, { checkFiles: false });

    expect(result.errors.filter(e => e.code.startsWith('test-strategy.'))).toEqual([]);
  });
});
