import { normalizeUnitTestTargetsForStrategy } from '../test-strategy';

describe('normalizeUnitTestTargetsForStrategy', () => {
  test('prefers unitTestTargets when present', () => {
    const strategy = {
      automatedUiTesting: false,
      unitTesting: true,
      unitTestTargets: ['src/new.ts'],
      unitTargets: ['src/legacy.ts'],
    } as any;

    const result = normalizeUnitTestTargetsForStrategy(strategy);
    expect(result.hadUnitTargetsField).toBe(true);
    expect(result.migratedFromUnitTargets).toBe(false);
    expect(result.normalized.unitTestTargets).toEqual(['src/new.ts']);
    expect(result.normalized).toHaveProperty('unitTargets');
  });

  test('migrates unitTargets into unitTestTargets when legacy field is used', () => {
    const strategy = {
      automatedUiTesting: false,
      unitTesting: true,
      unitTargets: ['src/legacy.ts'],
    } as any;

    const result = normalizeUnitTestTargetsForStrategy(strategy);
    expect(result.hadUnitTargetsField).toBe(true);
    expect(result.migratedFromUnitTargets).toBe(true);
    expect(result.normalized.unitTargets).toBeUndefined();
    expect(result.normalized.unitTestTargets).toEqual(['src/legacy.ts']);
  });
});
