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
    expect(result.normalized.uiFidelityTesting).toBe(false);
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
    expect(result.normalized.uiFidelityTesting).toBe(false);
  });

  test('preserves explicit UI fidelity testing selection', () => {
    const strategy = {
      automatedUiTesting: false,
      unitTesting: false,
      uiFidelityTesting: true,
      uiFidelityTargets: [{
        name: 'Home screen visual match',
        designRef: 'figma://home',
        routeOrScreen: 'HomeViewController',
      }],
    } as any;

    const result = normalizeUnitTestTargetsForStrategy(strategy);
    expect(result.normalized.uiFidelityTesting).toBe(true);
    expect(result.normalized.uiFidelityTargets).toEqual(strategy.uiFidelityTargets);
  });
});
