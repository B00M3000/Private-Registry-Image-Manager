#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { InitCommand } from './commands/init';
import { BuildCommand } from './commands/build';
import { DeployCommand } from './commands/deploy';
import { StatusCommand } from './commands/status';
import { TestCommand } from './commands/test';
import { CleanCommand } from './commands/clean';
import { Logger } from './utils/logger';
import { Config } from './config/config';

const program = new Command();

function printCondensedHelp(): void {
  const h = (s: string) => chalk.bold.cyan(s);
  const c = (s: string) => chalk.green(s);
  const y = (s: string) => chalk.yellow(s);
  const cmdColor = (s: string) => chalk.cyan(s); // command name not greyed out

  const lines: string[] = [];
  lines.push(h('\nPrivate Registry Image Manager (prim)'));
  lines.push(chalk.gray('Show this menu via: `prim`, `prim --help`, or `prim help`.'));
  lines.push('');
  lines.push(chalk.blue('📖 README: https://github.com/B00M3000/Private-Registry-Image-Manager#readme'));
  lines.push('');
  lines.push(chalk.bold('Usage: ') + 'prim [global-options] <command> [command-options]');
  lines.push('');
  lines.push(chalk.bold('Global options:'));
  lines.push(`  ${y('[--config | -i] <path>')}   Use a specific configuration file`);
  lines.push(`  ${y('[--verbose | -v]')}         Verbose output`);
  lines.push('');
  lines.push(chalk.bold('Commands:'));
  const items: Array<{ desc: string; cmd: string; opts?: string }> = [
    { desc: 'Initialize configuration', cmd: 'init' },
    { desc: 'Build Docker image', cmd: 'build', opts: '[--tag|-t] [--build-arg] [--no-cache]' },
    { desc: 'Deploy to registry', cmd: 'deploy', opts: '[--tag|-t] [--skip-build] [--no-latest] [--force|-f] [--force-build]' },
    { desc: 'Show config/env', cmd: 'status', opts: '[--check-registry] [--verbose|-v]' },
    { desc: 'Run locally', cmd: 'test', opts: '[--tag|-t] [-p HOST:PORT] [-e KEY=VALUE] [--no-detach]' },
    { desc: 'Interactive cleanup', cmd: 'clean', opts: '[--tag|-t] [--yes|-y]' },
    { desc: 'Show help', cmd: 'help', opts: '[-x|--expanded]' },
  ];
  const descW = Math.max(...items.map(i => i.desc.length)) + 2;
  const cmdW = Math.max(...items.map(i => i.cmd.length)) + 2;
  for (const it of items) {
    const descPad = ' '.repeat(descW - it.desc.length);
    const cmdPad = ' '.repeat(cmdW - it.cmd.length);
    const optTxt = it.opts ? ' ' + chalk.gray(it.opts) : '';
    lines.push(`  ${c(it.desc)}${descPad}${cmdColor(it.cmd)}${cmdPad}${optTxt}`);
  }
  lines.push('');
  lines.push(chalk.bold('Notes:'));
  lines.push('  - Auto-generated tags are prefixed with v if missing (manual tags unchanged).');
  lines.push('  - Use `help --expanded` for detailed flags, strategies, and configuration info.');
  console.log(lines.join('\n'));
}

