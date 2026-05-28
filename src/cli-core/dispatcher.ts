import { PlatformClient, resolvePlatformClient } from './platform-client';
import { AgentType, DispatchRequest, DispatchResult, ErrorDetail } from './types';

function generateTraceId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 9);
  return `nova-${ts}-${rand}`;
}

function buildPrompt(agent: AgentType, context: DispatchRequest['context']): string {
  const lines: string[] = [];

  // 1. 指令（最核心）
  if (context.description) {
    lines.push(context.description);
    lines.push('');
  }

  // 2. 输入文件（如有）
  if (context.input.files.length > 0) {
    lines.push('## Relevant Files');
    for (const f of context.input.files) {
      lines.push(`- ${f.path} (${f.action})${f.content ? `\n  content: ${f.content}` : ''}`);
    }
    lines.push('');
  }

  // 3. 验收标准（仅当 description 未包含时追加）
  if (context.acceptanceCriteria.length > 0 && !context.description.includes('Acceptance Criteria')) {
    lines.push('## Acceptance Criteria');
    for (const c of context.acceptanceCriteria) {
      lines.push(`- ${c}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export class Dispatcher {
  private client: PlatformClient;

  constructor(client: PlatformClient) {
    this.client = client;
  }

  static async create(cwd?: string): Promise<Dispatcher> {
    const client = await resolvePlatformClient(cwd);
    return new Dispatcher(client);
  }

  async execute(request: DispatchRequest): Promise<DispatchResult> {
    const traceId = generateTraceId();
    const startTime = new Date();
    const maxAttempts = request.retry?.maxAttempts ?? 1;
    const backoff = request.retry?.backoff ?? 'fixed';
    const errors: ErrorDetail[] = [];
    let lastRawOutput: string | undefined;

    const prompt = buildPrompt(request.agent, request.context);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await this.client.sendPrompt(prompt, {
          timeout: request.timeout,
          model: request.model || 'sonnet',
          effort: request.effort || 'low',
        });

        const output = this.parseOutput(response.content);

        if (request.outputSchema) {
          const valid = this.validateOutput(output, request.outputSchema);
          if (!valid) {
            return {
              traceId,
              agent: request.agent,
              status: 'validation_error',
              output,
              rawOutput: response.content,
              metadata: {
                startTime,
                endTime: new Date(),
                attempts: attempt,
                tokenUsage: response.tokenUsage,
              },
              errors: [{ message: `Output failed schema validation: ${request.outputSchema}` }],
            };
          }
        }

        return {
          traceId,
          agent: request.agent,
          status: 'success',
          output,
          rawOutput: response.content,
          metadata: {
            startTime,
            endTime: new Date(),
            attempts: attempt,
            tokenUsage: response.tokenUsage,
          },
        };
      } catch (err: any) {
        errors.push({ message: err.message, code: err.code });

        if (attempt < maxAttempts) {
          await this.sleep(attempt, backoff);
        }
      }
    }

    return {
      traceId,
      agent: request.agent,
      status: 'failed',
      rawOutput: lastRawOutput,
      metadata: {
        startTime,
        endTime: new Date(),
        attempts: maxAttempts,
      },
      errors,
    };
  }

  private parseOutput(content: string): unknown {
    try {
      return JSON.parse(content);
    } catch {
      return { result: content };
    }
  }

  private validateOutput(output: unknown, schema: string): boolean {
    if (output == null) return false;

    switch (schema) {
      case 'task-result': {
        return typeof output === 'object' && 'result' in (output as Record<string, unknown>);
      }
      case 'proposal': {
        if (typeof output === 'string') return output.length > 50;
        if (typeof output === 'object') {
          const o = output as Record<string, unknown>;
          return typeof o.result === 'string' && o.result.length > 50;
        }
        return false;
      }
      case 'design': {
        if (typeof output === 'string') return output.length > 100;
        if (typeof output === 'object') {
          const o = output as Record<string, unknown>;
          return typeof o.result === 'string' && o.result.length > 100;
        }
        return false;
      }
      case 'review': {
        return typeof output === 'object' && 'verdict' in (output as Record<string, unknown>);
      }
      default: {
        // 逗号分隔字段名: 检查对象是否包含所有字段
        if (typeof output === 'object') {
          const required = schema.split(',').map(s => s.trim()).filter(Boolean);
          if (required.length > 0) {
            const o = output as Record<string, unknown>;
            return required.every(field => field in o);
          }
        }
        return typeof output === 'object' || (typeof output === 'string' && output.length > 0);
      }
    }
  }

  private sleep(attempt: number, backoff: string): Promise<void> {
    const ms =
      backoff === 'exponential'
        ? Math.min(1000 * Math.pow(2, attempt - 1), 30000)
        : 1000;
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
