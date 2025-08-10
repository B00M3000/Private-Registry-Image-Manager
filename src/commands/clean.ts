import { Config } from '../config/config';
import { Logger } from '../utils/logger';
import { DockerClient } from '../utils/docker';
import { ImageTracker } from '../utils/image-tracker';
import { CleanPreferencesManager } from '../utils/clean-preferences';
import inquirer from 'inquirer';

interface CleanOptions {
  tag?: string;
  yes?: boolean;
}

interface ImageToClean {
  image: string;
  tag: string;
  size?: string;
  created?: string;
  isTracked: boolean;
  containers: string[];
}

export class CleanCommand {
  constructor(private options: CleanOptions, private config: Config) {}

  async run(): Promise<void> {
    const docker = new DockerClient();
    await docker.checkAvailability();

    const projectPath = process.cwd();
    const localRepo = this.config.docker.localImageName;
    const registryRepo = `${this.config.getRegistryHost()}/${this.config.registry.repository}`;

    // Clean up stale preferences
    await CleanPreferencesManager.cleanupStalePreferences();

    if (this.options.tag) {
      // Handle specific tag cleanup
      await this.cleanSpecificTag(docker, projectPath, localRepo, registryRepo);
      return;
    }

    // Get all relevant images
    const imagesToClean = await this.gatherAllRelevantImages(docker, projectPath, localRepo, registryRepo);

    if (imagesToClean.length === 0) {
      Logger.info('No images found to clean.');
      return;
    }

    Logger.header('Cleanup');
    Logger.step(`Local repo: ${localRepo}`);
    Logger.step(`Registry repo: ${registryRepo}`);

    let selectedImages: ImageToClean[];

    if (this.options.yes) {
      // Auto-select all images when using --yes flag
      selectedImages = imagesToClean;
    } else {
      // Interactive multi-select with persistent preferences
      selectedImages = await this.selectImagesInteractively(imagesToClean, projectPath, localRepo);
    }

    if (selectedImages.length === 0) {
      Logger.info('No images selected for cleanup.');
      return;
    }

    // Perform cleanup
    await this.performCleanup(docker, selectedImages, projectPath, localRepo);
  }

  private async cleanSpecificTag(docker: DockerClient, projectPath: string, localRepo: string, registryRepo: string): Promise<void> {
    const normalizedTag = this.options.tag!.startsWith('v') ? this.options.tag! : `v${this.options.tag!}`;
    const targets = [
      `${localRepo}:${normalizedTag}`,
      `${registryRepo}:${normalizedTag}`
    ];

    const existingTargets: string[] = [];
    for (const target of targets) {
      if (await docker.imageExists(target)) {
        existingTargets.push(target);
      }
    }

    if (existingTargets.length === 0) {
      Logger.info(`No images found with tag: ${normalizedTag}`);
      return;
    }

    // Remove containers and images
    for (const target of existingTargets) {
      const containers = await docker.listContainersByAncestor(target);
      if (containers.length > 0) {
        Logger.info(`Removing ${containers.length} container(s) for ${target}...`);
        await docker.removeContainers(containers);
      }
      Logger.info(`Removing image: ${target}`);
      await docker.removeImage(target);
    }

    // Clean up tracking
    await ImageTracker.removeTrackedImage(projectPath, localRepo, normalizedTag);
    Logger.success(`Cleanup complete for tag: ${normalizedTag}`);
  }

