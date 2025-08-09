import { Config } from '../config/config';
import { Logger } from '../utils/logger';
import { DockerClient } from '../utils/docker';
import { TagGenerator } from '../utils/tag-generator';

interface TestOptions {
  tag?: string;
  port?: string[]; // e.g., 8080:80
  env?: string[]; // e.g., KEY=VALUE
  detach?: boolean;
  name?: string;
  rm?: boolean;
}

export class TestCommand {
  constructor(private options: TestOptions, private config: Config) {}

  async run(): Promise<void> {
    const docker = new DockerClient();
    await docker.checkAvailability();

    const tag = this.options.tag || await TagGenerator.generate(this.config.deployment.tagStrategy, {
      projectRoot: process.cwd(),
      projectVersion: this.config.project.version
    });

    const localImage = `${this.config.docker.localImageName}:${tag}`;

    Logger.header('Local Test Run');
    Logger.step(`Image: ${localImage}`);

    // Ensure image is present; if not, build it
    const info = await docker.getImageInfo(localImage);
    if (!info || !info.trim()) {
      Logger.info('Image not found locally; building first...');
      await docker.buildImage(
        this.config.docker.buildContext,
        this.config.project.dockerfile,
        localImage,
        this.config.docker.buildArgs,
        false
      );
    }

    const containerName = this.options.name || `im-test-${Date.now()}`;
    await docker.runContainer(localImage, {
      name: containerName,
      ports: this.options.port || [],
      env: this.parseKeyValue(this.options.env || []),
      detach: this.options.detach !== false, // default true
      rm: this.options.rm !== false, // default true
    });

    Logger.success(`Started container: ${containerName}`);
  }

  private parseKeyValue(items: string[]): Record<string, string> {
    const out: Record<string, string> = {};
    for (const item of items) {
      const idx = item.indexOf('=');
      if (idx > 0) {
        out[item.slice(0, idx)] = item.slice(idx + 1);
      }
    }
    return out;
  }
}
