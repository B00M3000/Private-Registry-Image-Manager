#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { InitCommand } from './commands/init';
import { BuildCommand } from './commands/build';
import { DeployCommand } from './commands/deploy';
import { StatusCommand } from './commands/status';
import { Logger } from './utils/logger';
import { Config } from './config/config';

const program = new Command();

program
  .name('container-deploy')
  .description('A generalized container deployment CLI tool')
  .version('1.0.0')
  .option('-v, --verbose', 'Verbose output')
  .option('-c, --config <path>', 'Configuration file path')
  .hook('preAction', (thisCommand) => {
    const options = thisCommand.opts();
    Logger.setVerbose(options.verbose || false);
  });

// Init command
program
  .command('init')
  .description('Initialize image manager configuration for a new project')
  .option('-o, --output <file>', 'Output file for configuration', 'image-manager.yml')
  .option('--defaults', 'Skip interactive prompts and use defaults')
  .option('--force', 'Force overwrite existing configuration')
  .action(async (options) => {
    try {
      const command = new InitCommand(options);
      await command.run();
    } catch (error) {
      Logger.error(`Init failed: ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
  });

// Build command
program
  .command('build')
  .description('Build Docker image')
  .option('-t, --tag <tag>', 'Custom tag for the built image')
  .option('--build-arg <arg>', 'Build arguments (KEY=VALUE)', collectBuildArgs, [])
  .option('--no-cache', 'Don\'t use cache when building')
  .option('--verbose', 'Show detailed build output')
  .action(async (options) => {
    try {
      const config = await loadConfig(program.opts().config);
      const command = new BuildCommand(options, config);
      await command.run();
    } catch (error) {
      Logger.error(`Build failed: ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
  });

// Deploy command
program
  .command('deploy')
  .description('Deploy to registry')
  .option('-t, --tag <tag>', 'Version tag to use (overrides config strategy)')
  .option('--skip-build', 'Skip building and deploy existing local image')
  .option('--skip-dns-check', 'Skip DNS check')
  .option('-f, --force', 'Force deployment without confirmation')
  .option('--no-latest', 'Don\'t push latest tag')
  .option('--skip-auth', 'Skip authentication (assume already logged in)')
  .action(async (options) => {
    try {
      const config = await loadConfig(program.opts().config);
      const command = new DeployCommand(options, config);
      await command.run();
    } catch (error) {
      Logger.error(`Deploy failed: ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
  });

// Status command
program
  .command('status')
  .description('Show deployment status and information')
  .option('-v, --verbose', 'Show detailed information')
  .option('--check-registry', 'Check registry connectivity')
  .action(async (options) => {
    try {
      const config = await loadConfig(program.opts().config);
      const command = new StatusCommand(options, config);
      await command.run();
    } catch (error) {
      Logger.error(`Status failed: ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
  });

// Helper functions
function collectBuildArgs(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

async function loadConfig(configPath?: string): Promise<Config> {
  try {
    return configPath ? await Config.fromFile(configPath) : await Config.discover();
  } catch (error) {
    Logger.error(error instanceof Error ? error.message : String(error));
  Logger.info('Run \'container-deploy init\' to create image-manager.yml');
    process.exit(1);
  }
}

// Error handling
process.on('unhandledRejection', (reason) => {
  Logger.error(`Unhandled rejection: ${reason}`);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  Logger.error(`Uncaught exception: ${error.message}`);
  process.exit(1);
});

// Parse arguments
program.parse();
