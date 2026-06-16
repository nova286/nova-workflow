import { TestStrategy } from './types';

export interface UnitTargetsCompatibilityResult {
  normalized: TestStrategy;
  hadUnitTargetsField: boolean;
  migratedFromUnitTargets: boolean;
}

export function normalizeUnitTestTargetsForStrategy(strategy: TestStrategy): UnitTargetsCompatibilityResult {
  const strategyRecord = strategy as unknown as Record<string, unknown>;
  const hadUnitTargetsField = Object.prototype.hasOwnProperty.call(strategyRecord, 'unitTargets');
  const hasUnitTestTargets = Array.isArray(strategy.unitTestTargets) && strategy.unitTestTargets.length > 0;
  if (!hadUnitTargetsField || hasUnitTestTargets) {
    return {
      normalized: strategy,
      hadUnitTargetsField,
      migratedFromUnitTargets: false,
    };
  }

  const rawLegacyTargets = Array.isArray(strategyRecord.unitTargets) ? strategyRecord.unitTargets : [];
  const legacyTargets = rawLegacyTargets.filter((target: unknown): target is string => typeof target === 'string');
  if (legacyTargets.length === 0) {
    return {
      normalized: strategy,
      hadUnitTargetsField,
      migratedFromUnitTargets: false,
    };
  }

  const { unitTargets: _removed, ...rest } = strategy as TestStrategy & { unitTargets?: string[] };
  return {
    normalized: {
      ...rest,
      unitTestTargets: legacyTargets,
    },
    hadUnitTargetsField: true,
    migratedFromUnitTargets: true,
  };
}
