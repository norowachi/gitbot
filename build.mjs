/**
 * esbuild bundler.
 *
 * Produces:
 *   dist/index.js          — bot entry point (kernel boot)
 *   dist/register.js       — command registration utility
 *   dist/modules/<n>/mod.js — each hotpluggable module (separate bundles)
 *
 * Run after `tsc --noEmit` (type checking):
 *   node build.mjs
 *
 * For module hot-reloads during development:
 *   node build.mjs --watch
 */

import { build, context } from "esbuild";
import { readFileSync, readdirSync, statSync, existsSync, mkdirSync } from "fs";
import { resolve, join } from "path";

const pkg = JSON.parse(readFileSync("./package.json", "utf8"));
const isWatch = process.argv.includes("--watch");

const external = [
  "mongoose", "mongodb", "hiredis",
  // Exclude all node built-ins from bundles
  /^node:/,
];

/** Resolve path aliases to source files. */
const aliasPlugin = {
  name: "path-aliases",
  setup(build) {
    build.onResolve({ filter: /^@utils$/ }, () => ({
      path: new URL("src/utils/utils.ts", import.meta.url).pathname,
    }));
    build.onResolve({ filter: /^@\// }, (args) => ({
      path: new URL(args.path.replace(/^@\//, "src/"), import.meta.url).pathname,
    }));
    build.onResolve({ filter: /^@database\// }, (args) => ({
      path: new URL(
        args.path.replace(/^@database\//, "src/database/"), import.meta.url
      ).pathname,
    }));
  },
};

const sharedConfig = {
  bundle: true,
  platform: "node",
  target: "node18",
  format: "esm",
  sourcemap: true,
  external,
  plugins: [aliasPlugin],
  define: { "process.env.npm_package_version": JSON.stringify(pkg.version) },
  logLevel: "info",
};

// ── Discover module entry files ───────────────────────────────────────────────

function findModuleEntries(dir) {
  if (!existsSync(dir)) return [];
  const entries = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      const candidate = join(full, "mod.ts");
      if (existsSync(candidate)) entries.push({ name, path: candidate });
    }
  }
  return entries;
}

const moduleEntries = findModuleEntries("src/modules");

// ── Build ─────────────────────────────────────────────────────────────────────

const entryPoints = [
  { in: "src/index.ts",    out: "dist/index" },
  { in: "src/register.ts", out: "dist/register" },
  ...moduleEntries.map(({ name, path }) => ({
    in:  path,
    out: `dist/modules/${name}/mod`,
  })),
];

if (isWatch) {
  // Watch mode: rebuild on any change
  const ctx = await context({ ...sharedConfig, entryPoints });
  await ctx.watch();
  console.log("esbuild watching for changes...");
} else {
  // Ensure output dirs exist
  for (const { name } of moduleEntries) {
    mkdirSync(`dist/modules/${name}`, { recursive: true });
  }

  await build({ ...sharedConfig, entryPoints });
  console.log(`Built ${entryPoints.length} entry points.`);
}
