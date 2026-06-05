import * as fs from 'fs/promises';
import * as path from 'path';
import inquirer from 'inquirer';
import { ui } from '../ui';
import { StateManager } from '../../cli-core/state';
import { guardPhaseTransition } from '../../cli-core/guard';
import { withErrorHandling } from '../error-handler';

function requireArtifact(cwd: string, label: string, relativePath?: string) {
  if (!relativePath) {
    throw new Error(`${label} artifact is missing from .nova.yaml. Run nova validate for details.`);
  }
  return fs.readFile(path.join(cwd, relativePath), 'utf-8').catch(() => {
    throw new Error(`${label} artifact not found: ${relativePath}. Run nova validate for details.`);
  });
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

  // 合并规格到 docs/specs/ 归档
  const specsDir = path.join(cwd, 'docs', 'specs');
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

  // 归档 verify 结果
  if (state.artifacts?.verificationReport) {
    const verifyContent = await requireArtifact(cwd, 'Verification report', state.artifacts.verificationReport);
    const dest = path.join(specsDir, `verification-report-${Date.now()}.md`);
    await fs.writeFile(dest, verifyContent);
    mergedCount++;
  } else if (state.phases.verify?.pipelineResult) {
    const dest = path.join(specsDir, `verify-result-${Date.now()}.json`);
    await fs.writeFile(dest, JSON.stringify(state.phases.verify.pipelineResult, null, 2));
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

  await StateManager.setPhaseField('archive', 'status', 'done');
  ui.success('Project archived. All phases complete.');
  ui.info(`Merged ${mergedCount} artifact(s) to docs/specs/.`);
  ui.info('Temporary context files cleaned up.');
});
