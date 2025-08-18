import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as yaml from 'js-yaml';

export interface ProjectConfig {
  imageName?: string; // preferred
  name?: string; // legacy compatibility
  version?: string;
  dockerfile?: string;
}

export interface RegistryConfig {
  url: string;
  repository: string;
  username?: string;
  password?: string;
  insecure?: boolean;
}

export interface DockerConfig {
  localImageName: string;
  buildArgs: Record<string, string>;
  buildContext: string;
}

export interface DeploymentConfig {
  tagStrategy: TagStrategy;
  autoCleanup: boolean;
  pushLatest: boolean;
  dnsCheck: boolean;
}

export enum TagStrategy {
  TIMESTAMP = 'timestamp',
  GIT_COMMIT = 'git_commit',
  GIT_TAG = 'git_tag',
  MANUAL = 'manual',
  SEMVER = 'semver'
}

export interface ConfigData {
  project: ProjectConfig;
  registry: RegistryConfig;
  docker: DockerConfig;
  deployment: DeploymentConfig;
}

export class Config {
  public readonly project: ProjectConfig;
  public readonly registry: RegistryConfig;
  public readonly docker: DockerConfig;
  public readonly deployment: DeploymentConfig;

  constructor(data: ConfigData) {
    // Map legacy 'name' to 'imageName' if needed
    const proj: ProjectConfig = { ...data.project };
    if (!proj.imageName && proj.name) {
      proj.imageName = proj.name;
    }
    this.project = proj;
    this.registry = data.registry;
    this.docker = {
      localImageName: data.docker.localImageName || proj.imageName || 'app',
      buildArgs: data.docker.buildArgs || {},
      buildContext: data.docker.buildContext || '.'
    };
    this.deployment = {
      tagStrategy: data.deployment.tagStrategy || TagStrategy.TIMESTAMP,
      autoCleanup: data.deployment.autoCleanup || false,
      pushLatest: data.deployment.pushLatest !== false,
      dnsCheck: data.deployment.dnsCheck !== false
    };
  }

  static async discover(): Promise<Config> {
    const configFiles = [
      // Preferred names
      '.registry-deploy.yaml',
      '.registry-deploy.yml',
      'image-manager.yml',
      'image-manager.yaml',
      '.image-manager.yml',
      '.image-manager.yaml',
      'image-manager.json',
      '.image-manager.json',
      // Backwards compatibility
      'container-deploy.yml',
      'container-deploy.yaml',
      '.container-deploy.yml',
      '.container-deploy.yaml',
      'container-deploy.json',
      '.container-deploy.json'
    ];

    // Check current directory
    for (const file of configFiles) {
      try {
        await fs.access(file);
        return await Config.fromFile(file);
      } catch {
        // File doesn't exist, continue
      }
    }

  // Check global config directory (preferred)
  const globalConfigDirNew = path.join(os.homedir(), '.config', 'registry-deploy');
    const globalConfigNew = path.join(globalConfigDirNew, 'config.yml');
    try {
      await fs.access(globalConfigNew);
      return await Config.fromFile(globalConfigNew);
    } catch {
      // New global config doesn't exist
    }

    // Fallback to legacy global config directory
    const globalConfigDirLegacy = path.join(os.homedir(), '.config', 'container-deploy');
    const globalConfigLegacy = path.join(globalConfigDirLegacy, 'config.yml');
    try {
      await fs.access(globalConfigLegacy);
      return await Config.fromFile(globalConfigLegacy);
    } catch {
      // Legacy global config doesn't exist
    }

  throw new Error('No configuration file found. Run \'prim init\' to create .registry-deploy.yaml.');
  }

  static async fromFile(filePath: string): Promise<Config> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const ext = path.extname(filePath).toLowerCase();

      let data: ConfigData;
      if (ext === '.json') {
        data = JSON.parse(content);
      } else {
        data = yaml.load(content) as ConfigData;
      }

      const config = new Config(data);
      config.validate();
      return config;
    } catch (error) {
      throw new Error(`Failed to load config from ${filePath}: ${error instanceof Error ? error.message : error}`);
    }
  }

  async save(filePath: string): Promise<void> {
    const data: ConfigData = {
      project: {
        // Always save preferred field
        imageName: this.project.imageName,
        version: this.project.version,
        dockerfile: this.project.dockerfile
      },
      registry: this.registry,
      docker: this.docker,
      deployment: this.deployment
    };

    const ext = path.extname(filePath).toLowerCase();
    let content: string;

    if (ext === '.json') {
      content = JSON.stringify(data, null, 2);
    } else {
      content = yaml.dump(data, {
        indent: 2,
        lineWidth: -1,
        noRefs: true,
        sortKeys: true
      });
    }

    await fs.writeFile(filePath, content, 'utf-8');
  }

  validate(): void {
    const img = this.project.imageName || this.project.name;
    if (!img?.trim()) {
      throw new Error('Image name cannot be empty');
    }

    if (!this.registry.url?.trim()) {
      throw new Error('Registry URL cannot be empty');
    }

    if (!this.registry.repository?.trim()) {
      throw new Error('Registry repository cannot be empty');
    }

    // Validate URL format
    try {
      const url = this.registry.url.includes('://')
        ? this.registry.url
        : `https://${this.registry.url}`;
      new URL(url);
    } catch {
      throw new Error(`Invalid registry URL: ${this.registry.url}`);
    }
  }

  getFullImageName(tag: string): string {
    const registryUrl = this.registry.url.replace(/\/$/, ''); // Remove trailing slash
    return `${registryUrl}/${this.registry.repository}:${tag}`;
  }

  getRegistryHost(): string {
    return this.registry.url
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '');
  }

  getCredentials(): { username?: string; password?: string } {
    return {
      username: this.registry.username || process.env.REGISTRY_USERNAME || process.env.DOCKER_USERNAME,
      password: this.registry.password || process.env.REGISTRY_PASSWORD || process.env.DOCKER_PASSWORD
    };
  }
}
