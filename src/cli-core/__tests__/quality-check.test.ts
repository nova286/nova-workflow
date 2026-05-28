import {
  validateTaskSchema,
  validateTaskIds,
  validateAcceptance,
  validateFiles,
  QualityReport,
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
});
