import * as fs from 'fs/promises';
import * as path from 'path';
import { simpleGit } from 'simple-git';
import { TagStrategy } from '../config/config';
import { Logger } from './logger';

export class TagGenerator {
  static async generate(
    strategy: TagStrategy,
    opts: {
      explicitTag?: string;
      projectRoot?: string;
      projectVersion?: string;
    } = {}
  ): Promise<string> {
    switch (strategy) {
      case TagStrategy.MANUAL: {
        if (!opts.explicitTag) throw new Error('Manual tag strategy requires --tag');
        return opts.explicitTag;
      }
      case TagStrategy.GIT_COMMIT:
        return await TagGenerator.fromGitCommit(opts.projectRoot);
      case TagStrategy.GIT_TAG:
        return await TagGenerator.fromGitTag(opts.projectRoot);
      case TagStrategy.SEMVER:
        return await TagGenerator.fromSemver(opts.projectRoot, opts.projectVersion);
      case TagStrategy.TIMESTAMP:
      default:
        return TagGenerator.fromTimestamp();
    }
  }

  static fromTimestamp(d: Date = new Date()): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const yyyy = d.getUTCFullYear();
    const mm = pad(d.getUTCMonth() + 1);
    const dd = pad(d.getUTCDate());
    const hh = pad(d.getUTCHours());
    const mi = pad(d.getUTCMinutes());
    const ss = pad(d.getUTCSeconds());
    return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
  }

  static async fromGitCommit(projectRoot?: string): Promise<string> {
    try {
      const git = simpleGit({ baseDir: projectRoot || process.cwd() });
      const sha = await git.revparse(['--short', 'HEAD']);
      return sha.trim();
    } catch {
      Logger.warning('Not a git repo or unable to read commit; falling back to timestamp');
      return TagGenerator.fromTimestamp();
    }
  }

  static async fromGitTag(projectRoot?: string): Promise<string> {
    try {
      const git = simpleGit({ baseDir: projectRoot || process.cwd() });
      const desc = await git.raw(['describe', '--tags', '--abbrev=0']);
      return desc.trim();
    } catch {
      Logger.warning('No git tag found; falling back to commit');
      return TagGenerator.fromGitCommit(projectRoot);
    }
  }

  static async fromSemver(projectRoot?: string, explicit?: string): Promise<string> {
    if (explicit) return explicit;
    // Try project package.json if exists
    const base = projectRoot || process.cwd();
    const pkgPath = path.join(base, 'package.json');
    try {
      const content = await fs.readFile(pkgPath, 'utf-8');
      const pkg = JSON.parse(content) as { version?: string };
      if (pkg.version) return pkg.version;
    } catch {
      // ignore
    }
    Logger.warning('Semver strategy requested but no version found; falling back to timestamp');
    return TagGenerator.fromTimestamp();
  }
}
