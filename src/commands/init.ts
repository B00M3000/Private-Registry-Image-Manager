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

  const projectName = await this.getDefaultImageName();

    const imageName = this.sanitizeImageName(projectName);
    const configData: ConfigData = {
      project: {
        imageName,
        version: undefined,
        dockerfile: 'Dockerfile'
      },
      registry: {
        url: 'registry.example.com',
        repository: imageName
      },
      docker: {
        localImageName: imageName,
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
  const projectName = await this.getDefaultImageName();

    const answers = await inquirer.prompt<{
      imageName: string;
      namespace?: string;
      dockerfile: string | undefined;
      registryUrl: string;
      username?: string;
      password?: string;
      tagStrategy: TagStrategy;
      pushLatest: boolean;
      dnsCheck: boolean;
      autoCleanup: boolean;
    }>([
  { type: 'input', name: 'imageName', message: 'Image name', default: this.sanitizeImageName(projectName) },
      { type: 'input', name: 'namespace', message: 'Namespace (optional)', default: '' },
      { type: 'input', name: 'dockerfile', message: 'Dockerfile path', default: 'Dockerfile' },
      { type: 'input', name: 'registryUrl', message: 'Registry', default: 'registry.example.com' },
      { type: 'input', name: 'username', message: 'Registry username (leave blank to use env)' },
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

  const img = this.sanitizeImageName(answers.imageName);
  const ns = (answers.namespace || '').trim().replace(/^\/+|\/+$/g, '');
  const repo = ns ? `${ns}/${img}` : img;

    const configData: ConfigData = {
      project: {
        imageName: img,
        dockerfile: answers.dockerfile || undefined,
      },
      registry: {
        url: answers.registryUrl,
        repository: repo,
        username: answers.username || undefined,
        password: answers.password || undefined,
      },
      docker: {
        localImageName: img,
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

  private sanitizeImageName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private showNextSteps(): void {
    Logger.header('Next steps');
    Logger.step('Edit .registry-deploy.yaml if needed');
    Logger.warning('SECURITY NOTICE: If your .registry-deploy.yaml contains credentials,');
    Logger.warning('ensure it is added to .gitignore to prevent accidentally committing secrets.');
    Logger.step('Run: prim build');
    Logger.step('Run: prim deploy');
  }

  private async getDefaultImageName(): Promise<string> {
    const currentDir = process.cwd();
    const pkgPath = path.join(currentDir, 'package.json');
    try {
      const content = await fs.readFile(pkgPath, 'utf-8');
      const pkg = JSON.parse(content) as { name?: string };
      if (pkg.name) {
        // Normalize package name to an image-friendly name
        // Handle scoped names like @scope/name
        const base = pkg.name.includes('/') ? pkg.name.split('/')[1] : pkg.name;
        const normalized = base
          .toLowerCase()
          .replace(/[^a-z0-9._-]/g, '-')
          .replace(/^-+|-+$/g, '');
        if (normalized) return normalized;
      }
    } catch {
      // ignore and fallback
    }
    return path.basename(currentDir).toLowerCase().replace(/[^a-z0-9._-]/g, '-');
  }
}
