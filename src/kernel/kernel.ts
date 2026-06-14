/**
 * Gitbot Kernel
 *
 * Responsibilities:
 *   - Own the Express app and HTTP server
 *   - Load / unload / reload Modules at runtime (hotplug)
 *   - Watch dist/modules/ for file changes and trigger auto-reload
 *   - Handle SIGHUP for hot-restart (graceful: drain in-flight, rebind)
 *   - Sync slash commands to Discord when the command set changes
 *   - Forward interactions to the correct command / component handler
 */

import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { watch as fsWatch, existsSync } from "node:fs";
import { EventEmitter } from "node:events";
import express, { type Application, type Router } from "express";
import mongoose from "mongoose";
import { Octokit } from "@octokit/rest";
import {
  InteractionType,
  InteractionResponseType,
  MessageFlags,
  Routes,
} from "discord-api-types/v10";
import type { APIInteraction, RESTGetCurrentApplicationResult } from "discord-api-types/v10";

import {
  env,
  verifyKeyMiddleware,
  commandsData,
  IntEmitter,
  Errors,
  decryptToken,
  getOptionsValue,
  getFocusedField,
  getSub,
  log,
  registry,
  rest,
} from "@utils";
import { getUser } from "@database/functions/user.js";
import { upsertCachedUser, getRedis } from "@utils";

import type { LoadedModule, ModuleContext, KernelHandle } from "./types.js";
import { loadModuleFile, discoverModules } from "./loader.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Compiled module output directory (relative to dist/kernel/) */
const MODULES_DIST_DIR = path.resolve(__dirname, "../modules");
/** Debounce delay for file-watch reload (ms) */
const WATCH_DEBOUNCE_MS = 400;
/** Grace period for in-flight requests during hot-restart (ms) */
const DRAIN_TIMEOUT_MS = 5_000;

// ─── Kernel ───────────────────────────────────────────────────────────────────

export class Kernel extends EventEmitter {
  private readonly app: Application;
  private server: http.Server | null = null;
  private PubKey: string | null = null;
  private readonly modules = new Map<string, LoadedModule>();
  /** Module-mounted Express sub-routers — we need to track them to remove on unload. */
  private readonly mountedRouters = new Map<string, { path: string; router: Router }>();
  /** File-watcher handle so we can close it on shutdown. */
  private watcher: ReturnType<typeof fsWatch> | null = null;
  /** Debounce timers per changed file path. */
  private watchDebounce = new Map<string, NodeJS.Timeout>();
  /** Commands contributed by built-in (non-module) command files. */
  private readonly builtinCommands: string[] = [];

  constructor() {
    super();
    this.setMaxListeners(0);
    this.app = express();
    this.app.use(express.raw({ type: "application/json" }));
  }

  // ── KernelHandle (exposed to modules) ───────────────────────────────────────

  private readonly handle: KernelHandle = {
    syncCommands: () => this.syncCommands(),
    emit: (event, ...args) => {
      this.emit(event, ...args);
    },
    on: (event, handler) => {
      this.on(event, handler);
    },
  };

  // ── Bootstrap ─────────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    // Write PID file for pnpm hotrestart / external tooling
    await import("node:fs/promises").then(({ writeFile }) =>
      writeFile(".pid", String(process.pid)).catch(() => null)
    );
    
    this.PubKey = (
      (await rest.req("GET", Routes.currentApplication())) as RESTGetCurrentApplicationResult
    ).verify_key;

    if (!this.PubKey) {
      log.error("Failed to fetch application public key");
      process.exit(1);
    }

    // 1. Connect data stores
    await getRedis();
    log.info("Redis connected");

    await mongoose.connect(env.MONGO_URI);
    log.info("MongoDB connected");

    // 2. Mount static routes (health, GitHub OAuth, Discord interactions)
    this._mountCoreRoutes();

    // 3. Load built-in commands
    await this._loadBuiltins();

    // 4. Discover and load modules from dist/modules/
    await this._loadAllModules();

    // 5. Start file watcher for hotplug
    this._startWatcher();

    // 6. Start HTTP server
    await this._listen();

    // 7. Signal handlers
    this._registerSignals();

