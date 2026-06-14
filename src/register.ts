/**
 * Registers (or bulk-overwrites) all slash commands with Discord.
 * Run with: node dist/register.js
 */
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

for (const cmd of [linkCmd, unlinkCmd, issuesCmd, pullsCmd, reposCmd, myCmd, settingsCmd]) {
  commandsData.set(cmd.name, cmd as any);
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
