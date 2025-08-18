import { spawn, ChildProcess } from 'child_process';
import which from 'which';
import ora from 'ora';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from './logger';

export class DockerClient {
  async checkAvailability(): Promise<void> {
    Logger.info('Checking Docker availability...');

    // Check if docker command exists
    try {
      await which('docker');
    } catch {
      throw new Error('Docker is not installed or not in PATH');
    }

    // Check if Docker daemon is running
    try {
      await this.executeCommand(['info'], { silent: true });
      Logger.success('Docker is available and running');
    } catch {
      throw new Error('Docker daemon is not running');
    }
  }

  async buildImage(
    context: string,
    dockerfile?: string,
    imageName?: string,
    buildArgs: Record<string, string> = {},
    noCache = false
  ): Promise<void> {
    Logger.info(`Building Docker image: ${imageName || 'unnamed'}`);

    // Validate build context
    await this.validateBuildContext(context);

    const args = ['build'];

    if (imageName) {
      args.push('-t', imageName);
    }

    if (dockerfile) {
      // Validate dockerfile path
      await this.validateDockerfile(dockerfile, context);
      args.push('-f', dockerfile);
    }

    if (noCache) {
      args.push('--no-cache');
    }

    // Add build arguments
    for (const [key, value] of Object.entries(buildArgs)) {
      args.push('--build-arg', `${key}=${value}`);
    }

    args.push(context);

    const spinner = ora('Building image...').start();

    try {
      await this.executeCommand(args);
      spinner.succeed('Image built successfully');
      Logger.success(`Built image: ${imageName || 'unnamed'}`);
    } catch (error) {
      spinner.fail('Build failed');
      throw error;
    }
  }

  async tagImage(source: string, target: string): Promise<void> {
    Logger.debug(`Tagging ${source} -> ${target}`);

    await this.executeCommand(['tag', source, target]);
    Logger.success(`Tagged image: ${target}`);
  }

  async pushImage(imageName: string): Promise<void> {
    Logger.info(`Pushing image: ${imageName}`);

    const spinner = ora('Pushing image...').start();

    try {
      await this.executeCommand(['push', imageName]);
      spinner.succeed('Image pushed successfully');
      Logger.success(`Pushed image: ${imageName}`);
    } catch (error) {
      spinner.fail('Push failed');
      throw error;
    }
  }

