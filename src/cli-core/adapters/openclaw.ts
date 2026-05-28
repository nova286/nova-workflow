import * as fs from 'fs/promises';
import * as path from 'path';
import { EnvironmentAdapter } from '../types';

const OPENCLAW_INSTRUCTIONS = `# Nova Workflow

This project uses Nova for AI-assisted development workflow.

## Workflow Phases

1. **propose** — Generate feature proposal from interactive Q&A
2. **design** — Create technical design with task list
3. **implement** — Execute tasks with type routing (implementation/testing)
4. **verify** — Code review + security review pipeline
5. **archive** — Merge artifacts and clean up

## Project State

Read \`.nova.yaml\` for current phase status and task list.

## Commands

- Read \`.nova.yaml\` to check progress
- Follow task instructions from the design document
- Run type check and tests after each task
`;

export class OpenClawAdapter implements EnvironmentAdapter {
  name = 'openclaw';

  async setup(cwd: string) {
    const dir = path.join(cwd, '.openclaw');
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, 'instructions.md');
    try {
      await fs.access(filePath);
      return;
    } catch {}
    await fs.writeFile(filePath, OPENCLAW_INSTRUCTIONS, 'utf-8');
  }
}
