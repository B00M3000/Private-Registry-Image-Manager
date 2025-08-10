import { Config } from '../config/config';
import { Logger } from '../utils/logger';
import { DockerClient } from '../utils/docker';
import { TagGenerator } from '../utils/tag-generator';
import { ImageTracker } from '../utils/image-tracker';
import inquirer from 'inquirer';

interface TestOptions {
  tag?: string;
  port?: string[]; // e.g., 8080:80
  env?: string[]; // e.g., KEY=VALUE
  detach?: boolean;
  name?: string;
  rm?: boolean;
}

export class TestCommand {
  constructor(private options: TestOptions, private config: Config) { }

  async run(): Promise<void> {
    const docker = new DockerClient();
    await docker.checkAvailability();

    let tag = this.options.tag;
    let localImage: string;

    if (!tag) {
      // Check for tracked images
      const trackedImages = await ImageTracker.getTrackedImages(
        process.cwd(),
        this.config.docker.localImageName
      );

      if (trackedImages.length > 0) {
        Logger.info('Found previously built images:');
        const choices = trackedImages.slice(0, 5).map((img, index) => ({
          name: `${img.tag} (built ${new Date(img.builtAt).toLocaleString()}${img.size ? `, ${img.size}` : ''})`,
          value: img.tag,
          short: img.tag
        }));

        choices.push({
          name: 'Build new image with generated tag',
          value: '__build_new__',
          short: 'Build new'
        });

        const { selectedTag } = await inquirer.prompt([
          {
            type: 'list',
            name: 'selectedTag',
            message: 'Which image would you like to test?',
            choices
          }
        ]);

        if (selectedTag === '__build_new__') {
          tag = await TagGenerator.generate(this.config.deployment.tagStrategy, {
            projectRoot: process.cwd(),
            projectVersion: this.config.project.version
          });
        } else {
          tag = selectedTag;
        }
      } else {
        tag = await TagGenerator.generate(this.config.deployment.tagStrategy, {
          projectRoot: process.cwd(),
          projectVersion: this.config.project.version
        });
      }
    }

    // At this point tag is guaranteed to be defined
    localImage = `${this.config.docker.localImageName}:${tag}`;

    Logger.header('Local Test Run');
    Logger.step(`Image: ${localImage}`);

    // Ensure image is present; if not, build it
    const imageExists = await docker.imageExists(localImage);
    if (!imageExists) {
      Logger.info('Image not found locally; building first...');
      const mergedBuildArgs: Record<string, string> = {
        ...this.config.docker.buildArgs,
        TAG: tag!,
      };
      await docker.buildImage(
        this.config.docker.buildContext,
        this.config.project.dockerfile,
        localImage,
        mergedBuildArgs,
        false
      );

      // Track the newly built image
      try {
        const size = await docker.getImageSize(localImage);
        await ImageTracker.trackImage({
          imageName: this.config.docker.localImageName,
          tag: tag!, // tag is guaranteed to be defined at this point
          fullImageName: localImage,
          projectPath: process.cwd(),
          builtAt: new Date().toISOString(),
          size,
          dockerfile: this.config.project.dockerfile,
          buildArgs: mergedBuildArgs
        });
      } catch (error) {
        Logger.debug(`Failed to track image: ${error instanceof Error ? error.message : error}`);
      }
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
