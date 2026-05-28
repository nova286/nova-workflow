import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'yaml';

export interface PlatformResponse {
  content: string;
  tokenUsage?: { prompt: number; completion: number };
}

export interface SendPromptOptions {
  timeout?: number;
  model?: string;
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
}

export abstract class PlatformClient {
  abstract sendPrompt(prompt: string, options?: SendPromptOptions): Promise<PlatformResponse>;
}

// --- Concrete implementations ---

export class ClaudeCodeClient extends PlatformClient {
  async sendPrompt(prompt: string, options?: SendPromptOptions): Promise<PlatformResponse> {
    const t0 = Date.now();
    const model = options?.model || 'sonnet';
    const effort = options?.effort || 'low';
    console.error(`[nova] spawning claude --model ${model} --effort ${effort} (prompt: ${prompt.length} chars, via stdin)...`);

    return new Promise((resolve, reject) => {
      const child = spawn('claude', ['--model', model, '--print', '--effort', effort, '--no-session-persistence', '--allowedTools', 'Read'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      console.error(`[nova] claude pid=${child.pid} spawned in ${Date.now() - t0}ms`);

      // 通过 stdin 传入 prompt，写完后关闭
      child.stdin.write(prompt);
      child.stdin.end();

      let stdout = '';
      let stderr = '';
      let firstDataAt = 0;
      let lastDotAt = 0;

      child.stdout.on('data', (data: Buffer) => {
        if (!firstDataAt) {
          firstDataAt = Date.now();
          console.error(`[nova] first token after ${firstDataAt - t0}ms`);
        }
        const chunk = data.toString();
        stdout += chunk;
        // 每 5 秒打一个点，让用户知道在动
        const now = Date.now();
        if (now - lastDotAt > 5000) {
          lastDotAt = now;
          process.stderr.write(`[nova] streaming... ${stdout.length} chars received\n`);
        }
      });
      child.stderr.on('data', (data: Buffer) => {
        const s = data.toString();
        if (s.trim()) console.error(`[nova] claude stderr: ${s.trim().slice(0, 200)}`);
        stderr += s;
      });

      child.on('close', (code) => {
        const elapsed = Date.now() - t0;
        console.error(`[nova] claude exited code=${code}, stdout=${stdout.length} chars, ${elapsed}ms total, first data at ${firstDataAt ? firstDataAt - t0 : 'N/A'}ms`);
        if (code === 0) {
          resolve({ content: stdout.trim() });
        } else {
          reject(new Error(`Claude CLI exit ${code}: ${stderr}`));
        }
      });

      child.on('error', (err) => {
        console.error(`[nova] claude spawn error: ${err.message}`);
        reject(err);
      });
    });
  }
}

// --- Factory ---

export async function resolvePlatformClient(cwd?: string): Promise<PlatformClient> {
  const dir = cwd ?? process.cwd();
  try {
    const raw = await fs.readFile(path.join(dir, '.nova.yaml'), 'utf-8');
    const state = yaml.parse(raw) as { environment?: string[] };
    const env = state.environment?.[0];
    if (env === 'codex' || env === 'openclaw' || env === 'hermes-agent') {
      throw new Error(
        `${env} is not yet supported. Nova currently supports Claude Code only.`
      );
    }
  } catch (err: any) {
    if (err.message?.includes('not yet supported')) throw err;
  }
  return new ClaudeCodeClient();
}