  async login(registry: string, username: string, password: string): Promise<void> {
    Logger.info(`Logging into registry: ${registry}`);

    try {
      await this.executeCommand(
        ['login', registry, '--username', username, '--password-stdin'],
        { input: password, silent: true }
      );
      Logger.success(`Logged into registry: ${registry}`);
    } catch (error) {
      throw new Error(`Docker login failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  async removeImage(imageName: string): Promise<void> {
    Logger.debug(`Removing image: ${imageName}`);

    try {
      await this.executeCommand(['rmi', imageName], { silent: true });
      Logger.debug(`Removed image: ${imageName}`);
    } catch {
      // Ignore errors when removing images
    }
  }

  async getImageInfo(imageName: string): Promise<string> {
    try {
      const result = await this.executeCommand([
        'images',
        imageName,
        '--format',
        'table {{.Repository}}\\t{{.Tag}}\\t{{.Size}}\\t{{.CreatedAt}}'
      ], { capture: true, silent: true });

      return result.stdout;
    } catch {
      return '';
    }
  }

  async getImageSize(imageName: string): Promise<string | undefined> {
    try {
      const result = await this.executeCommand([
        'images',
        imageName,
        '--format',
        '{{.Size}}'
      ], { capture: true, silent: true });

      return result.stdout.trim() || undefined;
    } catch {
      return undefined;
    }
  }

  async imageExists(imageName: string): Promise<boolean> {
    try {
      const result = await this.executeCommand([
        'images',
        '-q',
        imageName
      ], { capture: true, silent: true });

      return result.stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  async getVersion(): Promise<string> {
    try {
      const result = await this.executeCommand([
        'version',
        '--format',
        '{{.Client.Version}}'
      ], { capture: true, silent: true });

      return result.stdout.trim();
    } catch {
      return 'Unknown';
    }
  }

  private async executeCommand(
    args: string[],
    options: {
      input?: string;
      capture?: boolean;
      silent?: boolean;
    } = {}
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      // Unified debug output for all docker commands
      const cmdPreview = args
        .map((a) => a)
        .join(' ');
      const stdinNote = options.input ? ' << (stdin provided)' : '';
      Logger.debug(`docker ${cmdPreview}${stdinNote}`);

      const child: ChildProcess = spawn('docker', args, {
        stdio: [
          options.input ? 'pipe' : 'inherit',
          options.capture ? 'pipe' : options.silent ? 'ignore' : 'inherit',
          options.capture ? 'pipe' : options.silent ? 'ignore' : 'inherit'
        ]
      });

      let stdout = '';
      let stderr = '';

      if (options.capture) {
        child.stdout?.on('data', (data) => {
          stdout += data.toString();
        });

        child.stderr?.on('data', (data) => {
          stderr += data.toString();
        });
      }

      if (options.input && child.stdin) {
        child.stdin.write(options.input);
        child.stdin.end();
      }

      child.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(`Docker command failed with exit code ${code}${stderr ? ': ' + stderr : ''}`));
        }
      });

      child.on('error', (error) => {
        reject(error);
      });
    });
  }

  async runContainer(
    image: string,
    options: {
      name?: string;
      ports?: string[]; // host:container
      env?: Record<string, string>;
      detach?: boolean;
      rm?: boolean;
      cmd?: string[];
    } = {}
  ): Promise<void> {
    const args: string[] = ['run'];
    if (options.rm !== false) args.push('--rm');
    if (options.detach !== false) args.push('-d');
    if (options.name) args.push('--name', options.name);
    for (const p of options.ports || []) {
      args.push('-p', p);
    }
    for (const [k, v] of Object.entries(options.env || {})) {
      args.push('-e', `${k}=${v}`);
    }
    args.push(image);
    if (options.cmd && options.cmd.length) args.push(...options.cmd);

    await this.executeCommand(args);
  }

  async listContainersByAncestor(imageRef: string): Promise<string[]> {
    try {
      const result = await this.executeCommand(
        ['ps', '-a', '--filter', `ancestor=${imageRef}`, '-q'],
        { capture: true, silent: true }
      );
      return result.stdout.split('\n').map((s) => s.trim()).filter(Boolean);
    } catch {
      return [];
    }
  }

  async removeContainers(containerIds: string[]): Promise<void> {
    for (const id of containerIds) {
      try {
        // Force remove (stops if running)
        await this.executeCommand(['rm', '-f', id], { silent: true });
        Logger.debug(`Removed container: ${id}`);
      } catch {
        // ignore individual failures
      }
    }
  }

  async listTaggedImages(repository: string): Promise<string[]> {
    try {
      const result = await this.executeCommand(
        ['images', repository, '--format', '{{.Repository}}:{{.Tag}}'],
        { capture: true, silent: true }
      );
      return result.stdout
        .split('\n')
        .map((s) => s.trim())
        .filter((line) => line && !line.endsWith(':<none>'));
    } catch {
      return [];
    }
  }

  async getAllProjectImages(localRepo: string, registryRepo: string): Promise<Array<{ image: string; tag: string; size: string; created: string }>> {
    try {
      const repos = [localRepo, registryRepo];
      const allImages: Array<{ image: string; tag: string; size: string; created: string }> = [];

      for (const repo of repos) {
        const result = await this.executeCommand([
          'images',
          repo,
          '--format',
          '{{.Repository}}:{{.Tag}}\t{{.Size}}\t{{.CreatedSince}}'
        ], { capture: true, silent: true });

        const images = result.stdout
          .split('\n')
          .map(line => line.trim())
          .filter(line => line && !line.includes(':<none>'))
          .map(line => {
            const parts = line.split('\t');
            const [repoTag] = parts;
            const [repository, tag] = repoTag.split(':');
            return {
              image: repoTag,
              tag: tag || 'latest',
              size: parts[1] || 'unknown',
              created: parts[2] || 'unknown'
            };
          });

        allImages.push(...images);
      }

      return allImages;
    } catch {
      return [];
    }
  }

  /**
   * Validates that the build context directory exists and is readable
   */
  private async validateBuildContext(contextPath: string): Promise<void> {
    try {
      const stats = await fs.promises.stat(contextPath);
      if (!stats.isDirectory()) {
        throw new Error(`Build context path is not a directory: ${contextPath}`);
      }

      // Check if we can read the directory
      await fs.promises.access(contextPath, fs.constants.R_OK);
      Logger.debug(`Build context validated: ${contextPath}`);
      
      // Log .dockerignore info if it exists
      const dockerignorePath = path.join(contextPath, '.dockerignore');
      try {
        await fs.promises.access(dockerignorePath);
        Logger.debug(`Found .dockerignore in build context: ${dockerignorePath}`);
      } catch {
        // .dockerignore doesn't exist, which is fine
      }
    } catch (error) {
      throw new Error(`Invalid build context: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validates that the Dockerfile exists and is readable
   */
  private async validateDockerfile(dockerfilePath: string, contextPath: string): Promise<void> {
    try {
      let fullDockerfilePath: string;
      
      if (path.isAbsolute(dockerfilePath)) {
        fullDockerfilePath = dockerfilePath;
      } else {
        // If relative path, check both relative to current directory and relative to context
        try {
          await fs.promises.access(dockerfilePath, fs.constants.R_OK);
          fullDockerfilePath = dockerfilePath;
        } catch {
          // Try relative to context
          fullDockerfilePath = path.join(contextPath, dockerfilePath);
        }
      }

      const stats = await fs.promises.stat(fullDockerfilePath);
      if (!stats.isFile()) {
        throw new Error(`Dockerfile path is not a file: ${fullDockerfilePath}`);
      }

      // Check if we can read the file
      await fs.promises.access(fullDockerfilePath, fs.constants.R_OK);
      Logger.debug(`Dockerfile validated: ${fullDockerfilePath}`);
    } catch (error) {
      throw new Error(`Invalid Dockerfile: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Gets build context information including size and file count
   */
  async getBuildContextInfo(contextPath: string): Promise<{
    path: string;
    size: string;
    fileCount: number;
    hasDockerignore: boolean;
  }> {
    try {
      await this.validateBuildContext(contextPath);
      
      // Get directory size and file count (simplified approach)
      const files = await this.countFilesRecursively(contextPath);
      const dockerignorePath = path.join(contextPath, '.dockerignore');
      const hasDockerignore = await fs.promises.access(dockerignorePath).then(() => true).catch(() => false);
      
      return {
        path: path.resolve(contextPath),
        size: 'N/A', // Size calculation can be expensive, skipping for now
        fileCount: files,
        hasDockerignore
      };
    } catch (error) {
      throw new Error(`Failed to get build context info: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Recursively counts files in a directory (with basic filtering)
   */
  private async countFilesRecursively(dirPath: string, maxDepth = 10, currentDepth = 0): Promise<number> {
    if (currentDepth >= maxDepth) return 0;
    
    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      let count = 0;
      
      for (const entry of entries) {
        if (entry.name.startsWith('.git') || entry.name === 'node_modules') {
          continue; // Skip common large directories
        }
        
        if (entry.isFile()) {
          count++;
        } else if (entry.isDirectory()) {
          count += await this.countFilesRecursively(
            path.join(dirPath, entry.name), 
            maxDepth, 
            currentDepth + 1
          );
        }
      }
      
      return count;
    } catch {
      return 0;
    }
  }
}
