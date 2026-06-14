/**
 * Registers (or bulk-overwrites) all slash commands with Discord.
 * Run with: node dist/register.js
 */
import path from "node:path";
import { config } from "dotenv";
config();

import { rest, commandsData, log } from "@utils";

import linkCmd from "./commands/link/mod.js";
import unlinkCmd from "./commands/unlink/mod.js";
import issuesCmd from "./commands/issues/mod.js";
import pullsCmd from "./commands/pulls/mod.js";
import reposCmd from "./commands/repos/mod.js";
import myCmd from "./commands/my/mod.js";
import settingsCmd from "./commands/settings/mod.js";
import { discoverModules, loadModuleFile } from "./kernel/loader.js";
import { fileURLToPath } from "node:url";

for (const cmd of [linkCmd, unlinkCmd, issuesCmd, pullsCmd, reposCmd, myCmd, settingsCmd]) {
  commandsData.set(cmd.name, cmd as any);
}

const MODULES_DIST_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "./modules");
const paths = await discoverModules(MODULES_DIST_DIR);
log.info({ count: paths.length, dir: MODULES_DIST_DIR }, "Discovered modules");

for (const filePath of paths) {
  const mod = await loadModuleFile(filePath);
  if (mod.commands?.length) {
    for (const cmd of mod.commands) {
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
