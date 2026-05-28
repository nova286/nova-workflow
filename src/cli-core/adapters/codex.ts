import * as fs from 'fs/promises';
import * as path from 'path';
import { EnvironmentAdapter } from '../types';

const CODEX_INSTRUCTIONS = `# Nova Workflow

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

export class CodexAdapter implements EnvironmentAdapter {
  name = 'codex';

  async setup(cwd: string) {
    const filePath = path.join(cwd, 'CODEX.md');
    try {
      await fs.access(filePath);
      return; // don't overwrite
    } catch {}
    await fs.writeFile(filePath, CODEX_INSTRUCTIONS, 'utf-8');
  }
}
