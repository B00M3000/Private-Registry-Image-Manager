import * as dns from 'dns';
import inquirer from 'inquirer';
import { Config } from '../config/config';
import { Logger } from '../utils/logger';
import { DockerClient } from '../utils/docker';
import { TagGenerator } from '../utils/tag-generator';
import { ImageTracker } from '../utils/image-tracker';

interface DeployOptions {
  tag?: string;
  skipBuild?: boolean;
  skipDnsCheck?: boolean;
  force?: boolean;
  latest?: boolean; // commander --no-latest will flip this to false
  skipAuth?: boolean;
}

export class DeployCommand {
  constructor(private options: DeployOptions, private config: Config) {}

  async run(): Promise<void> {
    const docker = new DockerClient();
    await docker.checkAvailability();

    // DNS check
    if (this.config.deployment.dnsCheck && !this.options.skipDnsCheck) {
      const host = this.config.getRegistryHost();
      Logger.step(`Checking DNS for ${host}...`);
      try {
        await dns.promises.lookup(host);
        Logger.success(`DNS OK for ${host}`);
      } catch (e) {
        const msg = `DNS check failed for ${host}: ${e instanceof Error ? e.message : e}`;
        if (this.options.force) {
          Logger.warning(msg + ' (continuing due to --force)');
        } else {
          throw new Error(msg);
        }
      }
    }

    // Confirm if not forced
    if (!this.options.force) {
      const { cont } = await inquirer.prompt([
        { type: 'confirm', name: 'cont', message: 'Proceed with deployment?', default: true }
      ]);
      if (!cont) {
        Logger.info('Deployment canceled');
        return;
      }
    }

    // Resolve tag
    let tag = this.options.tag;

    if (!tag && !this.options.skipBuild) {
      // Check for tracked images if not skipping build and no tag specified
      const trackedImages = await ImageTracker.getTrackedImages(
        process.cwd(),
        this.config.docker.localImageName
      );

      if (trackedImages.length > 0 && !this.options.force) {
        Logger.info('Found previously built images:');
        const choices = trackedImages.slice(0, 5).map((img) => ({
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
            message: 'Which image would you like to deploy?',
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
    } else if (!tag) {
      tag = await TagGenerator.generate(this.config.deployment.tagStrategy, {
        projectRoot: process.cwd(),
        projectVersion: this.config.project.version
      });
    }

    // At this point tag is guaranteed to be defined
    const localImage = `${this.config.docker.localImageName}:${tag}`;
    const registryImage = this.config.getFullImageName(tag!);

    // Login
    if (!this.options.skipAuth) {
      const { username, password } = this.config.getCredentials();
      if (username && password) {
        await docker.login(this.config.getRegistryHost(), username, password);
      } else {
        Logger.warning('No registry credentials provided; assuming already logged in');
      }
    }

    // Build if needed
    if (!this.options.skipBuild) {
      await docker.buildImage(
        this.config.docker.buildContext,
        this.config.project.dockerfile,
        localImage,
        this.config.docker.buildArgs,
        false
      );

      // Track the newly built image
      try {
        const size = await docker.getImageSize(localImage);
        await ImageTracker.trackImage({
          imageName: this.config.docker.localImageName,
          tag: tag!,
          fullImageName: localImage,
          projectPath: process.cwd(),
          builtAt: new Date().toISOString(),
          size,
          dockerfile: this.config.project.dockerfile,
          buildArgs: this.config.docker.buildArgs
        });
      } catch (error) {
        Logger.debug(`Failed to track image: ${error instanceof Error ? error.message : error}`);
      }
    } else {
      Logger.info('Skipping build step');
    }

    // Tag and push main tag
    await docker.tagImage(localImage, registryImage);
    await docker.pushImage(registryImage);

    // Optionally tag/push latest
    const pushLatest = this.options.latest !== false && this.config.deployment.pushLatest !== false;
    if (pushLatest) {
      const latestImage = this.config.getFullImageName('latest');
      await docker.tagImage(localImage, latestImage);
      await docker.pushImage(latestImage);
    }

    if (this.config.deployment.autoCleanup) {
      await docker.removeImage(localImage);
      await docker.removeImage(registryImage);
      if (pushLatest) await docker.removeImage(this.config.getFullImageName('latest'));

      // Remove from tracking if cleaned up
      await ImageTracker.removeTrackedImage(process.cwd(), this.config.docker.localImageName, tag!);
    }

    Logger.success(`Deployment complete -> ${registryImage}`);
  }
}
