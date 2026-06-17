import {
  validateTaskSchema,
  validateTaskIds,
  validateAcceptance,
  validateFiles,
  validateSpecBoundExecution,
  validateTaskGranularity,
} from '../quality-check';

describe('validateTaskSchema', () => {
  test('passes when all tasks have required fields', () => {
    const tasks = [
      { id: 'task-1', title: 'Do thing', type: 'implementation', files: [{ path: 'x.ts', action: 'create' }], acceptance: ['Works'] },
    ];
    expect(validateTaskSchema(tasks).pass).toBe(true);
  });

  test('fails when a task is missing id', () => {
    const tasks = [
      { title: 'No ID', type: 'implementation', files: [], acceptance: [] },
    ];
    const r = validateTaskSchema(tasks);
    expect(r.pass).toBe(false);
    expect(r.errors.some(e => e.includes('missing') && e.includes('id'))).toBe(true);
  });

  test('fails when a task is missing files', () => {
    const tasks = [
      { id: 't1', title: 'X', type: 'implementation', acceptance: ['Works'] },
    ];
    const r = validateTaskSchema(tasks);
    expect(r.pass).toBe(false);
    expect(r.errors.some(e => e.includes('files'))).toBe(true);
  });

  test('fails when a task is missing acceptance', () => {
    const tasks = [
      { id: 't1', title: 'X', type: 'implementation', files: [{ path: 'x.ts', action: 'create' }] },
    ];
    const r = validateTaskSchema(tasks);
    expect(r.pass).toBe(false);
    expect(r.errors.some(e => e.includes('acceptance'))).toBe(true);
  });

  test('reports all failing tasks', () => {
    const tasks = [
      { title: 'No ID 1', type: 'implementation', files: [], acceptance: [] },
      { title: 'No ID 2', type: 'testing', files: [], acceptance: [] },
    ];
    const r = validateTaskSchema(tasks);
    expect(r.pass).toBe(false);
    expect(r.errors.length).toBe(2);
  });

  test('fails when a task is missing title', () => {
    const tasks = [
      { id: 't1', type: 'implementation', files: [{ path: 'x.ts', action: 'create' }], acceptance: ['Works'] },
    ];
    const r = validateTaskSchema(tasks);
    expect(r.pass).toBe(false);
    expect(r.errors.some(e => e.includes('missing') && e.includes('title'))).toBe(true);
  });

  test('fails when a task is missing type', () => {
    const tasks = [
      { id: 't1', title: 'X', files: [{ path: 'x.ts', action: 'create' }], acceptance: ['Works'] },
    ];
    const r = validateTaskSchema(tasks);
    expect(r.pass).toBe(false);
    expect(r.errors.some(e => e.includes('missing') && e.includes('type'))).toBe(true);
  });
});

describe('validateTaskIds', () => {
  test('passes when all ids are unique kebab-case', () => {
    const tasks = [
      { id: 'task-one' }, { id: 'task-two' }, { id: 'task-3' },
    ];
    expect(validateTaskIds(tasks).pass).toBe(true);
  });

  test('fails on duplicate ids', () => {
    const tasks = [
      { id: 'task-one' }, { id: 'task-one' },
    ];
    const r = validateTaskIds(tasks);
    expect(r.pass).toBe(false);
    expect(r.errors[0]).toContain('duplicate');
  });

  test('fails on non-kebab-case ids', () => {
    const tasks = [
      { id: 'task_one' }, { id: 'TaskTwo' },
    ];
    const r = validateTaskIds(tasks);
    expect(r.pass).toBe(false);
    expect(r.errors.length).toBe(2);
  });
});

describe('validateAcceptance', () => {
  test('passes when all tasks have non-empty acceptance arrays', () => {
    const tasks = [
      { id: 't1', acceptance: ['Must work'] },
      { id: 't2', acceptance: ['A', 'B'] },
    ];
    expect(validateAcceptance(tasks).pass).toBe(true);
  });

  test('fails when acceptance is empty array', () => {
    const tasks = [
      { id: 't1', acceptance: [] },
    ];
    const r = validateAcceptance(tasks);
    expect(r.pass).toBe(false);
    expect(r.errors[0]).toContain('empty');
  });

  test('fails when acceptance is missing', () => {
    const tasks = [{ id: 't1' }];
    const r = validateAcceptance(tasks);
    expect(r.pass).toBe(false);
    expect(r.errors[0]).toContain('missing');
  });
});

