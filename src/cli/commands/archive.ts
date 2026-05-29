import * as fs from 'fs/promises';
import * as path from 'path';
import inquirer from 'inquirer';
import { ui } from '../ui';
import { StateManager } from '../../cli-core/state';
import { guardPhaseTransition } from '../../cli-core/guard';
import { withErrorHandling } from '../error-handler';

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
  if (proposalSrc) {
    const src = path.join(cwd, proposalSrc);
    try {
      const content = await fs.readFile(src, 'utf-8');
      const dest = path.join(specsDir, `proposal-${Date.now()}.md`);
      await fs.writeFile(dest, content);
      mergedCount++;
    } catch { /* 源文件不存在则跳过 */ }
  }

  // 归档 design
  const designSrc = state.phases.design?.designDoc;
  if (designSrc) {
    const src = path.join(cwd, designSrc);
    try {
      const content = await fs.readFile(src, 'utf-8');
      const dest = path.join(specsDir, `design-${Date.now()}.md`);
      await fs.writeFile(dest, content);
      mergedCount++;
    } catch { /* 源文件不存在则跳过 */ }
  }

  // 归档 verify 结果
  if (state.phases.verify?.pipelineResult) {
    const dest = path.join(specsDir, `verify-result-${Date.now()}.json`);
    await fs.writeFile(dest, JSON.stringify(state.phases.verify.pipelineResult, null, 2));
    mergedCount++;
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
