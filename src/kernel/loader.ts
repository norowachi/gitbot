/**
 * Dynamic ESM module loader.
 *
 * Node's ESM `import()` caches modules permanently — a second import of the
 * same path returns the cached copy even if the file changed on disk.
 * We bust the cache by appending a `?t=<timestamp>` query parameter, which
 * Node treats as a distinct specifier and re-evaluates the file from disk.
 *
 * This works for compiled JS in `dist/`. The build step must be run before
 * a hot-reload (pnpm build or esbuild watch). The kernel triggers rebuild
 * automatically when it detects file changes in `dist/modules/`.
 */

import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import type { Module } from "./types.js";
import { log } from "@utils";

/**
 * Load a Module from an absolute path to a compiled JS file.
 * Always fetches the latest version from disk (cache-busted).
 */
export async function loadModuleFile(filePath: string): Promise<Module> {
  if (!existsSync(filePath)) {
    throw new Error(`Module file not found: ${filePath}`);
  }

  const fileUrl = pathToFileURL(filePath).href;
  // Append timestamp to bust Node's ESM import cache
  const bustUrl = `${fileUrl}?t=${Date.now()}`;

  let imported: { default?: Module };
  try {
    imported = await import(bustUrl);
  } catch (err) {
    throw new Error(`Failed to import module at ${filePath}: ${(err as Error).message}`);
  }

  const mod = imported.default;
  if (!mod || typeof mod !== "object" || !mod.id) {
    throw new Error(
      `Module at ${filePath} must export a default object with at least an 'id' field.`
    );
  }

  log.debug({ id: mod.id, path: filePath }, "Module file loaded from disk");
  return mod;
}

/**
 * Scan a directory for module entry files (`mod.js`).
 * Returns absolute paths to each found entry.
 */
export async function discoverModules(dir: string): Promise<string[]> {
  const { readdir, stat } = await import("node:fs/promises");

  if (!existsSync(dir)) return [];

  const entries = await readdir(dir);
  const paths: string[] = [];

  for (const entry of entries) {
    const full = `${dir}/${entry}`;
    const s = await stat(full).catch(() => null);
    if (!s) continue;

    if (s.isDirectory()) {
      // Module directory: look for mod.js entry
      const candidate = `${full}/mod.js`;
      if (existsSync(candidate)) paths.push(candidate);
    } else if (entry.endsWith(".js") && !entry.endsWith(".test.js")) {
      paths.push(full);
    }
  }

  return paths;
}