describe('validateFiles', () => {
  test('passes when all tasks have files with path and action', () => {
    const tasks = [
      { id: 't1', files: [{ path: 'a.ts', action: 'create' }] },
    ];
    expect(validateFiles(tasks).pass).toBe(true);
  });

  test('fails when files is empty', () => {
    const tasks = [{ id: 't1', files: [] }];
    const r = validateFiles(tasks);
    expect(r.pass).toBe(false);
    expect(r.errors[0]).toContain('empty');
  });

  test('fails when a file entry is missing action', () => {
    const tasks = [
      { id: 't1', files: [{ path: 'a.ts' }] },
    ];
    const r = validateFiles(tasks);
    expect(r.pass).toBe(false);
    expect(r.errors[0]).toContain('action');
  });

  test('fails when a file entry is missing path', () => {
    const tasks = [
      { id: 't1', files: [{ action: 'create' }] },
    ];
    const r = validateFiles(tasks);
    expect(r.pass).toBe(false);
    expect(r.errors[0]).toContain('path');
  });
});

describe('validateSpecBoundExecution', () => {
  test('passes when implementation tasks have all required fields', () => {
    const tasks = [
      {
        id: 't1', title: 'T', type: 'implementation', method: 'tdd',
        specRefs: ['s1'], acceptanceRefs: ['a1'],
        verification: { commands: ['npm test'] },
        files: [{ path: 'x.ts', action: 'create' }], acceptance: ['ok'],
      },
    ];
    expect(validateSpecBoundExecution(tasks).pass).toBe(true);
  });

  test('fails when method is missing', () => {
    const tasks = [
      {
        id: 't1', title: 'T', type: 'implementation',
        specRefs: ['s1'], acceptanceRefs: ['a1'],
        verification: { commands: ['npm test'] },
        files: [{ path: 'x.ts', action: 'create' }], acceptance: ['ok'],
      },
    ];
    const r = validateSpecBoundExecution(tasks);
    expect(r.pass).toBe(false);
    expect(r.errors[0]).toContain('method');
  });

  test('fails when specRefs is missing', () => {
    const tasks = [
      {
        id: 't1', title: 'T', type: 'implementation', method: 'tdd',
        acceptanceRefs: ['a1'], verification: { commands: ['npm test'] },
        files: [{ path: 'x.ts', action: 'create' }], acceptance: ['ok'],
      },
    ];
    const r = validateSpecBoundExecution(tasks);
    expect(r.pass).toBe(false);
    expect(r.errors[0]).toContain('specRefs');
    expect(r.errors[0]).toContain('OpenSpec requirement ids');
  });

  test('skips non-implementation tasks', () => {
    const tasks = [
      { id: 't1', title: 'T', type: 'design', files: [], acceptance: ['ok'] },
    ];
    expect(validateSpecBoundExecution(tasks).pass).toBe(true);
  });
});

describe('validateTaskGranularity', () => {
  test('always passes (warnings only)', () => {
    const tasks = [
      {
        id: 't1', type: 'implementation',
        files: Array.from({ length: 15 }, (_, i) => ({ path: `src/f${i}.ts`, action: 'create' })),
      },
    ];
    const r = validateTaskGranularity(tasks);
    expect(r.pass).toBe(true);
  });

  test('warns when single task has too many files', () => {
    const tasks = [
      {
        id: 't1', type: 'implementation',
        files: Array.from({ length: 12 }, (_, i) => ({ path: `src/f${i}.ts`, action: 'create' })),
      },
    ];
    const r = validateTaskGranularity(tasks);
    expect(r.warnings!.length).toBeGreaterThan(0);
    expect(r.warnings![0]).toContain('12 files');
  });

  test('warns when single task spans multiple top-level directories', () => {
    const tasks = [
      {
        id: 't1', type: 'implementation',
        files: [
          { path: 'ios/App.swift', action: 'create' },
          { path: 'android/Main.kt', action: 'create' },
          { path: 'shared/core.ts', action: 'create' },
          { path: 'web/index.html', action: 'create' },
        ],
      },
    ];
    const r = validateTaskGranularity(tasks);
    expect(r.warnings!.some(w => w.includes('top-level directories'))).toBe(true);
  });

  test('no warnings when tasks are well-split', () => {
    const tasks = [
      {
        id: 'setup-shared', type: 'implementation',
        files: [{ path: 'shared/core.ts', action: 'create' }],
      },
      {
        id: 'implement-ios', type: 'implementation',
        files: [{ path: 'ios/App.swift', action: 'create' }],
      },
      {
        id: 'implement-android', type: 'implementation',
        files: [{ path: 'android/Main.kt', action: 'create' }],
      },
    ];
    const r = validateTaskGranularity(tasks);
    expect(r.warnings!.length).toBe(0);
  });
});
