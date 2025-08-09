import * as fs from 'fs/promises';
import * as path from 'path';
import inquirer from 'inquirer';
import { Config, TagStrategy, ConfigData } from '../config/config';
import { Logger } from '../utils/logger';

interface InitOptions {
  output: string;
  defaults: boolean;
  force: boolean;
}

export class InitCommand {
  constructor(private options: InitOptions) {}

  async run(): Promise<void> {
    Logger.info('Initializing container-deploy configuration');

    // Check if file exists
    try {
      await fs.access(this.options.output);
      if (!this.options.force) {
        const { overwrite } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'overwrite',
            message: `Configuration file '${this.options.output}' already exists. Overwrite?`,
            default: false
          }
        ]);

        if (!overwrite) {
          Logger.info('Configuration initialization cancelled');
          return;
        }
      }
    } catch {
      // File doesn't exist, which is fine
    }

    const config = this.options.defaults
      ? await this.createDefaultConfig()
      : await this.createInteractiveConfig();

    await config.save(this.options.output);
    Logger.success(`Configuration saved to: ${this.options.output}`);

    this.showNextSteps();
  }

  private async createDefaultConfig(): Promise<Config> {
    Logger.info('Creating configuration with default values');

    const currentDir = process.cwd();
    const projectName = path.basename(currentDir);

    const configData: ConfigData = {
      project: {
        name: projectName,
        version: undefined,
        dockerfile: 'Dockerfile'
      },
      registry: {
        url: 'registry.example.com',
        repository: projectName
      },
      docker: {
        localImageName: projectName,
        buildArgs: {},
        buildContext: '.'
      },
      deployment: {
        tagStrategy: TagStrategy.GIT_COMMIT,
        autoCleanup: false,
        pushLatest: true,
        dnsCheck: true
      }
    };

    return new Config(configData);
  }

  private async createInteractiveConfig(): Promise<Config> {
    const currentDir = process.cwd();
    const projectName = path.basename(currentDir);

    const answers = await inquirer.prompt<{
      projectName: string;
      dockerfile: string | undefined;
      registryUrl: string;
      repository: string;
      username?: string;
      password?: string;
      tagStrategy: TagStrategy;
      pushLatest: boolean;
      dnsCheck: boolean;
      autoCleanup: boolean;
    }>([
      { type: 'input', name: 'projectName', message: 'Project name', default: projectName },
      { type: 'input', name: 'dockerfile', message: 'Dockerfile path (optional)', default: 'Dockerfile' },
      { type: 'input', name: 'registryUrl', message: 'Registry URL (e.g., registry.example.com)', default: 'registry.example.com' },
      { type: 'input', name: 'repository', message: 'Registry repository (e.g., my/app)', default: projectName },
      { type: 'input', name: 'username', message: 'Registry username (leave blank to use env)', default: '' },
      { type: 'password', name: 'password', message: 'Registry password (leave blank to use env)', mask: '*' },
      { type: 'list', name: 'tagStrategy', message: 'Tag strategy', choices: [
        { name: 'Git commit', value: TagStrategy.GIT_COMMIT },
        { name: 'Git tag', value: TagStrategy.GIT_TAG },
        { name: 'Timestamp', value: TagStrategy.TIMESTAMP },
        { name: 'Semver (package.json version)', value: TagStrategy.SEMVER },
        { name: 'Manual (provide --tag)', value: TagStrategy.MANUAL },
      ], default: TagStrategy.GIT_COMMIT },
      { type: 'confirm', name: 'pushLatest', message: 'Also push latest tag?', default: true },
      { type: 'confirm', name: 'dnsCheck', message: 'Enable DNS check before deploy?', default: true },
      { type: 'confirm', name: 'autoCleanup', message: 'Clean up local images after deploy?', default: false },
    ]);

    const configData: ConfigData = {
      project: {
        name: answers.projectName,
        dockerfile: answers.dockerfile || undefined,
      },
      registry: {
        url: answers.registryUrl,
        repository: answers.repository,
        username: answers.username || undefined,
        password: answers.password || undefined,
      },
      docker: {
        localImageName: answers.projectName,
        buildArgs: {},
        buildContext: '.',
      },
      deployment: {
        tagStrategy: answers.tagStrategy,
        pushLatest: answers.pushLatest,
        dnsCheck: answers.dnsCheck,
        autoCleanup: answers.autoCleanup,
      },
    };

    return new Config(configData);
  }

  private showNextSteps(): void {
    Logger.header('Next steps');
    Logger.step('Edit container-deploy.yml if needed');
    Logger.step('Run: container-deploy build');
    Logger.step('Run: container-deploy deploy');
  }
}
