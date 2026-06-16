import * as fs from 'fs/promises';
import * as path from 'path';
import inquirer from 'inquirer';
import { ui } from '../ui';
import { StateManager } from '../../cli-core/state';
import { guardPhaseTransition } from '../../cli-core/guard';
import { withErrorHandling } from '../error-handler';

const ARCHIVE_DIR_RELATIVE = 'Docs/specs/completed';
const LEGACY_ARCHIVE_DIR_RELATIVE = 'docs/specs';

function requireArtifact(cwd: string, label: string, relativePath?: string) {
  if (!relativePath) {
    throw new Error(`${label} artifact is missing from .nova.yaml. Run nova validate for details.`);
  }
  const artifactPath = resolveProjectPath(cwd, relativePath);
  return fs.readFile(artifactPath, 'utf-8').catch(() => {
    throw new Error(`${label} artifact not found: ${relativePath}. Run nova validate for details.`);
  });
}

function resolveProjectPath(cwd: string, relativePath: string) {
  const resolved = path.resolve(cwd, relativePath);
  const projectRelative = path.relative(cwd, resolved);
  if (projectRelative.startsWith('..') || path.isAbsolute(projectRelative)) {
    throw new Error(`Refusing to access artifact outside project: ${relativePath}`);
  }
  return resolved;
}

function toProjectRelative(cwd: string, absolutePath: string) {
  return path.relative(cwd, absolutePath).split(path.sep).join('/');
}

function isArchivedPath(relativePath: string) {
  const normalized = relativePath.split(path.sep).join('/');
  return normalized === ARCHIVE_DIR_RELATIVE ||
    normalized.startsWith(`${ARCHIVE_DIR_RELATIVE}/`) ||
    normalized === LEGACY_ARCHIVE_DIR_RELATIVE ||
    normalized.startsWith(`${LEGACY_ARCHIVE_DIR_RELATIVE}/`);
}

function addPath(paths: Set<string>, relativePath?: string) {
  if (!relativePath || isArchivedPath(relativePath)) return;
  paths.add(relativePath);
}

function archiveCleanupTargets(state: any) {
  const files = new Set<string>();
  const directories = new Set<string>();

  addPath(files, state.phases.propose?.proposal);
  addPath(files, state.artifacts?.proposal);
  addPath(files, state.phases.design?.designDoc);
  addPath(files, state.artifacts?.projectContext);
  addPath(files, state.artifacts?.implementationPlan);
  addPath(files, state.artifacts?.verificationReport);

  if (!state.artifacts?.implementationPlan && state.activeChange) {
    addPath(files, path.posix.join('docs', 'superpowers', 'plans', `${state.activeChange}.md`));
  }

  if (state.artifacts?.openspecChange) {
    addPath(directories, state.artifacts.openspecChange);
  } else if (state.activeChange) {
    addPath(directories, path.posix.join('.openspec', 'changes', state.activeChange));
  }

  return { files: [...files], directories: [...directories] };
}

