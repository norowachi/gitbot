import type { Router } from "express";
import type { CommandData } from "@utils";

// ─── Module lifecycle ─────────────────────────────────────────────────────────

/**
 * A Module is the unit of hotplug.  Any feature — a set of commands, a router,
 * a background job — wraps itself in a Module so the kernel can load, reload,
 * and unload it without restarting the process.
 *
 * Minimal module (command-only):
 *   export default {
 *     id: "my-feature",
 *     commands: [myCommand],
 *   } satisfies Module;
 *
 * Full module (commands + router + background job):
 *   export default {
 *     id: "streak",
 *     commands: [streakCommand],
 *     router: { path: "/streak", handler: streakRouter },
 *     async setup(ctx) { ctx.cron = setInterval(tick, 60_000); },
 *     async teardown(ctx) { clearInterval(ctx.cron); },
 *   } satisfies Module;
 */
export interface Module {
  /** Unique stable identifier.  Used as the Redis namespace prefix. */
  id: string;

  /** Human-readable name shown in `/admin modules list`. */
  name?: string;

  /** Version string, displayed in module listings. */
  version?: string;

  /** Slash commands this module contributes. */
  commands?: CommandData[];

  /** Express sub-router mounted by the kernel. */
  router?: {
    /** Mount path, e.g. "/webhook/stripe" */
    path: string;
    handler: Router;
  };

  /**
   * Called once after the module is loaded (or reloaded).
   * Use to start timers, subscribe to events, etc.
   * Return value is stored as `ctx` and passed to `teardown`.
   */
  setup?: (kernel: KernelHandle) => Promise<ModuleContext> | ModuleContext | void;

  /**
   * Called before the module is unloaded / before a reload.
   * Use to clear timers, close connections, flush state.
   */
  teardown?: (ctx: ModuleContext, kernel: KernelHandle) => Promise<void> | void;
}

/** Arbitrary per-module runtime state returned by `setup()`. */
export type ModuleContext = Record<string, unknown>;

// ─── Kernel handle passed into modules ───────────────────────────────────────

/**
 * The subset of the kernel API that modules are allowed to call.
 * Prevents modules from doing destructive things like shutting the kernel down.
 */
export interface KernelHandle {
  /** Re-register all loaded module commands with Discord. */
  syncCommands(): Promise<void>;
  /** Emit a kernel-level event (e.g. "module:loaded", "module:unloaded"). */
  emit(event: string, ...args: unknown[]): void;
  /** Subscribe to a kernel-level event. */
  on(event: string, handler: (...args: unknown[]) => void): void;
}

// ─── Loaded module record ─────────────────────────────────────────────────────

export interface LoadedModule {
  id: string;
  module: Module;
  /** Absolute path to the module's entry file on disk. */
  filePath: string;
  /** Context returned by `setup()`, if any. */
  ctx: ModuleContext;
  /** When the module was loaded (ms timestamp). */
  loadedAt: number;
}
