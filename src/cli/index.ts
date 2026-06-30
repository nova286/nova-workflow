#!/usr/bin/env node
import { Command } from 'commander';
import { initCommand } from './commands/init';
import { archiveCommand } from './commands/archive';
import { statusCommand } from './commands/status';
import { contextCommand } from './commands/context';
import { guardCommand } from './commands/guard';
import { validateCommand } from './commands/validate';
import { nextCommand } from './commands/next';
import { detectCommand } from './commands/detect';
import { upgradeCommand } from './commands/upgrade';
import { registerCheckpointCommand } from './commands/checkpoint';
import pkg from '../../package.json';

const program = new Command();
program
  .name('nova')
  .description('Nova: AI workflow orchestration kernel')
  .version(pkg.version)
  .action(() => nextCommand({}));

program
  .command('init')
  .option('--with-ecc <path>', 'Path to ECC (Everything Claude Code) skills')
  .option('--force', 'Overwrite existing configuration')
  .option('--agent <id>', 'Initialize for a specific Agent id')
  .option('--skills-dir <dir>', 'Where to install skills: "user" (default) or "project"')
  .action(initCommand);

program
  .command('archive')
  .option('--rollback', 'Rollback archive phase to pending')
  .action(archiveCommand);

program
  .command('status')
  .option('--json', 'Print structured JSON')
  .action(statusCommand);

program
  .command('next')
  .option('--json', 'Print structured JSON')
  .action(nextCommand);

program
  .command('validate')
  .option('--json', 'Print structured JSON')
  .action(validateCommand);

program
  .command('detect')
  .option('--json', 'Print structured JSON')
  .option('--agent <id>', 'Active Agent id when the CLI cannot infer it')
  .option('--install', 'Interactively install missing recommended integrations with known installers')
  .action(detectCommand);

program
  .command('upgrade')
  .description('Upgrade Nova: update the global npm package, then refresh installed Agent skills')
  .addHelpText('after', `

Default behavior:
  1. npm install -g @nova286/nova-workflow@latest
  2. Re-run the updated CLI to refresh installed Nova Agent skills

Most users should run:
  nova upgrade

Examples:
  nova upgrade
  nova upgrade --agent codex
  nova upgrade --agent codex --skills-dir user
  nova upgrade --skip-npm --agent codex --skills-dir user
`)
  .option('--agent <id>', 'Upgrade skills for a specific Agent id')
  .option('--skills-dir <dir>', 'Upgrade skills in "user", "project", or detected installed locations')
  .option('--skip-npm', 'Advanced: only refresh installed Agent skills; skip npm package update')
  .action(upgradeCommand);

program
  .command('context')
  .requiredOption('--task-id <id>', 'Task identifier')
  .action(contextCommand);

program
  .command('guard <from> <to>')
  .action(guardCommand);

registerCheckpointCommand(program);

program.parse(process.argv);
