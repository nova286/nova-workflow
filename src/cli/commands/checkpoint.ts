import { Command } from 'commander';
import { checkpointArtifacts, checkpointPhase, checkpointTask, CheckpointStatus } from '../../cli-core/checkpoint';
import { TestStrategy } from '../../cli-core/types';
import { ui } from '../ui';
import { withErrorHandling } from '../error-handler';

const STATUSES = new Set(['pending', 'in-progress', 'done', 'failed', 'skipped']);

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

function parseTestStrategy(value?: string): TestStrategy | undefined {
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

  return strategy;
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
    .action(withErrorHandling(async (taskId: string, options: { status?: string; files?: string; tests?: string; traceId?: string; note?: string }) => {
      const status = parseStatus(options.status);
      await checkpointTask({
        taskId,
        status,
        filesChanged: csv(options.files),
        tests: csv(options.tests),
        traceId: options.traceId,
        note: options.note,
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
    .action(withErrorHandling(async (options: {
      proposal?: string;
      designDoc?: string;
      specDelta?: string;
      verificationReport?: string;
      activeChange?: string;
      testStrategy?: string;
    }) => {
      await checkpointArtifacts({
        ...options,
        testStrategy: parseTestStrategy(options.testStrategy),
      });
      ui.success('Checkpointed workflow artifacts.');
    }));
}
