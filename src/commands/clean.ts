import { Config } from '../config/config';
import { Logger } from '../utils/logger';
import { DockerClient } from '../utils/docker';
import inquirer from 'inquirer';

interface CleanOptions {
  tag?: string;
  yes?: boolean;
}

export class CleanCommand {
  constructor(private options: CleanOptions, private config: Config) {}

  async run(): Promise<void> {
    const docker = new DockerClient();
    await docker.checkAvailability();

    const localRepo = this.config.docker.localImageName;
    const registryRepo = `${this.config.getRegistryHost()}/${this.config.registry.repository}`;

    const targets = await this.resolveTargetImages(docker, localRepo, registryRepo);

    if (targets.length === 0) {
      Logger.info('No images found to clean.');
      return;
    }

    Logger.header('Cleanup');
    Logger.step(`Local repo: ${localRepo}`);
    Logger.step(`Registry repo: ${registryRepo}`);

    // Gather containers to remove
    const containerMap = new Map<string, string[]>();
    for (const img of targets) {
      const containers = await docker.listContainersByAncestor(img);
      if (containers.length) containerMap.set(img, containers);
    }

    if (!this.options.yes) {
      // Show summary and confirm
      Logger.info('The following resources will be removed:');
      for (const [img, containers] of containerMap) {
        if (containers.length) {
          Logger.info(`- Containers for ${img}: ${containers.join(', ')}`);
        }
      }
      for (const img of targets) {
        Logger.info(`- Image: ${img}`);
      }

      const answer = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'proceed',
          message: 'Proceed with deletion?',
          default: false,
        },
      ]);
      if (!answer.proceed) {
        Logger.info('Cleanup cancelled.');
        return;
      }
    }

    // Delete containers and images
    for (const [img, containers] of containerMap) {
      Logger.info(`Removing ${containers.length} container(s) for ${img}...`);
      await docker.removeContainers(containers);
    }
    for (const img of targets) {
      Logger.info(`Removing image: ${img}`);
      await docker.removeImage(img);
    }

    Logger.success('Cleanup complete');
  }

  private async resolveTargetImages(docker: DockerClient, localRepo: string, registryRepo: string): Promise<string[]> {
    const targets: string[] = [];
    if (this.options.tag) {
      const tag = this.options.tag.startsWith('v') ? this.options.tag : `v${this.options.tag}`;
      targets.push(`${localRepo}:${tag}`);
      targets.push(`${registryRepo}:${tag}`);
    } else {
      const localImages = await docker.listTaggedImages(localRepo);
      const registryImages = await docker.listTaggedImages(registryRepo);
      targets.push(...localImages, ...registryImages);
    }
    // De-duplicate entries
    return Array.from(new Set(targets));
  }
}
