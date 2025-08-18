import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { Logger } from './logger';

export interface TrackedImage {
  imageName: string;
  tag: string;
  fullImageName: string;
  projectPath: string;
  builtAt: string;
  size?: string;
  dockerfile?: string;
  buildArgs?: Record<string, string>;
}

export class ImageTracker {
  private static getStorageDir(): string {
    // Use appropriate system location for non-permanent storage
    if (process.platform === 'win32') {
      return path.join(os.tmpdir(), 'prim-images');
    }
    // For Linux/Unix systems, prefer /var/tmp (survives reboots) over /tmp
    return '/var/tmp/prim-images';
  }

  private static getTrackingFile(): string {
    return path.join(this.getStorageDir(), 'tracked-images.json');
  }

  private static async ensureStorageDir(): Promise<void> {
    const dir = this.getStorageDir();
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      Logger.warning(`Could not create image tracking directory: ${dir}`);
      throw error;
    }
  }

  static async trackImage(image: TrackedImage): Promise<void> {
    try {
      await this.ensureStorageDir();

      const existing = await this.loadTrackedImages();
      const key = `${image.projectPath}:${image.imageName}:${image.tag}`;

      // Update or add the image
      existing[key] = image;

      const trackingFile = this.getTrackingFile();
      await fs.writeFile(trackingFile, JSON.stringify(existing, null, 2), 'utf-8');

      Logger.debug(`Tracked image: ${image.fullImageName}`);
    } catch (error) {
      Logger.warning(`Failed to track image: ${error instanceof Error ? error.message : error}`);
    }
  }

  static async getTrackedImages(projectPath: string, imageName: string): Promise<TrackedImage[]> {
    try {
      const tracked = await this.loadTrackedImages();
      const prefix = `${projectPath}:${imageName}:`;

      return Object.entries(tracked)
        .filter(([key]) => key.startsWith(prefix))
        .map(([, image]) => image)
        .sort((a, b) => new Date(b.builtAt).getTime() - new Date(a.builtAt).getTime());
    } catch {
      return [];
    }
  }

  static async hasTrackedImage(projectPath: string, imageName: string, tag: string): Promise<boolean> {
    try {
      const tracked = await this.loadTrackedImages();
      const key = `${projectPath}:${imageName}:${tag}`;
      return key in tracked;
    } catch {
      return false;
    }
  }

  static async getTrackedImage(projectPath: string, imageName: string, tag: string): Promise<TrackedImage | null> {
    try {
      const tracked = await this.loadTrackedImages();
      const key = `${projectPath}:${imageName}:${tag}`;
      return tracked[key] || null;
    } catch {
      return null;
    }
  }

  static async removeTrackedImage(projectPath: string, imageName: string, tag: string): Promise<void> {
    try {
      const tracked = await this.loadTrackedImages();
      const key = `${projectPath}:${imageName}:${tag}`;

      if (key in tracked) {
        delete tracked[key];
        const trackingFile = this.getTrackingFile();
        await fs.writeFile(trackingFile, JSON.stringify(tracked, null, 2), 'utf-8');
        Logger.debug(`Removed tracked image: ${imageName}:${tag}`);
      }
    } catch (error) {
      Logger.warning(`Failed to remove tracked image: ${error instanceof Error ? error.message : error}`);
    }
  }

  static async cleanupStaleImages(): Promise<void> {
    try {
      const tracked = await this.loadTrackedImages();
      const now = new Date();
      const staleThreshold = 7 * 24 * 60 * 60 * 1000; // 7 days

      let cleaned = 0;
      for (const [key, image] of Object.entries(tracked)) {
        const builtAt = new Date(image.builtAt);
        if (now.getTime() - builtAt.getTime() > staleThreshold) {
          delete tracked[key];
          cleaned++;
        }
      }

      if (cleaned > 0) {
        const trackingFile = this.getTrackingFile();
        await fs.writeFile(trackingFile, JSON.stringify(tracked, null, 2), 'utf-8');
        Logger.debug(`Cleaned up ${cleaned} stale tracked images`);
      }
    } catch (error) {
      Logger.debug(`Failed to cleanup stale images: ${error instanceof Error ? error.message : error}`);
    }
  }

  private static async loadTrackedImages(): Promise<Record<string, TrackedImage>> {
    try {
      const trackingFile = this.getTrackingFile();
      const content = await fs.readFile(trackingFile, 'utf-8');
      return JSON.parse(content);
    } catch {
      return {};
    }
  }

  static async getStorageInfo(): Promise<{ dir: string; exists: boolean; imageCount: number }> {
    const dir = this.getStorageDir();
    try {
      await fs.access(dir);
      const tracked = await this.loadTrackedImages();
      return {
        dir,
        exists: true,
        imageCount: Object.keys(tracked).length
      };
    } catch {
      return {
        dir,
        exists: false,
        imageCount: 0
      };
    }
  }
}