function printExpandedHelp(): void {
  const header = chalk.bold.cyan('\nPrivate Registry Image Manager (prim)\n');
  const access = chalk.gray('Show this menu via any of: `prim`, `prim --help`, or `prim help --expanded`.');
  const docs = chalk.blue('📖 README: https://github.com/B00M3000/Private-Registry-Image-Manager#readme\n');

  // Build command sections data
  const sections: Array<{ title: string; options: Array<[string, string]>; notes?: string }> = [
    {
      title: chalk.green('init'),
      options: [
        ['-o, --output <file>', 'Output config file (default: ' + chalk.magenta('.registry-deploy.yaml') + ')'],
        ['    --defaults', 'Use non-interactive defaults'],
        ['    --force', 'Overwrite existing config without prompt'],
      ],
    },
    {
      title: chalk.green('build'),
      options: [
        ['-t, --tag <tag>', 'Use a specific tag (' + chalk.cyan('manual strategy') + ')'],
        ['    --build-arg <KV>', 'Repeatable build arg ' + chalk.cyan('KEY=VALUE') + ' (merges with config ' + chalk.yellow('buildArgs') + ')'],
        ['    --no-cache', 'Build without cache'],
        ['    --verbose', 'Show detailed build output'],
      ],
      notes: 'If no tag is provided, a tag is generated per ' + chalk.yellow('deployment.tagStrategy') + '. Auto tags are prefixed with ' + chalk.green('v') + ' if missing.',
    },
    {
      title: chalk.green('deploy'),
      options: [
        ['-t, --tag <tag>', 'Use a specific tag (overrides strategy)'],
        ['    --skip-build', 'Skip building and use existing local image'],
        ['    --skip-dns-check', 'Skip DNS check (overrides config)'],
        ['-f, --force', 'Skip confirmation prompts'],
        ['    --force-build', 'Force build new image instead of choosing from menu (useful for CI/CD)'],
        ['    --no-latest', 'Do not push ' + chalk.cyan(':latest') + ' tag'],
        ['    --skip-auth', 'Do not login; assume already logged in'],
      ],
      notes: 'Credentials can be provided via config or env ' + chalk.yellow('REGISTRY_USERNAME') + '/' + chalk.yellow('REGISTRY_PASSWORD') + '.',
    },
    {
      title: chalk.green('status'),
      options: [
        ['-v, --verbose', 'Show detailed information'],
        ['    --check-registry', 'Check registry DNS resolution'],
      ],
    },
    {
      title: chalk.green('test'),
      options: [
        ['-t, --tag <tag>', 'Tag to test (defaults to generated if missing locally)'],
        ['-p, --port <map>', 'Repeatable port mapping ' + chalk.cyan('HOST:CONTAINER')],
        ['-e, --env <KV>', 'Repeatable environment variable ' + chalk.cyan('KEY=VALUE')],
        ['-n, --name <name>', 'Container name (default: ' + chalk.cyan('im-test-<timestamp>') + ')'],
        ['    --no-detach', 'Run in foreground (default is ' + chalk.cyan('detached') + ')'],
        ['    --no-rm', 'Do not auto-remove container on exit'],
      ],
      notes: 'Will build first if the ' + chalk.cyan('image:tag') + ' is not present locally.',
    },
    {
      title: chalk.green('clean'),
      options: [
        ['-t, --tag <tag>', 'Clean a specific tag (' + chalk.green('v') + ' prefix optional). Without ' + chalk.yellow('-t') + ' cleans all tags.'],
        ['-y, --yes', 'Proceed without interactive confirmation'],
      ],
      notes: 'Interactive multi-select interface with persistent preferences. Auto-discovers all project images (tracked + Docker system). Use ' + chalk.cyan('SPACE') + ' to toggle selection.',
    },
  ];

  // Compute global width for flags across all sections
  const allFlags = sections.flatMap(s => s.options.map(o => o[0]));
  const width = Math.max(...allFlags.map(f => f.length));
  const fmt = (flag: string, desc: string) => `  ${chalk.yellow(flag.padEnd(width))}  ${desc}`;

  const lines: string[] = [];
  lines.push(header);
  lines.push(access);
  lines.push('');
  lines.push('');
  lines.push(docs);
  lines.push('');
  lines.push(chalk.bold.cyan('Global flags:'));
  const globalFlags: Array<[string, string]> = [
    ['-v, --verbose', 'Verbose output'],
    ['-i, -c, --config <path>', 'Use a specific configuration file (default: auto-discover)'],
  ];
  const globalWidth = Math.max(...globalFlags.map(([f]) => f.length));
  for (const [f, d] of globalFlags) lines.push(`  ${chalk.yellow(f.padEnd(globalWidth))}  ${d}`);
  lines.push('');
  lines.push(chalk.bold.cyan('Commands and options'));
  for (const sec of sections) {
    lines.push('');
    lines.push(sec.title);
    for (const [f, d] of sec.options) lines.push(fmt(f, d));
    if (sec.notes) lines.push('  ' + chalk.magenta('Notes:') + ' ' + chalk.dim(sec.notes));
  }
  lines.push('');
  lines.push(chalk.bold.cyan('Tag strategies'));
  lines.push('  ' + chalk.yellow('timestamp') + '  ' + chalk.blue('->') + ' ' + chalk.green('v') + chalk.cyan('YYYYMMDD-HHMMSS') + ' ' + chalk.gray('(UTC)'));
  lines.push('  ' + chalk.yellow('git_commit') + ' ' + chalk.blue('->') + ' ' + chalk.green('v') + chalk.cyan('<short-commit-sha>') + ' ' + chalk.gray('(fallback to timestamp if not a git repo)'));
  lines.push('  ' + chalk.yellow('git_tag') + '    ' + chalk.blue('->') + ' ' + chalk.green('v') + chalk.cyan('<nearest-git-tag>') + ' ' + chalk.gray('(fallback to git_commit)'));
  lines.push('  ' + chalk.yellow('semver') + '     ' + chalk.blue('->') + ' ' + chalk.green('v') + chalk.cyan('<package.json version>') + ' ' + chalk.gray('(fallback to timestamp)'));
  lines.push('  ' + chalk.yellow('manual') + '     ' + chalk.blue('->') + ' ' + chalk.cyan('exact tag provided') + ' ' + chalk.gray('(no automatic v-prefixing)'));
  lines.push('');
  lines.push(chalk.bold.cyan('Config and env'));
  lines.push('  ' + chalk.bold('Config discovery:') + ' prefers ' + chalk.magenta('.registry-deploy.yaml') + ' in CWD; supports legacy names; also checks ' + chalk.magenta('~/.config/registry-deploy/config.yml'));
  lines.push('  ' + chalk.bold('Credentials:') + ' username/password from config or env ' + chalk.yellow('REGISTRY_USERNAME') + '/' + chalk.yellow('REGISTRY_PASSWORD') + ' (or ' + chalk.yellow('DOCKER_USERNAME') + '/' + chalk.yellow('DOCKER_PASSWORD') + ')');
  console.log(lines.join('\n'));
}

