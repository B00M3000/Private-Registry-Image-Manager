import * as dns from 'dns';
import { Config } from '../config/config';
import { Logger } from '../utils/logger';
import { DockerClient } from '../utils/docker';
import { ImageTracker } from '../utils/image-tracker';
import { CleanPreferencesManager } from '../utils/clean-preferences';

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
    Logger.step(`Build context: ${this.config.docker.buildContext}`);
    if (this.config.project.dockerfile) {
      Logger.step(`Dockerfile: ${this.config.project.dockerfile}`);
    }

    // Show build context information
    Logger.header('Build Context');
    try {
      const contextInfo = await docker.getBuildContextInfo(this.config.docker.buildContext);
      Logger.step(`Path: ${contextInfo.path}`);
      Logger.step(`Files: ${contextInfo.fileCount} (estimated)`);
      Logger.step(`Dockerignore: ${contextInfo.hasDockerignore ? 'Yes' : 'No'}`);
      if (this.options.verbose && contextInfo.hasDockerignore) {
        Logger.info('Note: File count may be reduced by .dockerignore rules');
      }
    } catch (error) {
      Logger.warning(`Build context check failed: ${error instanceof Error ? error.message : error}`);
    }

    // Show tracked images
    Logger.header('Tracked Images');
    try {
      const storageInfo = await ImageTracker.getStorageInfo();
      Logger.info(`Storage: ${storageInfo.dir}`);
      Logger.info(`All tracked images (across all repositories): ${storageInfo.imageCount}`);

      if (img) {
        const trackedImages = await ImageTracker.getTrackedImages(process.cwd(), img);
        if (trackedImages.length > 0) {
          Logger.info(`Tracked images images: ${trackedImages.length}`);
          if (this.options.verbose) {
            for (const tracked of trackedImages.slice(0, 10)) {
              const builtAt = new Date(tracked.builtAt).toLocaleString();
              const sizeInfo = tracked.size ? ` (${tracked.size})` : '';
              Logger.step(`  ${tracked.tag} - built ${builtAt}${sizeInfo}`);
            }
            if (trackedImages.length > 10) {
              Logger.step(`  ... and ${trackedImages.length - 10} more`);
            }
          }
        } else {
          Logger.info('No tracked images for this project');
        }

        // Show clean preferences
        const excludedTags = await CleanPreferencesManager.getExcludedTags(process.cwd(), img);
        if (excludedTags.length > 0) {
          Logger.info(`Clean preferences: ${excludedTags.length} images excluded from auto-cleanup`);
          if (this.options.verbose) {
            for (const tag of excludedTags) {
              Logger.step(`  Excluded: ${tag}`);
            }
          }
        }
      }
    } catch (error) {
      Logger.warning(`Failed to load tracked images: ${error instanceof Error ? error.message : error}`);
    }

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
