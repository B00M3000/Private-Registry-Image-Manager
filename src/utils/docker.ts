import { spawn, ChildProcess } from 'child_process';
import which from 'which';
import ora from 'ora';
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

    const args = ['build'];

    if (imageName) {
      args.push('-t', imageName);
    }

    if (dockerfile) {
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
}
