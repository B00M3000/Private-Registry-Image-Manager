import * as dns from 'dns';
import { Config } from '../config/config';
import { Logger } from '../utils/logger';
import { DockerClient } from '../utils/docker';

interface StatusOptions {
  verbose?: boolean;
  checkRegistry?: boolean;
}

export class StatusCommand {
  constructor(private options: StatusOptions, private config: Config) {}

  async run(): Promise<void> {
    const docker = new DockerClient();

    Logger.header('Environment');
    try {
      const version = await docker.getVersion();
      Logger.info(`Docker client: ${version}`);
    } catch {
      Logger.warning('Docker not available');
    }

  Logger.header('Config');
  const img = this.config.project.imageName || this.config.project.name;
  Logger.step(`Image: ${img}`);
    Logger.step(`Registry: ${this.config.registry.url}/${this.config.registry.repository}`);
    Logger.step(`Tag strategy: ${this.config.deployment.tagStrategy}`);

    if (this.options.checkRegistry) {
      const host = this.config.getRegistryHost();
      Logger.header('Registry check');
      try {
        const res = await dns.promises.lookup(host);
        Logger.success(`DNS OK: ${host} -> ${res.address}`);
      } catch (e) {
        Logger.error(`DNS failed for ${host}: ${e instanceof Error ? e.message : e}`);
      }
    }
  }
}
