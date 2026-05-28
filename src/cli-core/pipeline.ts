import { Dispatcher } from './dispatcher';
import { Pipeline, PipelineResult, StageResult, DispatchResult } from './types';

export class PipelineOrchestrator {
  private dispatcher: Dispatcher;

  constructor(dispatcher: Dispatcher) {
    this.dispatcher = dispatcher;
  }

  async execute(pipeline: Pipeline): Promise<PipelineResult> {
    const stageResults: StageResult[] = [];
    let aborted = false;

    for (const stage of pipeline.stages) {
      if (aborted) {
        stageResults.push({ stageId: stage.id, status: 'failed', taskResults: [] });
        continue;
      }

      if (stage.dependsOn) {
        const depsFailed = stage.dependsOn.some((depId) => {
          const depResult = stageResults.find((r) => r.stageId === depId);
          return !depResult || depResult.status === 'failed';
        });
        if (depsFailed) {
          stageResults.push({
            stageId: stage.id,
            status: 'failed',
            taskResults: [],
          });
          if (stage.onStageFailure !== 'continue') {
            aborted = true;
          }
          continue;
        }
      }

      const settled = await Promise.allSettled(
        stage.tasks.map((task) =>
          this.dispatcher.execute({
            agent: task.agent,
            context: task.context,
            timeout: task.timeout,
            retry: task.retry,
          })
        )
      );

      const taskResults: DispatchResult[] = settled.map((r, i) => {
        if (r.status === 'fulfilled') return r.value;
        const task = stage.tasks[i];
        return {
          traceId: '',
          agent: task.agent,
          status: 'failed' as const,
          metadata: {
            startTime: new Date(),
            endTime: new Date(),
            attempts: 0,
          },
          errors: [
            {
              message: r.reason instanceof Error ? r.reason.message : String(r.reason),
            },
          ],
        };
      });

      const failedCount = taskResults.filter((r) => r.status !== 'success').length;
      const status: StageResult['status'] =
        failedCount === 0
          ? 'success'
          : failedCount < taskResults.length
          ? 'partial'
          : 'failed';

      stageResults.push({ stageId: stage.id, status, taskResults });

      if (status === 'failed' && stage.onStageFailure !== 'continue') {
        aborted = true;
      }
    }

    const overallStatus: PipelineResult['status'] = stageResults.every(
      (s) => s.status === 'success'
    )
      ? 'success'
      : stageResults.some((s) => s.status !== 'failed')
      ? 'partial'
      : 'failed';

    return { status: overallStatus, stages: stageResults };
  }
}
