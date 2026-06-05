import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'yaml';
import { getNextAction } from '../next-action';

describe('getNextAction', () => {
  let testDir: string;
  let originalCwd: string;

  const task = {
    id: 'task-one',
    title: 'Task one',
    type: 'implementation',
    method: 'implementation',
    files: [{ path: 'src/task.ts', action: 'modify' }],
    specRefs: ['spec.task-one'],
    acceptanceRefs: ['accept.task-one'],
    acceptance: ['Task works'],
    verification: { commands: ['npm test'] },
  };

  const baseState = {
    version: 1,
    project: 'test-project',
    environment: ['claude-code'],
    phases: {
      propose: { status: 'pending', proposal: '' },
      design: { status: 'pending', designDoc: '', tasks: [] },
      implement: { status: 'pending', tasks: {} },
      verify: { status: 'pending', pipelineResult: null },
      archive: { status: 'pending' },
    },
    metadata: { stateVersion: 0, lastModified: '', history: [] },
  };

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-next-'));
    originalCwd = process.cwd();
    process.chdir(testDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(testDir, { recursive: true, force: true });
  });

  async function writeState(state: any) {
    await fs.writeFile('.nova.yaml', yaml.stringify(state), 'utf-8');
  }

  async function writeArtifacts() {
    await fs.mkdir('docs', { recursive: true });
    await fs.writeFile('docs/proposal.md', '# Proposal', 'utf-8');
    await fs.writeFile('docs/design.md', '# Design', 'utf-8');
  }

  test('recommends propose when proposal is pending', async () => {
    await writeState(baseState);
    const result = await getNextAction();
    expect(result.status).toBe('ready');
    expect(result.phase).toBe('propose');
    expect(result.command).toBe('/nova-propose');
  });

  test('recommends design after proposal is done', async () => {
    await writeArtifacts();
    await writeState({
      ...baseState,
      activeChange: 'change-one',
      artifacts: { specDelta: '.openspec/changes/change-one/specs/example/spec.md' },
      phases: {
        ...baseState.phases,
        propose: { status: 'done', proposal: 'docs/proposal.md' },
      },
    });

    const result = await getNextAction();
    expect(result.status).toBe('ready');
    expect(result.phase).toBe('design');
    expect(result.command).toBe('/nova-design');
  });

  test('blocks implementation when design tasks are invalid', async () => {
    await writeArtifacts();
    await writeState({
      ...baseState,
      activeChange: 'change-one',
      artifacts: { specDelta: '.openspec/changes/change-one/specs/example/spec.md' },
      phases: {
        ...baseState.phases,
        propose: { status: 'done', proposal: 'docs/proposal.md' },
        design: { status: 'done', designDoc: 'docs/design.md', tasks: [] },
      },
    });

    const result = await getNextAction();
    expect(result.status).toBe('blocked');
    expect(result.phase).toBe('implement');
    expect(result.command).toBe('nova validate');
  });

  test('recommends archive after verification is done', async () => {
    await writeArtifacts();
    await writeState({
      ...baseState,
      activeChange: 'change-one',
      artifacts: { specDelta: '.openspec/changes/change-one/specs/example/spec.md' },
      phases: {
        ...baseState.phases,
        propose: { status: 'done', proposal: 'docs/proposal.md' },
        design: { status: 'done', designDoc: 'docs/design.md', tasks: [task] },
        implement: {
          status: 'done',
          tasks: { 'task-one': { status: 'done', tests: ['npm test'] } },
        },
        verify: { status: 'done', pipelineResult: { status: 'success' } },
      },
    });

    const result = await getNextAction();
    expect(result.status).toBe('ready');
    expect(result.phase).toBe('archive');
    expect(result.command).toBe('nova archive');
  });
});
