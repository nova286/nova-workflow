#!/usr/bin/env node
import { Command } from 'commander';
import { initCommand } from './commands/init';
import { archiveCommand } from './commands/archive';
import { statusCommand } from './commands/status';
import { contextCommand } from './commands/context';
import { guardCommand } from './commands/guard';
import pkg from '../../package.json';

const program = new Command();
program
  .name('nova')
  .description('Nova: AI workflow orchestration — init, status, archive')
  .version(pkg.version);

program
  .command('init')
  .option('--with-ecc <path>', 'Path to ECC skills')
  .option('--force', 'Overwrite existing configuration')
  .option('--skills-dir <dir>', 'Where to install skills: "user" (default) or "project"')
  .action(initCommand);

program
  .command('archive')
  .option('--rollback', 'Rollback archive phase to pending')
  .action(archiveCommand);

program
  .command('status')
  .action(statusCommand);

program
  .command('context')
  .requiredOption('--task-id <id>', 'Task identifier')
  .action(contextCommand);

program
  .command('guard <from> <to>')
  .action(guardCommand);

program.parse(process.argv);