async function removePathIfExists(cwd: string, relativePath: string, kind: 'file' | 'directory') {
  const absolutePath = resolveProjectPath(cwd, relativePath);
  try {
    if (kind === 'directory') {
      await fs.rm(absolutePath, { recursive: true, force: true });
    } else {
      await fs.unlink(absolutePath);
    }
    return true;
  } catch (error: any) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function cleanArchiveSources(cwd: string, state: any) {
  const targets = archiveCleanupTargets(state);
  let removedCount = 0;

  for (const filePath of targets.files) {
    if (await removePathIfExists(cwd, filePath, 'file')) removedCount++;
  }

  for (const dirPath of targets.directories) {
    if (await removePathIfExists(cwd, dirPath, 'directory')) removedCount++;
  }

  return removedCount;
}

async function archiveOpenSpecChange(cwd: string, specsDir: string, state: any) {
  const source = state.artifacts?.openspecChange ||
    (state.activeChange ? path.posix.join('.openspec', 'changes', state.activeChange) : '');
  if (!source || isArchivedPath(source)) return undefined;

  const sourcePath = resolveProjectPath(cwd, source);
  try {
    const stat = await fs.stat(sourcePath);
    if (!stat.isDirectory()) return undefined;
  } catch (error: any) {
    if (error?.code === 'ENOENT') return undefined;
    throw error;
  }

  const dest = path.join(specsDir, `openspec-change-${Date.now()}`);
  await fs.cp(sourcePath, dest, { recursive: true });
  return dest;
}

function archivedSpecDelta(cwd: string, originalChange: string | undefined, archivedChange: string, originalSpecDelta?: string) {
  if (!originalChange || !originalSpecDelta) {
    return toProjectRelative(cwd, archivedChange);
  }

  const originalChangePath = resolveProjectPath(cwd, originalChange);
  const originalSpecPath = resolveProjectPath(cwd, originalSpecDelta);
  const nested = path.relative(originalChangePath, originalSpecPath);
  if (nested.startsWith('..') || path.isAbsolute(nested)) {
    return toProjectRelative(cwd, archivedChange);
  }

  return toProjectRelative(cwd, path.join(archivedChange, nested));
}

export const archiveCommand = withErrorHandling(async (options: { rollback?: boolean }) => {
  if (options.rollback) {
    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: 'Rollback archive phase: reset to pending. Continue?',
      default: false,
    }]);
    if (!confirm) { ui.info('Cancelled.'); return; }
    await StateManager.update((s) => {
      s.phases.archive = { status: 'pending' };
      return s;
    });
    ui.success('Archive phase rolled back to pending.');
    return;
  }

  const result = await guardPhaseTransition('verify', 'archive');
  if (!result.pass) {
    ui.error('Cannot archive. Complete the verify phase first.');
    process.exit(1);
  }

  const state = await StateManager.load();
  const cwd = process.cwd();
  const originalOpenSpecChange = state.artifacts?.openspecChange ||
    (state.activeChange ? path.posix.join('.openspec', 'changes', state.activeChange) : undefined);

  // 合并规格到 Docs/specs/completed/ 归档
  const specsDir = path.join(cwd, 'Docs', 'specs', 'completed');
  await fs.mkdir(specsDir, { recursive: true });

  let mergedCount = 0;

  // 归档 proposal
  const proposalSrc = state.phases.propose?.proposal;
  const proposalContent = await requireArtifact(cwd, 'Proposal', proposalSrc);
  const proposalDest = path.join(specsDir, `proposal-${Date.now()}.md`);
  await fs.writeFile(proposalDest, proposalContent);
  mergedCount++;

  // 归档 design
  const designSrc = state.phases.design?.designDoc;
  const designContent = await requireArtifact(cwd, 'Design', designSrc);
  const designDest = path.join(specsDir, `design-${Date.now()}.md`);
  await fs.writeFile(designDest, designContent);
  mergedCount++;

  const openSpecDest = await archiveOpenSpecChange(cwd, specsDir, state);
  if (openSpecDest) mergedCount++;

  // 归档 verify 结果
  let verificationArtifactDest: string | undefined;
  if (state.artifacts?.verificationReport) {
    const verifyContent = await requireArtifact(cwd, 'Verification report', state.artifacts.verificationReport);
    const dest = path.join(specsDir, `verification-report-${Date.now()}.md`);
    await fs.writeFile(dest, verifyContent);
    verificationArtifactDest = dest;
    mergedCount++;
  } else if (state.phases.verify?.pipelineResult) {
    const dest = path.join(specsDir, `verify-result-${Date.now()}.json`);
    await fs.writeFile(dest, JSON.stringify(state.phases.verify.pipelineResult, null, 2));
    verificationArtifactDest = dest;
    mergedCount++;
  } else {
    throw new Error('Verification artifact is missing. Run nova validate for details.');
  }

  // 清理临时文件
  const contextsDir = path.join(cwd, '.nova', 'contexts');
  try {
    const files = await fs.readdir(contextsDir);
    for (const f of files) await fs.unlink(path.join(contextsDir, f));
  } catch { /* nothing to clean */ }

  const removedCount = await cleanArchiveSources(cwd, state);

  await StateManager.update((s) => {
    const archivedProposal = toProjectRelative(cwd, proposalDest);
    const archivedDesign = toProjectRelative(cwd, designDest);
    const archivedOpenSpecChange = openSpecDest ? toProjectRelative(cwd, openSpecDest) : '';
    const archivedVerificationArtifact = verificationArtifactDest ? toProjectRelative(cwd, verificationArtifactDest) : '';
    const archivedSpec = openSpecDest
      ? archivedSpecDelta(cwd, originalOpenSpecChange, openSpecDest, state.artifacts?.specDelta)
      : '';

    s.metadata = s.metadata || { stateVersion: 0, lastModified: '', history: [] };
    s.metadata.history = Array.isArray(s.metadata.history) ? s.metadata.history : [];
    s.metadata.history.push({
      type: 'archive',
      activeChange: state.activeChange || '',
      archivedAt: new Date().toISOString(),
      artifacts: {
        proposal: archivedProposal,
        designDoc: archivedDesign,
        openspecChange: archivedOpenSpecChange,
        specDelta: archivedSpec,
        verificationReport: archivedVerificationArtifact,
      },
      cleanedSourceArtifacts: removedCount,
    });

    s.activeChange = '';
    delete s.changeMode;
    delete s.projectContext;
    delete s.testStrategy;
    delete s.legacyPreflight;

    s.artifacts = {
      openspecChange: '',
      proposal: '',
      specDelta: '',
      implementationPlan: '',
      verificationReport: '',
    };
    s.phases = {
      propose: { status: 'pending', proposal: '' },
      design: { status: 'pending', designDoc: '', tasks: [] },
      implement: { status: 'pending', tasks: {} },
      verify: { status: 'pending', pipelineResult: null },
      archive: { status: 'pending' },
    };
    return s;
  });

  ui.success('Project archived. Workflow state reset for the next change.');
  ui.info(`Merged ${mergedCount} artifact(s) to ${ARCHIVE_DIR_RELATIVE}/.`);
  ui.info(`Cleaned ${removedCount} source artifact(s) and temporary context files.`);
});