  private async gatherAllRelevantImages(
    docker: DockerClient,
    projectPath: string,
    localRepo: string,
    registryRepo: string
  ): Promise<ImageToClean[]> {
    const imagesToClean: ImageToClean[] = [];

    // Get tracked images
    const trackedImages = await ImageTracker.getTrackedImages(projectPath, localRepo);

    // Get all Docker images for this project
    const dockerImages = await docker.getAllProjectImages(localRepo, registryRepo);

    // Create a map to avoid duplicates and merge information
    const imageMap = new Map<string, ImageToClean>();

    // Add tracked images
    for (const tracked of trackedImages) {
      const imageKey = `${localRepo}:${tracked.tag}`;
      const containers = await docker.listContainersByAncestor(imageKey);

      imageMap.set(imageKey, {
        image: imageKey,
        tag: tracked.tag,
        size: tracked.size,
        created: tracked.builtAt,
        isTracked: true,
        containers
      });
    }

    // Add Docker images (may include registry images found locally)
    for (const dockerImg of dockerImages) {
      const containers = await docker.listContainersByAncestor(dockerImg.image);

      if (imageMap.has(dockerImg.image)) {
        // Merge information if already exists from tracking
        const existing = imageMap.get(dockerImg.image)!;
        existing.size = existing.size || dockerImg.size;
        existing.created = existing.created || dockerImg.created;
        existing.containers = containers;
      } else {
        // Add new image
        imageMap.set(dockerImg.image, {
          image: dockerImg.image,
          tag: dockerImg.tag,
          size: dockerImg.size,
          created: dockerImg.created,
          isTracked: false,
          containers
        });
      }
    }

    return Array.from(imageMap.values()).sort((a, b) => {
      // Sort by creation date, newest first
      const dateA = new Date(a.created || 0);
      const dateB = new Date(b.created || 0);
      return dateB.getTime() - dateA.getTime();
    });
  }

  private async selectImagesInteractively(
    imagesToClean: ImageToClean[],
    projectPath: string,
    localRepo: string
  ): Promise<ImageToClean[]> {

    // Get previously excluded tags
    const excludedTags = await CleanPreferencesManager.getExcludedTags(projectPath, localRepo);

    // Create choices with all images initially selected except previously excluded ones
    const choices = imagesToClean.map(img => {
      const isExcluded = excludedTags.includes(img.tag);
      const sizeInfo = img.size ? ` (${img.size})` : '';
      const createdInfo = img.created ? ` - ${img.created}` : '';
      const trackedInfo = img.isTracked ? ' [tracked]' : '';
      const containerInfo = img.containers.length > 0 ? ` - ${img.containers.length} container(s)` : '';

      return {
        name: `${img.image}${sizeInfo}${createdInfo}${trackedInfo}${containerInfo}`,
        value: img,
        checked: !isExcluded // Initially checked unless previously excluded
      };
    });

    Logger.info('\nSelect images to clean (use SPACE to toggle, Y to confirm, N to cancel):');
    Logger.info('Images are pre-selected based on your previous choices.');

    const { selectedImages } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'selectedImages',
        message: 'Images to clean:',
        choices,
        pageSize: Math.min(15, choices.length)
      }
    ]);

    // Save preferences if user chose to save
    const newExcludedTags = imagesToClean
      .filter(img => !selectedImages.find((selected: ImageToClean) => selected.tag === img.tag))
      .map(img => img.tag);

    await CleanPreferencesManager.saveExcludedTags(projectPath, localRepo, newExcludedTags);

    if (newExcludedTags.length > 0) {
      Logger.debug(`Saved preferences to exclude ${newExcludedTags.length} images from future cleanups`);
    }

    return selectedImages;
  }

  private async performCleanup(docker: DockerClient, selectedImages: ImageToClean[], projectPath: string, localRepo: string): Promise<void> {
    Logger.info(`\nCleaning up ${selectedImages.length} selected images...`);

    // Remove containers first
    for (const img of selectedImages) {
      if (img.containers.length > 0) {
        Logger.info(`Removing ${img.containers.length} container(s) for ${img.image}...`);
        await docker.removeContainers(img.containers);
      }
    }

    // Remove images
    for (const img of selectedImages) {
      Logger.info(`Removing image: ${img.image}`);
      await docker.removeImage(img.image);
    }

    // Clean up tracking for removed images
    for (const img of selectedImages) {
      if (img.isTracked) {
        await ImageTracker.removeTrackedImage(projectPath, localRepo, img.tag);
      }
    }

    const trackedCount = selectedImages.filter(img => img.isTracked).length;
    if (trackedCount > 0) {
      Logger.debug(`Removed tracking for ${trackedCount} images`);
    }

    Logger.success('Cleanup complete');
  }
}
