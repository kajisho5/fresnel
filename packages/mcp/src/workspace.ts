import { realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { loadIcon, saveIcon, type LoadedIcon } from '@fresnel/core/node';

/**
 * File access for the MCP server. Every path must resolve inside one of the
 * allowed roots (--root, default: the working directory). Symlinks are resolved
 * before the check so they can't be used to escape a root.
 */
export class Workspace {
  readonly roots: string[];
  private locks = new Map<string, Promise<unknown>>();

  /** With `unrestricted` (the CLI without --root) any path is allowed; relative paths still start at the first root. */
  readonly unrestricted: boolean;

  constructor(roots: string[], opts: { unrestricted?: boolean } = {}) {
    this.roots = (roots.length ? roots : [process.cwd()]).map((r) => resolve(r));
    this.unrestricted = !!opts.unrestricted;
  }

  /** Resolves a user path (relative paths are relative to the first root) and checks it's allowed. */
  async resolve(p: string, opts: { mustExist?: boolean } = {}): Promise<string> {
    if (!p || typeof p !== 'string') throw new Error('A path is required');
    const abs = isAbsolute(p) ? resolve(p) : resolve(this.roots[0]!, p);
    // resolve symlinks of the deepest existing ancestor
    let probe = abs;
    let suffix = '';
    for (;;) {
      try {
        const real = await realpath(probe);
        const full = suffix ? resolve(real, suffix) : real;
        if (!(await this.allowed(full))) throw new Error(`Access denied: ${p} is outside the allowed roots (${this.roots.join(', ')})`);
        if (opts.mustExist && full !== real) throw new Error(`Not found: ${p}`);
        return full;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
        if (opts.mustExist) throw new Error(`Not found: ${p}`);
        const parent = dirname(probe);
        if (parent === probe) throw new Error(`Invalid path: ${p}`);
        suffix = suffix ? `${probe.slice(parent.length + 1)}${sep}${suffix}` : probe.slice(parent.length + 1);
        probe = parent;
      }
    }
  }

  private async allowed(full: string): Promise<boolean> {
    if (this.unrestricted) return true;
    for (const r of this.roots) {
      let root = r;
      try {
        root = await realpath(r);
      } catch {
        /* root may not exist yet */
      }
      const rel = relative(root, full);
      if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) return true;
    }
    return false;
  }

  /** Normalizes an icon path: accepts "Foo", "Foo.icon", ".../Foo.icon/icon.json". */
  async iconPath(p: string, opts: { mustExist?: boolean } = {}): Promise<string> {
    let q = p.trim();
    if (q.endsWith('/icon.json') || q.endsWith('\\icon.json')) q = q.slice(0, -'/icon.json'.length);
    if (!q.endsWith('.icon') && !q.endsWith('.icon.zip')) q = `${q}.icon`;
    const full = await this.resolve(q, opts);
    if (opts.mustExist) {
      const st = await stat(full);
      if (!st.isDirectory() && !full.endsWith('.zip')) throw new Error(`${p} is not an .icon bundle`);
    }
    return full;
  }

  /** Serializes edits per file so concurrent tool calls can't clobber each other. */
  async edit<T>(path: string, fn: (doc: LoadedIcon) => T | Promise<T>, opts: { dryRun?: boolean } = {}): Promise<T> {
    return this.withLock(path, async () => {
      if (path.endsWith('.zip')) throw new Error('Editing .icon.zip is not supported; unzip it first or use the .icon folder');
      const doc = await loadIcon(path);
      const result = await fn(doc);
      if (!opts.dryRun) await saveIcon(path, doc);
      return result;
    });
  }

  async read(path: string): Promise<LoadedIcon> {
    return this.withLock(path, () => loadIcon(path));
  }

  async withLock<T>(path: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(path) ?? Promise.resolve();
    const run = prev.catch(() => undefined).then(fn);
    this.locks.set(path, run);
    try {
      return await run;
    } finally {
      if (this.locks.get(path) === run) this.locks.delete(path);
    }
  }
}
