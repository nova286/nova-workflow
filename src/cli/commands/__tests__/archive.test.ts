import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'yaml';
import { archiveCommand } from '../archive';

describe('archiveCommand', () => {
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

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-archive-'));
    originalCwd = process.cwd();
    process.chdir(testDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(testDir, { recursive: true, force: true });
  });

  async function writeFile(filePath: string, content: string) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf-8');
  }

  test('archives artifacts, updates state pointers, and removes source planning artifacts', async () => {
    await writeFile('docs/proposals/proposal.md', '# Proposal');
    await writeFile('docs/designs/design.md', '# Design');
    await writeFile('docs/reports/verification-report.md', '# Verification');
    await writeFile('docs/superpowers/plans/change-one.md', '# Plan');
    await writeFile('.openspec/changes/change-one/proposal.md', '# OpenSpec');
    await writeFile('.openspec/changes/change-one/specs/example/spec.md', '# Spec');
    await writeFile('.nova/contexts/task-one.json', '{}');

    const state = {
      version: 1,
      project: 'test-project',
      environment: ['claude-code'],
      activeChange: 'change-one',
      artifacts: {
        openspecChange: '.openspec/changes/change-one',
        proposal: 'docs/proposals/proposal.md',
        specDelta: '.openspec/changes/change-one/specs/example/spec.md',
        implementationPlan: 'docs/superpowers/plans/change-one.md',
        verificationReport: 'docs/reports/verification-report.md',
      },
      phases: {
        propose: {
          status: 'done',
          proposal: 'docs/proposals/proposal.md',
          changeMode: 'new',
          testStrategy: { automatedUiTesting: false, unitTesting: false },
        },
        design: { status: 'done', designDoc: 'docs/designs/design.md', tasks: [task] },
        implement: {
          status: 'done',
          tasks: { 'task-one': { status: 'done', tests: ['npm test'] } },
        },
        verify: { status: 'done', pipelineResult: null },
        archive: { status: 'pending' },
      },
      metadata: { stateVersion: 0, lastModified: '', history: [] },
    };
    await fs.writeFile('.nova.yaml', yaml.stringify(state), 'utf-8');

    await archiveCommand({});

    await expect(fs.access('docs/proposals/proposal.md')).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.access('docs/designs/design.md')).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.access('docs/reports/verification-report.md')).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.access('docs/superpowers/plans/change-one.md')).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.access('.openspec/changes/change-one')).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.readdir('.nova/contexts')).resolves.toEqual([]);

    const archivedFiles = await fs.readdir('docs/specs');
    expect(archivedFiles.some((file) => file.startsWith('proposal-'))).toBe(true);
    expect(archivedFiles.some((file) => file.startsWith('design-'))).toBe(true);
    expect(archivedFiles.some((file) => file.startsWith('verification-report-'))).toBe(true);
    expect(archivedFiles.some((file) => file.startsWith('openspec-change-'))).toBe(true);

    const nextState = yaml.parse(await fs.readFile('.nova.yaml', 'utf-8'));
    expect(nextState.phases.archive.status).toBe('done');
    expect(nextState.phases.propose.proposal).toMatch(/^docs\/specs\/proposal-/);
    expect(nextState.phases.design.designDoc).toMatch(/^docs\/specs\/design-/);
    expect(nextState.artifacts.proposal).toBe(nextState.phases.propose.proposal);
    expect(nextState.artifacts.openspecChange).toMatch(/^docs\/specs\/openspec-change-/);
    expect(nextState.artifacts.specDelta).toMatch(/^docs\/specs\/openspec-change-.*\/specs\/example\/spec\.md$/);
    expect(nextState.artifacts.verificationReport).toMatch(/^docs\/specs\/verification-report-/);
    expect(nextState.artifacts.implementationPlan).toBe('');
  });
});
