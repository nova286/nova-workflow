import * as fs from 'fs/promises';
import * as yaml from 'yaml';
import { Mutex } from 'async-mutex';
import { NovaState } from './types';

export class StateManager {
  private static filePath = '.nova.yaml';
  private static mutex = new Mutex();

  static async load(): Promise<NovaState> {
    const raw = await fs.readFile(this.filePath, 'utf-8');
    return yaml.parse(raw);
  }

  static async update(updateFn: (current: NovaState) => NovaState): Promise<NovaState> {
    return await this.mutex.runExclusive(async () => {
      const current = await this.loadInternal();
      const draft = yaml.parse(yaml.stringify(current));
      const next = updateFn(draft);
      // 自动记录阶段时间戳
      for (const phase of Object.keys(next.phases)) {
        const before = (current.phases as any)[phase]?.status;
        const after = (next.phases as any)[phase]?.status;
        if (before !== after) {
          if (after === 'in-progress') {
            (next.phases as any)[phase].startedAt = new Date().toISOString();
            (next.phases as any)[phase].completedAt = null;
          } else if (after === 'done') {
            (next.phases as any)[phase].completedAt = new Date().toISOString();
          }
        }
      }
      next.metadata.stateVersion = (current.metadata.stateVersion || 0) + 1;
      next.metadata.lastModified = new Date().toISOString();
      const temp = `${this.filePath}.tmp`;
      await fs.writeFile(temp, yaml.stringify(next), 'utf-8');
      await fs.rename(temp, this.filePath);
      return next;
    });
  }

  private static async loadInternal(): Promise<NovaState> {
    const raw = await fs.readFile(this.filePath, 'utf-8');
    return yaml.parse(raw);
  }

  static async getTask(taskId: string): Promise<any | undefined> {
    const state = await this.load();
    const tasks: any[] = state.phases.design?.tasks || [];
    if (Array.isArray(tasks)) return tasks.find((t: any) => t.id === taskId);
    return tasks[taskId];
  }

  static async setPhaseField(phase: string, field: string, value: any) {
    return await this.update(state => {
      state.phases[phase][field] = value;
      return state;
    });
  }

  static getPhaseDuration(data: any): string | null {
    if (!data?.startedAt) return null;
    const start = new Date(data.startedAt).getTime();
    const end = data.completedAt
      ? new Date(data.completedAt).getTime()
      : Date.now();
    const ms = end - start;
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
    return `${(ms / 3600000).toFixed(1)}h`;
  }
}
