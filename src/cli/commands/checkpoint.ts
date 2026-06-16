import { Command } from 'commander';
import { checkpointArtifacts, checkpointPhase, checkpointTask, CheckpointStatus } from '../../cli-core/checkpoint';
import {
  ChangeMode,
  ComplianceEvidence,
  ComplianceVerdict,
  ComplianceVerdictStatus,
  LegacyPreflight,
  ProjectContextContract,
  ReviewIndependence,
  TestStrategy,
  VerificationCommandResult,
} from '../../cli-core/types';
import { normalizeUnitTestTargetsForStrategy } from '../../cli-core/test-strategy';
import { ui } from '../ui';
import { withErrorHandling } from '../error-handler';

const STATUSES = new Set(['pending', 'in-progress', 'done', 'failed', 'skipped']);
let warnedLegacyUnitTargets = false;
type ParsedTestStrategyResult = {
  testStrategy: TestStrategy;
  migratedLegacyUnitTargets: boolean;
};

function parseStatus(status?: string): CheckpointStatus {
  if (!status || !STATUSES.has(status)) {
    throw new Error('--status must be one of pending, in-progress, done, failed, skipped');
  }
  return status as CheckpointStatus;
}

function csv(value?: string): string[] | undefined {
  if (!value) return undefined;
  return value.split(',').map(s => s.trim()).filter(Boolean);
}

function parseTestStrategy(value?: string): ParsedTestStrategyResult | undefined {
  if (!value) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('--test-strategy must be valid JSON');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('--test-strategy must be a JSON object');
  }

  const strategy = parsed as TestStrategy;
  if (typeof strategy.automatedUiTesting !== 'boolean' || typeof strategy.unitTesting !== 'boolean') {
    throw new Error('--test-strategy must include boolean automatedUiTesting and unitTesting');
  }
  const normalized = normalizeUnitTestTargetsForStrategy(strategy);
  if (!warnedLegacyUnitTargets && normalized.hadUnitTargetsField) {
    ui.warn('检测到已废弃字段 unitTargets：已自动迁移为 unitTestTargets，请后续改用 unitTestTargets。');
    warnedLegacyUnitTargets = true;
  }
  return {
    testStrategy: normalized.normalized,
    migratedLegacyUnitTargets: normalized.migratedFromUnitTargets,
  };
}

function parseChangeMode(value?: string): ChangeMode | undefined {
  if (!value) return undefined;
  if (value !== 'existing' && value !== 'incremental' && value !== 'new') {
    throw new Error('--change-mode must be one of existing, incremental, new');
  }
  return value;
}

function parseLegacyPreflight(value?: string): LegacyPreflight | undefined {
  if (!value) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('--legacy-preflight must be valid JSON');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('--legacy-preflight must be a JSON object');
  }

  const preflight = parsed as LegacyPreflight;
  if (
    typeof preflight.required !== 'boolean' ||
    typeof preflight.performed !== 'boolean' ||
    typeof preflight.hasIssues !== 'boolean'
  ) {
    throw new Error('--legacy-preflight must include boolean required, performed, and hasIssues');
  }
  if (!Array.isArray(preflight.affectedAreas)) {
    throw new Error('--legacy-preflight must include affectedAreas array');
  }

  return preflight;
}

function parseJsonObject<T>(value: string | undefined, optionName: string): T | undefined {
  if (!value) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${optionName} must be valid JSON`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${optionName} must be a JSON object`);
  }
  return parsed as T;
}

function parseCompliance(value?: string): ComplianceEvidence | undefined {
  const compliance = parseJsonObject<ComplianceEvidence>(value, '--compliance');
  if (!compliance) return undefined;
  if (compliance.followed !== undefined && !Array.isArray(compliance.followed)) {
    throw new Error('--compliance.followed must be an array when provided');
  }
  if (compliance.deviations !== undefined && !Array.isArray(compliance.deviations)) {
    throw new Error('--compliance.deviations must be an array when provided');
  }
  return compliance;
}

function parseProjectContext(value?: string): ProjectContextContract | undefined {
  return parseJsonObject<ProjectContextContract>(value, '--project-context');
}

function parseComplianceVerdict(value: string | undefined, optionName: string): ComplianceVerdict | ComplianceVerdictStatus | undefined {
  if (!value) return undefined;
  if (value === 'PASS' || value === 'CHANGES_REQUESTED' || value === 'BLOCKED') {
    return value;
  }
  const verdict = parseJsonObject<ComplianceVerdict>(value, optionName);
  if (!verdict) return undefined;
  if (verdict.status !== 'PASS' && verdict.status !== 'CHANGES_REQUESTED' && verdict.status !== 'BLOCKED') {
    throw new Error(`${optionName}.status must be PASS, CHANGES_REQUESTED, or BLOCKED`);
  }
  return verdict;
}

function parseReviewIndependence(value?: string): ReviewIndependence | undefined {
  const review = parseJsonObject<ReviewIndependence>(value, '--review-independence');
  if (!review) return undefined;
  if (review.mode !== 'subagent' && review.mode !== 'fresh-context' && review.mode !== 'same-session-fallback') {
    throw new Error('--review-independence.mode must be subagent, fresh-context, or same-session-fallback');
  }
  return review;
}