program
  .name('prim')
  .description(chalk.cyan('A generalized container deployment CLI tool'))
  .version('1.0.0')
  .option('-v, --verbose', 'Verbose output')
  .option('-i, -c, --config <path>', 'Configuration file path')
  .hook('preAction', (thisCommand) => {
    const options = thisCommand.opts();
    Logger.setVerbose(options.verbose || false);
  });

// Init command
program
  .command('init')
  .description(chalk.green('Initialize registry deploy configuration for a new project'))
  .option('-o, --output <file>', 'Output file for configuration', '.registry-deploy.yaml')
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
  .description(chalk.green('Build Docker image'))
  .option('-t, --tag <tag>', 'Custom tag for the built image')
  .option('-c, --context <path>', 'Build context path (overrides config)')
  .option('-f, --dockerfile <path>', 'Path to Dockerfile (overrides config)')
  .option('--build-arg <arg>', 'Build arguments (KEY=VALUE)', collectBuildArgs, [])
  .option('--no-cache', 'Don\'t use cache when building')
  .option('--verbose', 'Show detailed build output')
  .action(async (options: { tag?: string; context?: string; dockerfile?: string; buildArg?: string[]; cache?: boolean; verbose?: boolean }) => {
    try {
      const config = await loadConfig(program.opts().config);
      // Commander sets `cache` to false when `--no-cache` is provided.
      // Normalize to BuildCommand's expected `noCache` boolean.
      const normalized = {
        ...options,
        noCache: options.cache === false
      } as { tag?: string; context?: string; dockerfile?: string; buildArg?: string[]; verbose?: boolean; noCache?: boolean };
      const command = new BuildCommand(normalized, config);
      await command.run();
    } catch (error) {
      Logger.error(`Build failed: ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
  });

// Deploy command
program
  .command('deploy')
  .description(chalk.green('Deploy to registry'))
  .option('-t, --tag <tag>', 'Version tag to use (overrides config strategy)')
  .option('-c, --context <path>', 'Build context path (overrides config, used when not skipping build)')
  .option('-f, --dockerfile <path>', 'Path to Dockerfile (overrides config, used when not skipping build)')
  .option('--skip-build', 'Skip building and deploy existing local image')
  .option('--skip-dns-check', 'Skip DNS check')
  .option('--force', 'Force deployment without confirmation')
  .option('--force-build', 'Force build new image instead of choosing from menu (useful for CI/CD)')
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
  .description(chalk.green('Show deployment status and information'))
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

// Test command
program
  .command('test')
  .description(chalk.green('Run the built image locally for testing'))
  .option('-t, --tag <tag>', 'Tag to test (defaults to generated)')
  .option('-c, --context <path>', 'Build context path (overrides config, used when building)')
  .option('-f, --dockerfile <path>', 'Path to Dockerfile (overrides config, used when building)')
  .option('-p, --port <port>', 'Port mapping (HOST:CONTAINER)', collectBuildArgs, [])
  .option('-e, --env <env>', 'Env var (KEY=VALUE)', collectBuildArgs, [])
  .option('-n, --name <name>', 'Container name')
  .option('--no-detach', 'Run in foreground')
  .option('--no-rm', 'Do not auto-remove container on exit')
  .action(async (options) => {
    try {
      const config = await loadConfig(program.opts().config);
      const command = new TestCommand(options, config);
      await command.run();
    } catch (error) {
      Logger.error(`Test failed: ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
  });

// Clean command
program
  .command('clean')
  .description(chalk.green('Clean local containers/images for this project image'))
  .option('-t, --tag <tag>', 'Specific tag to clean (defaults to all)')
  .option('-y, --yes', 'Proceed without confirmation prompt')
  .action(async (options) => {
    try {
      const config = await loadConfig(program.opts().config);
      const command = new CleanCommand(options, config);
      await command.run();
    } catch (error) {
      Logger.error(`Clean failed: ${error instanceof Error ? error.message : error}`);
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
    Logger.info('Run \'prim init\' to create .registry-deploy.yaml');
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

// Help command and default behavior
program
  .command('help')
  .description(chalk.yellow('Show detailed help with commands, flags, and examples'))
  .option('-x, --expanded', 'Show expanded help')
  .action((opts: { expanded?: boolean }) => {
    if (opts.expanded) {
      printExpandedHelp();
    } else {
      printCondensedHelp();
    }
  });

// Global help decorations (for prim, prim --help, and prim help)
program.addHelpText('before', (context) => {
  // Only show for root program help
  if (context && // @ts-ignore commander types
    context.command && context.command.name && context.command.name() === 'prim') {
    const header = chalk.bold.cyan('\nPrivate Registry Image Manager (prim)\n');
    const access = chalk.gray('Show this menu via any of: `prim`, `prim --help`, or `prim help`.');
    const docs = chalk.blue('📖 Documentation: https://github.com/B00M3000/Private-Registry-Image-Manager#readme');
    const globals = `\n${chalk.bold('Global flags:')}\n  ${chalk.yellow('-v, --verbose')}        Verbose output\n  ${chalk.yellow('-c, --config <path>')}  Use a specific configuration file (default: auto-discover)\n`;
    return header + access + '\n' + docs + globals + '\n';
  }
  return '';
});

// Remove the previous dynamic 'after' help since expanded help is now fully custom
// Intercept root help requests and provide condensed/expanded custom help
const argv = process.argv.slice(2);
const rootHelpFlags = new Set(['--help', '-h', '--expanded', '-x']);
const isRootHelpOnly = argv.length > 0 && argv.every((a) => rootHelpFlags.has(a));

if (argv.length === 0) {
  // prim -> condensed help
  printCondensedHelp();
} else if (isRootHelpOnly) {
  const expanded = argv.includes('--expanded') || argv.includes('-x');
  if (expanded) printExpandedHelp(); else printCondensedHelp();
} else {
  // Parse arguments normally
  program.parse();
}
