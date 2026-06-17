/**
 * Registers (or bulk-overwrites) all slash commands with Discord.
 * Run with: node dist/register.js
 */
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "dotenv";
config();

import { rest, commandsData, log } from "@utils";

import { discoverModules, loadModuleFile } from "./kernel/loader.js";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COMMANDS_DIR = path.resolve(__dirname, "./commands");
const MODULES_DIST_DIR = path.resolve(__dirname, "./modules");

for (const filePath of await discoverCommandFiles(COMMANDS_DIR)) {
  await registerCommandFile(filePath);
}

const paths = await discoverModules(MODULES_DIST_DIR);
log.info({ count: paths.length, dir: MODULES_DIST_DIR }, "Discovered modules");

for (const filePath of paths) {
  const mod = await loadModuleFile(filePath);
  if (mod.commands?.length) {
    for (const cmd of mod.commands) {
      if (commandsData.has(cmd.name)) continue;
      commandsData.set(cmd.name, cmd);
      log.debug({ cmd: cmd.name, module: mod.id }, "Command registered");
    }
  }
}

const payload = [...commandsData.values()].map(({ run, autocomplete, ...data }) => data);

log.info({ count: payload.length }, "Registering global commands");

const result = await rest.req("PUT", `/applications/${rest.me.id}/commands`, { body: payload });

if (Array.isArray(result)) {
  log.info({ count: result.length }, "Commands registered successfully");
} else {
  log.error({ result }, "Unexpected response from Discord");
  process.exit(1);
}


async function discoverCommandFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const subdir = path.join(dir, entry.name);

    const modJs = path.join(subdir, "mod.js");
    const modTs = path.join(subdir, "mod.ts");
    let toImport: string | null = null;
    if (existsSync(modJs)) toImport = `file://${modJs}`;
    else if (existsSync(modTs)) toImport = `file://${modTs}`;
    if (!toImport) continue;

    try {
      const stat = await fs.stat(toImport);
      if (stat.isFile()) {
        files.push(toImport);
        continue;
      }
    } catch {
      // ignore missing mod.ts and recurse into nested directories
    }

    const nestedFiles = await discoverCommandFiles(subdir);
    files.push(...nestedFiles);
  }

  return files;
}

async function registerCommandFile(filePath: string) {
  const mod = await import(filePath);
  const commandModule = mod.default ?? mod;

  if (Array.isArray(commandModule.commands)) {
    for (const cmd of commandModule.commands) {
      commandsData.set(cmd.name, cmd);
      log.debug({ cmd: cmd.name, file: filePath }, "Command registered");
    }
    return;
  }

  if (commandModule?.name) {
    commandsData.set(commandModule.name, commandModule);
    log.debug({ cmd: commandModule.name, file: filePath }, "Command registered");
  }
}
