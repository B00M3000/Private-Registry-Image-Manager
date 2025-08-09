import chalk from 'chalk';

export class Logger {
  private static verbose = false;

  static setVerbose(verbose: boolean): void {
    Logger.verbose = verbose;
  }

  static info(message: string): void {
    console.log(`${chalk.blue.bold('[INFO]')} ${message}`);
  }

  static success(message: string): void {
    console.log(`${chalk.green.bold('[SUCCESS]')} ${message}`);
  }

  static warning(message: string): void {
    console.log(`${chalk.yellow.bold('[WARNING]')} ${message}`);
  }

  static error(message: string): void {
    console.error(`${chalk.red.bold('[ERROR]')} ${message}`);
  }

  static debug(message: string): void {
    if (Logger.verbose) {
      console.log(`${chalk.magenta.bold('[DEBUG]')} ${message}`);
    }
  }

  static step(message: string): void {
    console.log(`${chalk.cyan('→')} ${message}`);
  }

  static header(message: string): void {
    console.log('\n' + chalk.bold.underline(message));
  }

  static divider(): void {
    console.log(chalk.gray('─'.repeat(50)));
  }
}
