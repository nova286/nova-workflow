import { StateManager } from './state';
import { validateState } from './state-validator';
import { TestStrategy } from './types';

export type CheckpointStatus = 'pending' | 'in-progress' | 'done' | 'failed' | 'skipped';

export interface TaskCheckpointInput {
  taskId: string;
  status: CheckpointStatus;
  filesChanged?: string[];
  tests?: string[];
  traceId?: string;
  note?: string;
}

export interface ArtifactCheckpointInput {
  proposal?: string;
  designDoc?: string;
  specDelta?: string;
  verificationReport?: string;
  activeChange?: string;
  testStrategy?: TestStrategy;
}

export async function checkpointPhase(phase: string, status: CheckpointStatus) {
  if (!['propose', 'design', 'implement', 'verify', 'archive'].includes(phase)) {
    throw new Error(`Unknown phase: ${phase}`);
  }

  return StateManager.update((state) => {
    if (!state.phases[phase]) state.phases[phase] = {};
    state.phases[phase].status = status;

    if (status === 'done') {
      const result = validateState(state, { cwd: process.cwd() });
      if (!result.pass) {
        const first = result.errors[0];
        throw new Error(`Cannot mark ${phase} done: ${first.message}`);
      }
    }

    return state;
  });
}

export async function checkpointTask(input: TaskCheckpointInput) {
  return StateManager.update((state) => {
    const designTasks: any[] = state.phases.design?.tasks || [];
    const designTask = Array.isArray(designTasks)
      ? designTasks.find((task: any) => task.id === input.taskId)
      : undefined;
    if (!designTask) {
      throw new Error(`Task "${input.taskId}" not found in design phase.`);
    }

    if (!state.phases.implement) state.phases.implement = { status: 'pending', tasks: {} };
    if (!state.phases.implement.tasks) state.phases.implement.tasks = {};

    const current = state.phases.implement.tasks[input.taskId] || {};
    const next = {
      ...current,
      status: input.status,
      blocking: designTask.blocking !== false,
      updatedAt: new Date().toISOString(),
    };

    if (input.filesChanged && input.filesChanged.length > 0) {
      next.filesChanged = mergeStrings(current.filesChanged, input.filesChanged);
    }
    if (input.tests && input.tests.length > 0) {
      next.tests = mergeStrings(current.tests, input.tests);
    }
    if (input.traceId) {
      next.traceIds = mergeStrings(current.traceIds, [input.traceId]);
    }
    if (input.note) {
      next.notes = mergeStrings(current.notes, [input.note]);
    }

    state.phases.implement.tasks[input.taskId] = next;
    return state;
  });
}

export async function checkpointArtifacts(input: ArtifactCheckpointInput) {
  await StateManager.update((state) => {
    state.artifacts = {
      openspecChange: '',
      proposal: '',
      specDelta: '',
      implementationPlan: '',
      verificationReport: '',
      ...(state.artifacts || {}),
    };
    if (input.activeChange !== undefined) state.activeChange = input.activeChange;
    if (input.proposal !== undefined) {
      state.artifacts.proposal = input.proposal;
      state.phases.propose.proposal = input.proposal;
    }
    if (input.testStrategy !== undefined) {
      state.artifacts.testStrategy = input.testStrategy;
      state.phases.propose.testStrategy = input.testStrategy;
    }
    if (input.designDoc !== undefined) {
      state.phases.design.designDoc = input.designDoc;
    }
    if (input.specDelta !== undefined) {
      state.artifacts.specDelta = input.specDelta;
    }
    if (input.verificationReport !== undefined) {
      state.artifacts.verificationReport = input.verificationReport;
    }
    return state;
  });
}

function mergeStrings(existing: unknown, incoming: string[]): string[] {
  const values = Array.isArray(existing) ? existing.filter(v => typeof v === 'string') : [];
  for (const item of incoming.map(v => v.trim()).filter(Boolean)) {
    if (!values.includes(item)) values.push(item);
  }
  return values;
}
