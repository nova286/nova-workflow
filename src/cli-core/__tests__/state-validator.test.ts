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
  complianceRefs: {
    projectRules: ['rules.must.0'],
    bestPractices: ['bestPractices.must.0'],
  },
};

const validProjectContext = {
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
    should: ['Prefer focused modules'],
    risks: ['Runtime ESM interop'],
  },
  conflicts: [],
};

const passingVerificationCommands = [
  { command: 'npm test', status: 'PASS' },
];

const noExtraTestStrategy = {
  automatedUiTesting: false,
  unitTesting: false,
  rationale: 'No additional test automation selected.',
};

const validLegacyPreflight = {
  required: true,
  performed: true,
  affectedAreas: ['src/task.ts'],
  hasIssues: true,
  issues: [{
    area: 'src/task.ts',
    finding: 'Module mixes validation and persistence concerns.',
    severity: 'medium',
    recommendation: 'Extract validation touched by this change.',
  }],
  refactorPolicy: 'minimal',
  userDecision: '做最小必要重构，只处理会阻塞本次需求的部分',
  rationale: 'Only blockers should be refactored in this change.',
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

  test('keeps legacy design-done states valid by default when projectContext is absent', () => {
    const result = validateState({
      ...baseState,
      phases: {
        ...baseState.phases,
        design: {
          status: 'done',
          designDoc: 'docs/design.md',
          tasks: [validTask],
        },
      },
    }, { checkFiles: false });

    expect(result.errors.some(e => e.code === 'project-context.missing')).toBe(false);
  });

  test('fails design completion without projectContext when required', () => {
    const result = validateState({
      ...baseState,
      phases: {
        ...baseState.phases,
        design: {
          status: 'done',
          designDoc: 'docs/design.md',
          tasks: [validTask],
        },
      },
    }, { checkFiles: false, requireProjectContext: true });

    expect(result.pass).toBe(false);
    expect(result.errors.some(e => e.code === 'project-context.missing')).toBe(true);
  });

  test('passes valid projectContext contract when required', () => {
    const result = validateState({
      ...baseState,
      projectContext: validProjectContext,
      phases: {
        ...baseState.phases,
        design: {
          status: 'done',
          designDoc: 'docs/design.md',
          tasks: [validTask],
        },
      },
    }, { checkFiles: false, requireProjectContext: true });

    expect(result.errors.filter(e => e.code.startsWith('project-context.'))).toEqual([]);
    expect(result.errors.filter(e => e.code === 'task.compliance-refs.missing')).toEqual([]);
  });

  test('fails malformed projectContext schema', () => {
    const result = validateState({
      ...baseState,
      projectContext: {
        rules: { sources: [], must: 'nope', mustNot: [], verificationCommands: [] },
        bestPractices: { projectType: '', sources: [], must: [], should: [], risks: [] },
      },
      phases: {
        ...baseState.phases,
        design: {
          status: 'done',
          designDoc: 'docs/design.md',
          tasks: [validTask],
        },
      },
    }, { checkFiles: false, requireProjectContext: true });

    expect(result.pass).toBe(false);
    expect(result.errors.some(e => e.code === 'project-context.rules.invalid')).toBe(true);
    expect(result.errors.some(e => e.code === 'project-context.best-practices.project-type.missing')).toBe(true);
  });

  test('explains required projectContext conflict fields and resolution values', () => {
    const result = validateState({
      ...baseState,
      projectContext: {
        ...validProjectContext,
        conflicts: [{
          projectRule: 'Follow local AGENTS.md',
          bestPractice: 'Use framework default',
          rationale: 'Local rule is stricter',
        }],
      },
      phases: {
        ...baseState.phases,
        design: {
          status: 'done',
          designDoc: 'docs/design.md',
          tasks: [validTask],
        },
      },
    }, { checkFiles: false, requireProjectContext: true });

    const resolutionError = result.errors.find(e => e.path === 'projectContext.conflicts.0.resolution');
    expect(resolutionError?.message).toContain('project-rule | best-practice | case-by-case');
  });

  test('fails implementation task missing complianceRefs when projectContext is required', () => {
    const taskWithoutRefs = { ...validTask, complianceRefs: undefined };
    const result = validateState({
      ...baseState,
      projectContext: validProjectContext,
      phases: {
        ...baseState.phases,
        design: {
          status: 'done',
          designDoc: 'docs/design.md',
          tasks: [taskWithoutRefs],
        },
      },
    }, { checkFiles: false, requireProjectContext: true });

    expect(result.pass).toBe(false);
    expect(result.errors.some(e => e.code === 'task.compliance-refs.missing')).toBe(true);
  });

  test('fails implement done without compliance evidence when projectContext exists', () => {
    const result = validateState({
      ...baseState,
      projectContext: validProjectContext,
      phases: {
        ...baseState.phases,
        design: {
          status: 'done',
          designDoc: 'docs/design.md',
          tasks: [validTask],
        },
        implement: {
          status: 'done',
          tasks: { 'task-one': { status: 'done', filesChanged: ['src/task.ts'] } },
        },
      },
    }, { checkFiles: false });

    expect(result.pass).toBe(false);
    expect(result.errors.some(e => e.code === 'implement.task.compliance.missing')).toBe(true);
  });

  test('fails verify done without project rules and best-practice verdicts', () => {
    const result = validateState({
      ...baseState,
      projectContext: validProjectContext,
      phases: {
        ...baseState.phases,
        verify: { status: 'done', pipelineResult: {} },
      },
    }, { checkFiles: false });

    expect(result.pass).toBe(false);
    expect(result.errors.filter(e => e.code === 'verify.compliance-verdict.missing')).toHaveLength(2);
  });

  test('fails verify done when compliance verdict requests changes', () => {
    const result = validateState({
      ...baseState,
      projectContext: validProjectContext,
      phases: {
        ...baseState.phases,
        verify: {
          status: 'done',
          pipelineResult: {},
          projectRulesVerdict: 'PASS',
          bestPracticesVerdict: { status: 'CHANGES_REQUESTED', deviations: [{ ref: 'bestPractices.must.0', reason: 'Convenience only', accepted: false }] },
        },
      },
    }, { checkFiles: false });

    expect(result.pass).toBe(false);
    expect(result.errors.some(e => e.code === 'verify.compliance-verdict.failed')).toBe(true);
  });

  test('fails verify done without review independence record when projectContext exists', () => {
    const result = validateState({
      ...baseState,
      projectContext: validProjectContext,
      phases: {
        ...baseState.phases,
        verify: {
          status: 'done',
          pipelineResult: {},
          projectRulesVerdict: 'PASS',
          bestPracticesVerdict: 'PASS',
          verificationCommands: passingVerificationCommands,
        },
      },
    }, { checkFiles: false });

    expect(result.pass).toBe(false);
    expect(result.errors.some(e => e.code === 'verify.review-independence.missing')).toBe(true);
  });

  test('fails same-session fallback review without rationale', () => {
    const result = validateState({
      ...baseState,
      projectContext: validProjectContext,
      phases: {
        ...baseState.phases,
        verify: {
          status: 'done',
          pipelineResult: {},
          projectRulesVerdict: 'PASS',
          bestPracticesVerdict: 'PASS',
          reviewIndependence: { mode: 'same-session-fallback' },
          verificationCommands: passingVerificationCommands,
        },
      },
    }, { checkFiles: false });

    expect(result.pass).toBe(false);
    expect(result.errors.some(e => e.code === 'verify.review-independence.rationale.missing')).toBe(true);
  });

  test('passes verify done with independent subagent review record', () => {
    const result = validateState({
      ...baseState,
      projectContext: validProjectContext,
      phases: {
        ...baseState.phases,
        verify: {
          status: 'done',
          pipelineResult: {},
          projectRulesVerdict: 'PASS',
          bestPracticesVerdict: 'PASS',
          reviewIndependence: { mode: 'subagent', agent: 'codex-reviewer', traceId: 'review-1' },
          verificationCommands: passingVerificationCommands,
        },
      },
    }, { checkFiles: false });

    expect(result.errors.filter(e => e.code.startsWith('verify.review-independence'))).toEqual([]);
    expect(result.errors.filter(e => e.code.startsWith('verify.commands'))).toEqual([]);
  });

  test('fails verify done without required verification command results', () => {
    const result = validateState({
      ...baseState,
      projectContext: validProjectContext,
      phases: {
        ...baseState.phases,
        verify: {
          status: 'done',
          pipelineResult: {},
          projectRulesVerdict: 'PASS',
          bestPracticesVerdict: 'PASS',
          reviewIndependence: { mode: 'subagent', agent: 'codex-reviewer' },
        },
      },
    }, { checkFiles: false });

    expect(result.pass).toBe(false);
    expect(result.errors.some(e => e.code === 'verify.commands.missing')).toBe(true);
  });

  test('fails verify done when required verification command fails', () => {
    const result = validateState({
      ...baseState,
      projectContext: validProjectContext,
      phases: {
        ...baseState.phases,
        verify: {
          status: 'done',
          pipelineResult: {},
          projectRulesVerdict: 'PASS',
          bestPracticesVerdict: 'PASS',
          reviewIndependence: { mode: 'subagent', agent: 'codex-reviewer' },
          verificationCommands: [{ command: 'npm test', status: 'FAIL', exitCode: 1 }],
        },
      },
    }, { checkFiles: false });

    expect(result.pass).toBe(false);
    expect(result.errors.some(e => e.code === 'verify.commands.failed')).toBe(true);
  });

  test('fails verify done when required verification command is skipped', () => {
    const result = validateState({
      ...baseState,
      projectContext: validProjectContext,
      phases: {
        ...baseState.phases,
        verify: {
          status: 'done',
          pipelineResult: {},
          projectRulesVerdict: 'PASS',
          bestPracticesVerdict: 'PASS',
          reviewIndependence: { mode: 'subagent', agent: 'codex-reviewer' },
          verificationCommands: [{ command: 'npm test', status: 'SKIPPED', rationale: 'CI unavailable' }],
        },
      },
    }, { checkFiles: false });

    expect(result.pass).toBe(false);
    expect(result.errors.some(e => e.code === 'verify.commands.failed')).toBe(true);
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

  test('fails when propose is done without change mode', () => {
    const result = validateState({
      ...baseState,
      phases: {
        ...baseState.phases,
        propose: {
          status: 'done',
          proposal: 'docs/proposal.md',
          testStrategy: noExtraTestStrategy,
        },
      },
    }, { checkFiles: false });

    expect(result.pass).toBe(false);
    expect(result.errors.some(e => e.code === 'change-mode.missing')).toBe(true);
  });

  test('fails when existing change design is done without legacy preflight', () => {
    const result = validateState({
      ...baseState,
      phases: {
        ...baseState.phases,
        propose: {
          status: 'done',
          proposal: 'docs/proposal.md',
          changeMode: 'existing',
          testStrategy: noExtraTestStrategy,
        },
        design: {
          status: 'done',
          designDoc: 'docs/design.md',
          tasks: [validTask],
        },
      },
    }, { checkFiles: false });

    expect(result.pass).toBe(false);
    expect(result.errors.some(e => e.code === 'legacy-preflight.missing')).toBe(true);
  });

  test('fails when legacy preflight finds issues without refactor policy', () => {
    const result = validateState({
      ...baseState,
      phases: {
        ...baseState.phases,
        propose: {
          status: 'done',
          proposal: 'docs/proposal.md',
          changeMode: 'existing',
          testStrategy: noExtraTestStrategy,
        },
        design: {
          status: 'done',
          designDoc: 'docs/design.md',
          legacyPreflight: {
            required: true,
            performed: true,
            affectedAreas: ['src/task.ts'],
            hasIssues: true,
            issues: [{ area: 'src/task.ts', finding: 'Too broad', severity: 'medium' }],
          },
          tasks: [validTask],
        },
      },
    }, { checkFiles: false });

    expect(result.pass).toBe(false);
    expect(result.errors.some(e => e.code === 'legacy-preflight.refactor-policy.missing')).toBe(true);
    expect(result.errors.some(e => e.code === 'legacy-preflight.user-decision.missing')).toBe(true);
  });

  test('passes existing change with valid legacy preflight', () => {
    const result = validateState({
      ...baseState,
      phases: {
        ...baseState.phases,
        propose: {
          status: 'done',
          proposal: 'docs/proposal.md',
          changeMode: 'existing',
          testStrategy: noExtraTestStrategy,
        },
        design: {
          status: 'done',
          designDoc: 'docs/design.md',
          legacyPreflight: validLegacyPreflight,
          tasks: [validTask],
        },
      },
    }, { checkFiles: false });

    expect(result.errors.filter(e => e.code.startsWith('legacy-preflight.'))).toEqual([]);
  });

  test('fails when test strategy is malformed', () => {
    const result = validateState({
      ...baseState,
      phases: {
        ...baseState.phases,
        propose: {
          status: 'done',
          proposal: 'docs/proposal.md',
          changeMode: 'new',
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
          changeMode: 'new',
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
          changeMode: 'new',
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
          changeMode: 'new',
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
          changeMode: 'new',
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

  test('supports legacy unitTargets field for backward compatibility', () => {
    const result = validateState({
      ...baseState,
      phases: {
        ...baseState.phases,
        propose: {
          status: 'done',
          proposal: 'docs/proposal.md',
          changeMode: 'new',
          testStrategy: {
            automatedUiTesting: false,
            unitTesting: true,
            unitTargets: ['src/task.ts'],
          },
        },
        design: {
          status: 'done',
          designDoc: 'docs/design.md',
          tasks: [{ ...validTask, verification: { commands: ['npm test'] } }],
        },
      },
    }, { checkFiles: false });

    expect(result.pass).toBe(true);
    expect(result.warnings.some(e => e.code === 'test-strategy.unit-targets.deprecated')).toBe(true);
  });

  test('passes selected UI and unit testing when flows and commands exist', () => {
    const result = validateState({
      ...baseState,
      phases: {
        ...baseState.phases,
        propose: {
          status: 'done',
          proposal: 'docs/proposal.md',
          changeMode: 'new',
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

  test('fails selected UI fidelity testing without design targets', () => {
    const result = validateState({
      ...baseState,
      phases: {
        ...baseState.phases,
        propose: {
          status: 'done',
          proposal: 'docs/proposal.md',
          changeMode: 'new',
          testStrategy: {
            automatedUiTesting: false,
            uiFidelityTesting: true,
            unitTesting: false,
          },
        },
      },
    }, { checkFiles: false });

    expect(result.errors.some(e => e.code === 'test-strategy.ui-fidelity-targets.missing')).toBe(true);
  });

  test('fails selected UI fidelity testing without design testing task after design', () => {
    const result = validateState({
      ...baseState,
      phases: {
        ...baseState.phases,
        propose: {
          status: 'done',
          proposal: 'docs/proposal.md',
          changeMode: 'new',
          testStrategy: {
            automatedUiTesting: false,
            uiFidelityTesting: true,
            unitTesting: false,
            uiFidelityTargets: [{
              name: 'Home visual match',
              designRef: 'figma://home',
              routeOrScreen: 'HomeScreen',
            }],
          },
        },
        design: {
          status: 'done',
          designDoc: 'docs/design.md',
          tasks: [validTask],
        },
      },
    }, { checkFiles: false });

    expect(result.errors.some(e => e.code === 'test-strategy.ui-fidelity-task.missing')).toBe(true);
  });

  test('warns when multi-page UI fidelity targets do not cover every UI flow screen', () => {
    const result = validateState({
      ...baseState,
      phases: {
        ...baseState.phases,
        propose: {
          status: 'done',
          proposal: 'docs/proposal.md',
          changeMode: 'new',
          testStrategy: {
            automatedUiTesting: true,
            uiFidelityTesting: true,
            unitTesting: false,
            uiFlows: [
              {
                name: 'Home flow',
                entryPoint: '/home',
                routeOrScreen: 'HomeScreen',
                steps: ['Open home'],
                expectedResult: 'Home is shown',
              },
              {
                name: 'Profile flow',
                entryPoint: '/profile',
                routeOrScreen: 'ProfileScreen',
                steps: ['Open profile'],
                expectedResult: 'Profile is shown',
              },
            ],
            uiFidelityTargets: [{
              name: 'Home visual match',
              designRef: 'figma://home',
              routeOrScreen: 'HomeScreen',
            }],
          },
        },
      },
    }, { checkFiles: false });

    expect(result.warnings.some(e => e.code === 'test-strategy.ui-fidelity-pages.incomplete')).toBe(true);
  });

  test('passes selected UI fidelity testing with design target and visual task', () => {
    const result = validateState({
      ...baseState,
      phases: {
        ...baseState.phases,
        propose: {
          status: 'done',
          proposal: 'docs/proposal.md',
          changeMode: 'new',
          testStrategy: {
            automatedUiTesting: false,
            uiFidelityTesting: true,
            unitTesting: false,
            uiFidelityTargets: [{
              name: 'Home visual match',
              designRef: 'figma://home',
              routeOrScreen: 'HomeScreen',
              acceptanceThreshold: 'No critical visual mismatch; <= 1% pixel diff',
            }],
          },
        },
        design: {
          status: 'done',
          designDoc: 'docs/design.md',
          tasks: [
            validTask,
            {
              id: 'home-ui-fidelity',
              title: 'Verify Home UI fidelity',
              type: 'testing',
              method: 'tdd',
              testKind: 'ui-fidelity',
              uiFidelityTargetRef: 'Home visual match',
              files: [{ path: 'tests/home-fidelity.md', action: 'create' }],
              specRefs: ['spec.home-ui'],
              acceptanceRefs: ['accept.home-ui'],
              acceptance: ['Home screen matches design reference'],
              verification: { commands: ['mobile screenshot && pixelmatch home.png figma-home.png'] },
            },
          ],
        },
      },
    }, { checkFiles: false });

    expect(result.errors.filter(e => e.code.startsWith('test-strategy.'))).toEqual([]);
  });
});
