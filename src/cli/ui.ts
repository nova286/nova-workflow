import ora, { Ora } from 'ora';
import chalk from 'chalk';

export const ui = {
  spinner: (text: string): Ora => ora(text).start(),
  success: (text: string) => console.log(chalk.green('✔ ' + text)),
  error: (text: string) => console.error(chalk.red('✖ ' + text)),
  warn: (text: string) => console.warn(chalk.yellow('⚠ ' + text)),
  info: (text: string) => console.log(chalk.blue('ℹ ' + text)),
  step: (text: string) => console.log(chalk.cyan('● ' + text)),
  guardResult: (passed: boolean, msg: string) => {
    const icon = passed ? chalk.green('✅') : chalk.red('❌');
    console.log(`   ${icon} ${msg}`);
  }
};
