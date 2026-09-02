import type { Filesystem, WriteResult } from '@oh-my-pi/hashline';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/**
 * Node.js filesystem adapter for hashline patcher using node:fs/promises.
 * Ensures workspace boundary protection and cross-platform path resolution.
 */
export async function createNodeFsFilesystem(root: string): Promise<Filesystem> {
  const { Filesystem, NotFoundError } = await import('@oh-my-pi/hashline');

  class NodeFsFilesystem extends Filesystem {
    private resolveSafe(filePath: string): string {
      const resolved = path.isAbsolute(filePath)
        ? path.normalize(filePath)
        : path.resolve(root, filePath);
      const normalizedRoot = path.normalize(root);
      const rel = path.relative(normalizedRoot, resolved);
      if (rel.startsWith('..') || (path.isAbsolute(rel) && !resolved.startsWith(normalizedRoot))) {
        throw new Error(`Path outside workspace boundary: ${filePath}`);
      }
      return resolved;
    }

    async readText(filePath: string): Promise<string> {
      const target = this.resolveSafe(filePath);
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
      const target = this.resolveSafe(filePath);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, content, 'utf8');
      return { text: content };
    }

    override async delete(filePath: string): Promise<void> {
      const target = this.resolveSafe(filePath);
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
      const source = this.resolveSafe(from);
      const dest = this.resolveSafe(to);
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
        const target = this.resolveSafe(filePath);
        await fs.access(target);
        return true;
      } catch {
        return false;
      }
    }

    override canonicalPath(filePath: string): string {
      return this.resolveSafe(filePath);
    }

    override allowTagPathRecovery(_authoredPath: string, resolvedPath: string): boolean {
      try {
        this.resolveSafe(resolvedPath);
        return true;
      } catch {
        return false;
      }
    }
  }

  return new NodeFsFilesystem();
}
