import { Config } from '../config/config';
import { Logger } from '../utils/logger';
import { DockerClient } from '../utils/docker';
import { TagGenerator } from '../utils/tag-generator';

interface BuildOptions {
  tag?: string;
  buildArg?: string[];
  noCache?: boolean;
  verbose?: boolean;
}

export class BuildCommand {
  constructor(private options: BuildOptions, private config: Config) {}

  async run(): Promise<void> {
    const docker = new DockerClient();
    await docker.checkAvailability();

    const tag = await this.resolveTag();
    const localImage = `${this.config.docker.localImageName}:${tag}`;

    const buildArgs = this.parseBuildArgs(this.options.buildArg || []);
    Logger.header('Build');
    Logger.step(`Context: ${this.config.docker.buildContext}`);
    if (this.config.project.dockerfile) Logger.step(`Dockerfile: ${this.config.project.dockerfile}`);
    Logger.step(`Image: ${localImage}`);

    await docker.buildImage(
      this.config.docker.buildContext,
      this.config.project.dockerfile,
      localImage,
      { ...this.config.docker.buildArgs, ...buildArgs },
      !!this.options.noCache
    );

    Logger.success(`Build complete -> ${localImage}`);
  }

  private async resolveTag(): Promise<string> {
    if (this.options.tag) return this.options.tag;
    return TagGenerator.generate(this.config.deployment.tagStrategy, {
      projectRoot: process.cwd(),
      projectVersion: this.config.project.version
    });
  }

  private parseBuildArgs(items: string[]): Record<string, string> {
    const map: Record<string, string> = {};
    for (const item of items) {
      const idx = item.indexOf('=');
      if (idx > 0) {
        const k = item.slice(0, idx);
        const v = item.slice(idx + 1);
        if (k) map[k] = v;
      }
    }
    return map;
  }
}