    log.info({ port: env.PORT }, "Kernel started");
    this.emit("kernel:ready");
  }

  // ── Core route mounting ───────────────────────────────────────────────────────

  private _mountCoreRoutes(): void {
    // Healthcheck — also reports loaded modules
    this.app.get("/health", (_req, res) => {
      res.json({
        ok: true,
        uptime: process.uptime(),
        modules: [...this.modules.values()].map((m) => ({
          id: m.id,
          name: m.module.name,
          version: m.module.version,
          loadedAt: m.loadedAt,
        })),
      });
    });

    // Kernel admin API — accessible via HTTP for tooling/scripts
    this.app.use("/admin", this._buildAdminRouter());

    // GitHub OAuth
    import("../routers/github.js")
      .then(({ default: githubRouter }) => {
        this.app.use("/github", githubRouter);
      })
      .catch(() => log.error("Failed to load GitHub OAuth router"));

    // Discord interactions
    this.app.post("/", verifyKeyMiddleware(this.PubKey!), (req, res) => {
      void this._handleInteraction(req.body as APIInteraction, res);
    });
  }

  // ── Admin router (hotplug control) ───────────────────────────────────────────

  private _buildAdminRouter(): Router {
    const router = express.Router();

    // Require a simple admin token for all admin routes
    router.use((req, res, next) => {
      const token = req.headers["x-admin-token"];
      if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      next();
    });

    /** GET /admin/modules — list loaded modules */
    router.get("/modules", (_req, res) => {
      res.json(
        [...this.modules.values()].map((m) => ({
          id: m.id,
          name: m.module.name,
          version: m.module.version,
          commands: m.module.commands?.map((c) => c.name) ?? [],
          router: m.module.router?.path ?? null,
          loadedAt: m.loadedAt,
          filePath: m.filePath,
        }))
      );
    });

    /** POST /admin/modules/:id/reload — hot-reload a single module */
    router.post("/modules/:id/reload", async (req, res) => {
      const { id } = req.params;
      const loaded = this.modules.get(id);
      if (!loaded) {
        res.status(404).json({ error: `Module '${id}' not found` });
        return;
      }
      try {
        await this.reloadModule(id);
        res.json({ ok: true, message: `Module '${id}' reloaded` });
      } catch (err) {
        log.error({ err, id }, "Admin-triggered reload failed");
        res.status(500).json({ error: (err as Error).message });
      }
    });

    /** POST /admin/modules/load — load a new module by file path */
    router.post("/modules/load", async (req, res) => {
      const { filePath } = req.body as { filePath?: string };
      if (!filePath) {
        res.status(400).json({ error: "filePath is required" });
        return;
      }
      try {
        const mod = await this.loadModule(path.resolve(filePath));
        res.json({ ok: true, message: `Module '${mod.id}' loaded` });
      } catch (err) {
        log.error({ err, filePath }, "Admin-triggered load failed");
        res.status(500).json({ error: (err as Error).message });
      }
    });

    /** DELETE /admin/modules/:id — unload a module */
    router.delete("/modules/:id", async (req, res) => {
      const { id } = req.params;
      if (!this.modules.has(id)) {
        res.status(404).json({ error: `Module '${id}' not found` });
        return;
      }
      await this.unloadModule(id);
      res.json({ ok: true, message: `Module '${id}' unloaded` });
    });

    /** POST /admin/commands/sync — push current command set to Discord */
    router.post("/commands/sync", async (_req, res) => {
      try {
        await this.syncCommands();
        res.json({ ok: true, count: commandsData.size });
      } catch (err) {
        res.status(500).json({ error: (err as Error).message });
      }
    });

    /** POST /admin/restart — hot-restart (drain + rebind) */
    router.post("/restart", async (_req, res) => {
      res.json({ ok: true, message: "Hot-restart initiated" });
      // Give the response time to flush before we start draining
      setTimeout(() => {
        void this.hotRestart();
      }, 100);
    });

    return router;
  }

  // ── Built-in commands ─────────────────────────────────────────────────────────

  private async _loadBuiltins(): Promise<void> {
    const imports = await Promise.all([
      import("../commands/link/mod.js"),
      import("../commands/unlink/mod.js"),
      import("../commands/issues/mod.js"),
      import("../commands/pulls/mod.js"),
      import("../commands/repos/mod.js"),
      import("../commands/my/mod.js"),
      import("../commands/settings/mod.js"),
    ]);

    // Load factories
    await import("../factories/index.js");

    for (const { default: cmd } of imports) {
      commandsData.set(cmd.name, cmd);
      this.builtinCommands.push(cmd.name);
    }

    log.info({ count: this.builtinCommands.length }, "Built-in commands loaded");
  }

  // ── Module lifecycle ──────────────────────────────────────────────────────────

  private async _loadAllModules(): Promise<void> {
    const paths = await discoverModules(MODULES_DIST_DIR);
    log.info({ count: paths.length, dir: MODULES_DIST_DIR }, "Discovered modules");

    for (const filePath of paths) {
      await this.loadModule(filePath).catch((err) =>
        log.error({ err, filePath }, "Failed to load module at startup")
      );
    }
  }

  /**
   * Load a module from a compiled JS file.
   * If a module with the same ID is already loaded, it is reloaded instead.
   */
  async loadModule(filePath: string): Promise<LoadedModule> {
    const mod = await loadModuleFile(filePath);

    // If already loaded, tear down first
    if (this.modules.has(mod.id)) {
      await this._teardown(this.modules.get(mod.id)!);
    }

    // Register commands
    if (mod.commands?.length) {
      for (const cmd of mod.commands) {
        commandsData.set(cmd.name, cmd);
        log.debug({ cmd: cmd.name, module: mod.id }, "Command registered");
      }
    }

    // Mount router
    if (mod.router) {
      this.app.use(mod.router.path, mod.router.handler);
      this.mountedRouters.set(mod.id, { path: mod.router.path, router: mod.router.handler });
      log.debug({ path: mod.router.path, module: mod.id }, "Router mounted");
    }

    // Call setup
    let ctx: ModuleContext = {};
    if (mod.setup) {
      ctx = (await mod.setup(this.handle)) ?? {};
    }

    const loaded: LoadedModule = {
      id: mod.id,
      module: mod,
      filePath,
      ctx,
      loadedAt: Date.now(),
    };

    this.modules.set(mod.id, loaded);
    log.info({ id: mod.id, name: mod.name, version: mod.version }, "Module loaded");
    this.emit("module:loaded", loaded);

    return loaded;
  }

  /**
   * Unload a module: tear it down, remove its commands and router.
   */
  async unloadModule(id: string): Promise<void> {
    const loaded = this.modules.get(id);
    if (!loaded) return;

    await this._teardown(loaded);
    this.modules.delete(id);
    log.info({ id }, "Module unloaded");
    this.emit("module:unloaded", id);
  }

  /**
   * Reload a module in place — teardown then fresh load from disk.
   */
  async reloadModule(id: string): Promise<void> {
    const loaded = this.modules.get(id);
    if (!loaded) {
      log.warn({ id }, "reloadModule called for unknown module");
      return;
    }
    log.info({ id }, "Reloading module...");
    await this.loadModule(loaded.filePath);
    // Sync commands so Discord reflects any command changes
    await this.syncCommands().catch((err) =>
      log.warn({ err }, "Command sync after reload failed (non-fatal)")
    );
    this.emit("module:reloaded", id);
  }

  private async _teardown(loaded: LoadedModule): Promise<void> {
    // Call module teardown
    if (loaded.module.teardown) {
      await loaded.module
        .teardown(loaded.ctx, this.handle)
        ?.catch((err) => log.warn({ err, id: loaded.id }, "Module teardown threw (ignored)"));
    }

    // Remove commands
    if (loaded.module.commands?.length) {
      for (const cmd of loaded.module.commands) {
        commandsData.delete(cmd.name);
      }
    }

    // Unmount router — Express doesn't have a first-class unmount API,
    // so we rebuild the router stack excluding the module's sub-router.
    if (this.mountedRouters.has(loaded.id)) {
      const { router } = this.mountedRouters.get(loaded.id)!;
      this.mountedRouters.delete(loaded.id);
      // Remove from express internal stack

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
      const stack: any[] = this.app._router?.stack ?? [];
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const idx = stack.findIndex((layer) => layer.handle === router);
      if (idx !== -1) stack.splice(idx, 1);
    }
  }

  // ── Command sync ─────────────────────────────────────────────────────────────

  async syncCommands(): Promise<void> {
    const payload = [...commandsData.values()].map(
      ({ run: _run, autocomplete: _ac, ...data }) => data
    );
    const result = await rest.req("PUT", `/applications/${rest.me.id}/commands`, {
      body: payload,
    });
    if (!Array.isArray(result)) {
      throw new Error("Unexpected response from Discord command sync");
    }
    log.info({ count: result.length }, "Commands synced to Discord");
  }

  // ── File watcher ──────────────────────────────────────────────────────────────

  private _startWatcher(): void {
    if (!existsSync(MODULES_DIST_DIR)) return;

    this.watcher = fsWatch(MODULES_DIST_DIR, { recursive: true }, (_event, filename) => {
      if (!filename || !filename.endsWith(".js") || filename.endsWith(".test.js")) return;

      const absPath = path.join(MODULES_DIST_DIR, filename);

      // Debounce — rapid successive saves should only trigger one reload
      const existing = this.watchDebounce.get(absPath);
      if (existing) clearTimeout(existing);

      const timer = setTimeout(() => {
        this.watchDebounce.delete(absPath);
        this._onFileChanged(absPath);
      }, WATCH_DEBOUNCE_MS);

      this.watchDebounce.set(absPath, timer);
    });

    log.info({ dir: MODULES_DIST_DIR }, "File watcher started (hotplug active)");
  }

  private _onFileChanged(absPath: string): void {
    // Find which loaded module owns this file
    const loaded = [...this.modules.values()].find(
      (m) => path.resolve(m.filePath) === path.resolve(absPath)
    );

    if (loaded) {
      log.info({ id: loaded.id, path: absPath }, "Module file changed — hot-reloading");
      void this.reloadModule(loaded.id);
    } else {
      // New file — attempt to load as a new module
      log.info({ path: absPath }, "New module file detected — attempting load");
      void this.loadModule(absPath).catch((err) =>
        log.warn({ err, path: absPath }, "Auto-load of new module file failed")
      );
    }
  }

  // ── Interaction handler ───────────────────────────────────────────────────────

  private async _handleInteraction(
    interaction: APIInteraction,
    res: express.Response
  ): Promise<void> {
    // ── Components & Modals ───────────────────────────────────────────────────
    if (
      interaction.type === InteractionType.MessageComponent ||
      interaction.type === InteractionType.ModalSubmit
    ) {
      const customId = "custom_id" in interaction.data ? interaction.data.custom_id : undefined;
      if (!customId) return;

      const hasHotListener = IntEmitter.listenerCount(customId) > 0;
      if (hasHotListener) {
        IntEmitter.emit(customId, res, interaction);
      } else {
        await registry.dispatch(customId, res, interaction);
      }
      return;
    }

    // ── Commands & Autocomplete ───────────────────────────────────────────────
    if (
      interaction.type !== InteractionType.ApplicationCommand &&
      interaction.type !== InteractionType.ApplicationCommandAutocomplete
    )
      return;

    const name = "name" in interaction.data ? interaction.data.name : undefined;
    if (!name) return;

    const command = commandsData.get(name);
    if (!command) {
      res.json({
        type: InteractionResponseType.ChannelMessageWithSource,
        data: { content: "Command not found.", flags: MessageFlags.Ephemeral },
      });
      return;
    }

    const userId = interaction.member?.user.id ?? (interaction as any).user?.id;
    const rawOptions = "options" in interaction.data ? (interaction.data.options ?? []) : [];
    const options = getOptionsValue(rawOptions as any[]);
    const sub = getSub((rawOptions as any[])[0]);

    // Autocomplete
    if (interaction.type === InteractionType.ApplicationCommandAutocomplete) {
      if (!command.autocomplete || !userId) {
        res.json({
          type: InteractionResponseType.ApplicationCommandAutocompleteResult,
          data: { choices: [] },
        });
        return;
      }
      const dbUser = await getUser({ discordId: userId });
      if (!dbUser) {
        res.json({
          type: InteractionResponseType.ApplicationCommandAutocompleteResult,
          data: { choices: [] },
        });
        return;
      }
      const octo = new Octokit({ auth: decryptToken(dbUser.github.access_token) });
      const focused = getFocusedField(rawOptions as any[]) ?? "";
      await command.autocomplete(res, focused, [dbUser, octo], options);
      return;
    }

    // Auth-exempt commands
    if (name === "link") {
      await command.run(res, [] as any, sub, options);
      return;
    }

    if (!userId) {
      res.json({
        type: InteractionResponseType.ChannelMessageWithSource,
        data: { content: Errors.NoUserId, flags: MessageFlags.Ephemeral },
      });
      return;
    }

    const dbUser = await getUser({ discordId: userId });
    if (!dbUser) {
      res.json({
        type: InteractionResponseType.ChannelMessageWithSource,
        data: { content: Errors.NotLinked, flags: MessageFlags.Ephemeral },
      });
      return;
    }

    const octo = new Octokit({ auth: decryptToken(dbUser.github.access_token) });
    upsertCachedUser(octo).catch((err) => log.warn({ err }, "Background cache refresh failed"));

    // Emit for announcement middleware and any other module listeners
    this.emit("user:interaction", userId, (dbUser as any).createdAt ?? new Date(0));

    log.debug({ cmd: name, sub: sub?.[0], user: userId }, "Command invoked");
    await command.run(res, [dbUser, octo] as any, sub, options);
  }

  // ── Hot-restart ───────────────────────────────────────────────────────────────

  /**
   * Hot-restart: gracefully drain in-flight HTTP requests, then rebind the
   * server on the same port — no process exit, no dropped component state.
   *
   * In-flight Discord interactions are typically fast (<3 s) so the 5 s drain
   * window is more than enough.  Redis-backed component handlers survive
   * regardless because they're not in-process state.
   */
  async hotRestart(): Promise<void> {
    if (!this.server) return;
    log.info("Hot-restart: draining in-flight requests...");
    this.emit("kernel:restarting");

    // Stop accepting new connections
    await new Promise<void>((resolve) => {
      this.server!.close(() => resolve());
      setTimeout(resolve, DRAIN_TIMEOUT_MS); // force after grace period
    });

    // Teardown all modules (preserves Redis state)
    for (const [id] of [...this.modules]) {
      await this.unloadModule(id).catch(() => {});
    }

    // Re-load everything fresh
    await this._loadBuiltins();
    await this._loadAllModules();

    // Rebind
    await this._listen();

    log.info({ port: env.PORT }, "Hot-restart complete");
    this.emit("kernel:restarted");
  }

  // ── HTTP server lifecycle ─────────────────────────────────────────────────────

  private _listen(): Promise<void> {
    return new Promise((resolve) => {
      this.server = http.createServer(this.app);
      this.server.listen(Number(env.PORT), () => {
        log.info({ port: env.PORT }, "HTTP server listening");
        resolve();
      });
    });
  }

  // ── Signal handling ───────────────────────────────────────────────────────────

  private _registerSignals(): void {
    // SIGHUP → hot-restart (standard Unix "reload config" signal)
    process.on("SIGHUP", () => {
      log.info("SIGHUP received — initiating hot-restart");
      void this.hotRestart();
    });

    // SIGTERM / SIGINT → graceful shutdown
    const shutdown = async (signal: string) => {
      log.info({ signal }, "Shutdown signal received");
      this.watcher?.close();
      for (const [id] of [...this.modules]) {
        await this.unloadModule(id).catch(() => {});
      }
      await mongoose.disconnect().catch(() => {});
      // Remove PID file
      import("node:fs/promises").then(({ unlink }) => unlink(".pid").catch(() => {}));
      this.server?.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 5000);
    };

    process.on("SIGTERM", () => {
      void shutdown("SIGTERM");
    });
    process.on("SIGINT", () => {
      void shutdown("SIGINT");
    });
  }
}
