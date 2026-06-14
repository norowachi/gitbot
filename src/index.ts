/**
 * Entry point — boots the kernel.
 *
 * Hot-restart:  kill -HUP <pid>   or   POST /admin/restart
 * Hotplug:      drop a compiled module into dist/modules/ — it auto-loads.
 * Command sync: POST /admin/commands/sync
 */
import { config } from "dotenv";
config();

import { Kernel } from "./kernel/index.js";
import { log } from "@utils";

export const kernel = new Kernel();

kernel.start().catch((err) => {
  log.fatal({ err }, "Fatal startup error");
  process.exit(1);
});