function parseVerificationCommands(value?: string): VerificationCommandResult[] | undefined {
  if (!value) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('--verification-commands must be valid JSON');
  }
  if (!Array.isArray(parsed)) {
    throw new Error('--verification-commands must be a JSON array');
  }
  for (const [index, item] of parsed.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`--verification-commands[${index}] must be a JSON object`);
    }
    const result = item as VerificationCommandResult;
    if (typeof result.command !== 'string' || result.command.trim().length === 0) {
      throw new Error(`--verification-commands[${index}].command must be a non-empty string`);
    }
    if (result.status !== 'PASS' && result.status !== 'FAIL' && result.status !== 'SKIPPED') {
      throw new Error(`--verification-commands[${index}].status must be PASS, FAIL, or SKIPPED`);
    }
  }
  return parsed as VerificationCommandResult[];
}

export function registerCheckpointCommand(program: Command) {
  const checkpoint = program.command('checkpoint').description('Record workflow phase or task progress');

  checkpoint
    .command('phase <phase>')
    .requiredOption('--status <status>', 'Phase status')
    .action(withErrorHandling(async (phase: string, options: { status?: string }) => {
      const status = parseStatus(options.status);
      if (status === 'skipped') {
        throw new Error('Phase status cannot be skipped.');
      }
      await checkpointPhase(phase, status);
      ui.success(`Checkpointed phase ${phase}: ${status}`);
    }));

  checkpoint
    .command('task <taskId>')
    .requiredOption('--status <status>', 'Task status')
    .option('--files <csv>', 'Comma-separated changed files')
    .option('--tests <csv>', 'Comma-separated tests or check commands')
    .option('--trace-id <id>', 'Trace identifier')
    .option('--note <text>', 'Evidence note')
    .option('--compliance <json>', 'JSON compliance evidence for project context contract')
    .action(withErrorHandling(async (taskId: string, options: { status?: string; files?: string; tests?: string; traceId?: string; note?: string; compliance?: string }) => {
      const status = parseStatus(options.status);
      await checkpointTask({
        taskId,
        status,
        filesChanged: csv(options.files),
        tests: csv(options.tests),
        traceId: options.traceId,
        note: options.note,
        compliance: parseCompliance(options.compliance),
      });
      ui.success(`Checkpointed task ${taskId}: ${status}`);
    }));

  checkpoint
    .command('artifacts')
    .option('--proposal <path>', 'Proposal document path')
    .option('--design-doc <path>', 'Design document path')
    .option('--spec-delta <path>', 'Spec delta path or reference')
    .option('--verification-report <path>', 'Verification report path')
    .option('--active-change <id>', 'Active OpenSpec-compatible change id')
    .option('--test-strategy <json>', 'JSON test strategy contract')
    .option('--change-mode <mode>', 'Change mode: existing, incremental, or new')
    .option('--legacy-preflight <json>', 'JSON legacy preflight contract')
    .option('--project-context <json>', 'JSON project context contract')
    .option('--project-context-path <path>', 'Project context contract document path')
    .option('--project-rules-verdict <json-or-status>', 'Project rules compliance verdict')
    .option('--best-practices-verdict <json-or-status>', 'Best-practices compliance verdict')
    .option('--review-independence <json>', 'JSON verification reviewer independence record')
    .option('--verification-commands <json>', 'JSON array of required verification command results')
    .action(withErrorHandling(async (options: {
      proposal?: string;
      designDoc?: string;
      specDelta?: string;
      verificationReport?: string;
      activeChange?: string;
      testStrategy?: string;
      changeMode?: string;
      legacyPreflight?: string;
      projectContext?: string;
      projectContextPath?: string;
      projectRulesVerdict?: string;
      bestPracticesVerdict?: string;
      reviewIndependence?: string;
      verificationCommands?: string;
    }) => {
      const parsedTestStrategy = parseTestStrategy(options.testStrategy);
      const migratedLegacyUnitTargets = parsedTestStrategy?.migratedLegacyUnitTargets || false;
      await checkpointArtifacts({
        ...options,
        testStrategy: parsedTestStrategy?.testStrategy,
        changeMode: parseChangeMode(options.changeMode),
        legacyPreflight: parseLegacyPreflight(options.legacyPreflight),
        projectContext: parseProjectContext(options.projectContext),
        projectContextPath: options.projectContextPath,
        projectRulesVerdict: parseComplianceVerdict(options.projectRulesVerdict, '--project-rules-verdict'),
        bestPracticesVerdict: parseComplianceVerdict(options.bestPracticesVerdict, '--best-practices-verdict'),
        reviewIndependence: parseReviewIndependence(options.reviewIndependence),
        verificationCommands: parseVerificationCommands(options.verificationCommands),
      });
      if (migratedLegacyUnitTargets) {
        ui.success('已完成字段迁移：unitTargets 已自动转写到 unitTestTargets。');
      }
      ui.success('Checkpointed workflow artifacts.');
    }));
}
