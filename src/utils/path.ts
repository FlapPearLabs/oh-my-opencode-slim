import * as fs from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import path from 'node:path';

/**
 * Checks if `target` path is strictly inside the `root` path.
 * Both paths should typically be fully resolved real paths to be symlink-safe.
 */
export function inside(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Gets the realpath of a target file synchronously, handling missing files by iteratively checking parent directories.
 */
export function realSync(target: string): string {
  const parts: string[] = [];
  let current = path.resolve(target);

  while (true) {
    let exact: string | null = null;
    try {
      exact = realpathSync(current);
    } catch (error: any) {
      if (error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
        exact = null;
      } else {
        throw error;
      }
    }

    if (exact) {
      return parts.length === 0 ? exact : path.join(exact, ...parts.reverse());
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return parts.length === 0 ? current : path.join(current, ...parts.reverse());
    }

    parts.push(path.basename(current));
    current = parent;
  }
}

/**
 * Guards a path against symlink escapes from the workspace root synchronously.
 * Throws an error if the path resolves outside the root.
 */
export function guardWorkspacePathSync(root: string, target: string): string {
  const resolvedTarget = path.resolve(root, target);
  const targetReal = realSync(resolvedTarget);
  const rootReal = realSync(root);
  
  if (!inside(rootReal, targetReal)) {
    throw new Error(`Path outside workspace boundary: ${target}`);
  }
  
  return resolvedTarget;
}

/**
 * Gets the realpath of a target file, handling missing files by iteratively checking parent directories.
 */
export async function real(target: string): Promise<string> {
  const parts: string[] = [];
  let current = path.resolve(target);

  while (true) {
    const exact = await fs.realpath(current).catch((error: unknown) => {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error.code === 'ENOENT' || error.code === 'ENOTDIR')
      ) {
        return null;
      }
      throw error;
    });

    if (exact) {
      return parts.length === 0 ? exact : path.join(exact, ...parts.reverse());
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return parts.length === 0
        ? current
        : path.join(current, ...parts.reverse());
    }

    parts.push(path.basename(current));
    current = parent;
  }
}

/**
 * Guards a path against symlink escapes from the workspace root.
 * Throws an error if the path resolves outside the root.
 */
export async function guardWorkspacePath(root: string, target: string): Promise<string> {
  const resolvedTarget = path.resolve(root, target);
  const [targetReal, rootReal] = await Promise.all([
    real(resolvedTarget),
    real(root),
  ]);
  
  if (!inside(rootReal, targetReal)) {
    throw new Error(`Path outside workspace boundary: ${target}`);
  }
  
  return resolvedTarget;
}
