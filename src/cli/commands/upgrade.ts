import { execFile } from 'child_process';
import { promisify } from 'util';
import { ui } from '../ui';
import { UpgradeManager } from '../../cli-core/upgrade-manager';
import { withErrorHandling } from '../error-handler';

const execFileAsync = promisify(execFile);
const NOVA_PACKAGE = '@nova286/nova-workflow@latest';

export const upgradeCommand = withErrorHandling(async (options: { agent?: string; skillsDir?: string; skipNpm?: boolean } = {}) => {
  const skillsDir = options.skillsDir === 'project' ? 'project' as const : options.skillsDir === 'user' ? 'user' as const : undefined;
  try {
    if (!options.skipNpm) {
      ui.step(`Updating Nova CLI package (${NOVA_PACKAGE})...`);
      await execFileAsync('npm', ['install', '-g', NOVA_PACKAGE], { cwd: process.cwd() });
      ui.success('Nova CLI package updated.');

      const args = ['upgrade', '--skip-npm'];
      if (options.agent) args.push('--agent', options.agent);
      if (options.skillsDir) args.push('--skills-dir', options.skillsDir);
      ui.step('Refreshing Nova Agent skills with the updated CLI...');
      await execFileAsync('nova', args, { cwd: process.cwd() });
      ui.success('Nova upgraded successfully!');
      return;
    }

    ui.step('Upgrading Nova Agent skills...');
    const manager = new UpgradeManager(process.cwd(), {
      agent: options.agent,
      skillsDir,
    });
    await manager.run();
    ui.success('Nova Agent skills upgraded successfully!');
  } catch (err: any) {
    ui.error(`Upgrade failed: ${err.message}`);
    process.exit(1);
  }
});
