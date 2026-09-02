import type { Filesystem, WriteResult } from '@oh-my-pi/hashline';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { guardWorkspacePath, guardWorkspacePathSync } from '../../utils/path';

/**
 * Node.js filesystem adapter for hashline patcher using node:fs/promises.
 * Ensures workspace boundary protection and cross-platform path resolution.
 */
export async function createNodeFsFilesystem(root: string): Promise<Filesystem> {
  const { Filesystem, NotFoundError } = await import('@oh-my-pi/hashline');

  class NodeFsFilesystem extends Filesystem {
    private async resolveSafe(filePath: string): Promise<string> {
      return guardWorkspacePath(root, filePath);
    }

    async readText(filePath: string): Promise<string> {
      const target = await this.resolveSafe(filePath);
      try {
        return await fs.readFile(target, 'utf8');
      } catch (err: unknown) {
        if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'ENOENT') {
          throw new NotFoundError(filePath, err);
        }
        throw err;
      }
    }

    async writeText(filePath: string, content: string): Promise<WriteResult> {
      const target = await this.resolveSafe(filePath);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, content, 'utf8');
      return { text: content };
    }

    override async delete(filePath: string): Promise<void> {
      const target = await this.resolveSafe(filePath);
      try {
        await fs.rm(target, { force: true });
      } catch (err: unknown) {
        if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'ENOENT') {
          throw new NotFoundError(filePath, err);
        }
        throw err;
      }
    }

    override async move(from: string, to: string, content?: string): Promise<void> {
      const source = await this.resolveSafe(from);
      const dest = await this.resolveSafe(to);
      if (content !== undefined) {
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.writeFile(dest, content, 'utf8');
        await fs.rm(source, { force: true });
        return;
      }
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.rename(source, dest);
    }

    override async exists(filePath: string): Promise<boolean> {
      try {
        const target = await this.resolveSafe(filePath);
        await fs.access(target);
        return true;
      } catch {
        return false;
      }
    }

    override canonicalPath(filePath: string): string {
      return guardWorkspacePathSync(root, filePath);
    }

    override allowTagPathRecovery(_authoredPath: string, resolvedPath: string): boolean {
      try {
        guardWorkspacePathSync(root, resolvedPath);
        return true;
      } catch {
        return false;
      }
    }
  }

  return new NodeFsFilesystem();
}
