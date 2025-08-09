import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { Logger } from './logger';

export interface CleanPreferences {
  [projectPath: string]: {
    [imageName: string]: string[]; // Array of tags to exclude from cleanup
  };
}

export class CleanPreferencesManager {
  private static getStorageDir(): string {
    // Use same location as image tracker for consistency
    if (process.platform === 'win32') {
      return path.join(os.tmpdir(), 'prim-images');
    }
    return '/var/tmp/prim-images';
  }

  private static getPreferencesFile(): string {
    return path.join(this.getStorageDir(), 'clean-preferences.json');
  }

  private static async ensureStorageDir(): Promise<void> {
    const dir = this.getStorageDir();
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      Logger.warning(`Could not create preferences directory: ${dir}`);
      throw error;
    }
  }

  static async getExcludedTags(projectPath: string, imageName: string): Promise<string[]> {
    try {
      const preferences = await this.loadPreferences();
      return preferences[projectPath]?.[imageName] || [];
    } catch {
      return [];
    }
  }

  static async saveExcludedTags(projectPath: string, imageName: string, excludedTags: string[]): Promise<void> {
    try {
      await this.ensureStorageDir();

      const preferences = await this.loadPreferences();

      if (!preferences[projectPath]) {
        preferences[projectPath] = {};
      }

      if (excludedTags.length > 0) {
        preferences[projectPath][imageName] = excludedTags;
      } else {
        // Remove empty entries
        delete preferences[projectPath][imageName];
        if (Object.keys(preferences[projectPath]).length === 0) {
          delete preferences[projectPath];
        }
      }

      const preferencesFile = this.getPreferencesFile();
      await fs.writeFile(preferencesFile, JSON.stringify(preferences, null, 2), 'utf-8');

      Logger.debug(`Saved clean preferences for ${imageName}`);
    } catch (error) {
      Logger.warning(`Failed to save clean preferences: ${error instanceof Error ? error.message : error}`);
    }
  }

  static async clearPreferences(projectPath: string, imageName: string): Promise<void> {
    await this.saveExcludedTags(projectPath, imageName, []);
  }

  private static async loadPreferences(): Promise<CleanPreferences> {
    try {
      const preferencesFile = this.getPreferencesFile();
      const content = await fs.readFile(preferencesFile, 'utf-8');
      return JSON.parse(content);
    } catch {
      return {};
    }
  }

  static async cleanupStalePreferences(): Promise<void> {
    try {
      const preferences = await this.loadPreferences();
      let hasChanges = false;

      // Clean up preferences for projects that no longer exist
      for (const [projectPath, projects] of Object.entries(preferences)) {
        try {
          await fs.access(projectPath);
        } catch {
          // Project path doesn't exist anymore
          delete preferences[projectPath];
          hasChanges = true;
        }
      }

      if (hasChanges) {
        const preferencesFile = this.getPreferencesFile();
        await fs.writeFile(preferencesFile, JSON.stringify(preferences, null, 2), 'utf-8');
        Logger.debug('Cleaned up stale clean preferences');
      }
    } catch (error) {
      Logger.debug(`Failed to cleanup stale preferences: ${error instanceof Error ? error.message : error}`);
    }
  }
}
