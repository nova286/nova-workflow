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
});
