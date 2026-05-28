import { PipelineOrchestrator } from '../pipeline';
import { Dispatcher } from '../dispatcher';
import { PlatformClient } from '../platform-client';
import { AgentType, TaskContext, Pipeline } from '../types';

class StubClient extends PlatformClient {
  async sendPrompt(): Promise<{ content: string }> {
    return { content: JSON.stringify({ reviewed: true }) };
  }
}

class FailingClient extends PlatformClient {
  async sendPrompt(): Promise<{ content: string }> {
    throw new Error('simulated failure');
  }
}

const baseContext: TaskContext = {
  taskId: 'task-1',
  title: 'Test Task',
  description: 'A task for pipeline testing',
  taskType: 'implementation',
  designContext: { designDocRef: '', relevantSpecs: [], architectureNotes: '' },
  input: {
    files: [],
    dependencies: [],
    environment: { language: '', framework: '', buildTool: '', testFramework: '' },
  },
  output: { expectedArtifacts: [], constraints: { mustPassTests: true } },
  acceptanceCriteria: [],
  guardConditions: { requireReview: true, requireTests: true, blocking: false },
  metadata: {
    createdBy: 'test',
    createdAt: new Date().toISOString(),
    priority: 'medium',
    estimatedComplexity: 1,
  },
};

describe('PipelineOrchestrator', () => {
  test('executes a single stage with all tasks succeeding', async () => {
    const dispatcher = new Dispatcher(new StubClient());
    const orchestrator = new PipelineOrchestrator(dispatcher);
    const pipeline: Pipeline = {
      stages: [
        {
          id: 'review',
          tasks: [
            { id: 'r1', agent: AgentType.CODE_REVIEWER, context: baseContext },
            { id: 'r2', agent: AgentType.SECURITY_REVIEWER, context: { ...baseContext, taskId: 'task-2' } },
          ],
        },
      ],
    };

    const result = await orchestrator.execute(pipeline);

    expect(result.status).toBe('success');
    expect(result.stages).toHaveLength(1);
    expect(result.stages[0].status).toBe('success');
    expect(result.stages[0].taskResults).toHaveLength(2);
    result.stages[0].taskResults.forEach((r) => expect(r.status).toBe('success'));
  });

  test('stage marked failed when all tasks fail', async () => {
    const dispatcher = new Dispatcher(new FailingClient());
    const orchestrator = new PipelineOrchestrator(dispatcher);
    const pipeline: Pipeline = {
      stages: [
        {
          id: 'review',
          tasks: [{ id: 'r1', agent: AgentType.CODE_REVIEWER, context: baseContext }],
        },
      ],
    };

    const result = await orchestrator.execute(pipeline);

    expect(result.status).toBe('failed');
    expect(result.stages[0].status).toBe('failed');
  });

  test('dependsOn failure skips dependent stage', async () => {
    const dispatcher = new Dispatcher(new FailingClient());
    const orchestrator = new PipelineOrchestrator(dispatcher);
    const pipeline: Pipeline = {
      stages: [
        {
          id: 'stage-1',
          tasks: [{ id: 't1', agent: AgentType.CODER, context: baseContext }],
        },
        {
          id: 'stage-2',
          tasks: [{ id: 't2', agent: AgentType.CODE_REVIEWER, context: baseContext }],
          dependsOn: ['stage-1'],
        },
      ],
    };

    const result = await orchestrator.execute(pipeline);

    expect(result.stages).toHaveLength(2);
    expect(result.stages[0].status).toBe('failed');
    expect(result.stages[1].status).toBe('failed');
  });

  test('continue strategy does not abort on stage failure', async () => {
    const dispatcher = new Dispatcher(new FailingClient());
    const orchestrator = new PipelineOrchestrator(dispatcher);
    const pipeline: Pipeline = {
      stages: [
        {
          id: 's1',
          tasks: [{ id: 't1', agent: AgentType.CODER, context: baseContext }],
          onStageFailure: 'continue',
        },
        {
          id: 's2',
          tasks: [{ id: 't2', agent: AgentType.CODE_REVIEWER, context: baseContext }],
        },
      ],
    };

    const result = await orchestrator.execute(pipeline);

    expect(result.stages).toHaveLength(2);
    expect(result.stages[0].status).toBe('failed');
    expect(result.stages[1].status).toBe('failed');
    expect(result.status).toBe('failed');
  });
});
