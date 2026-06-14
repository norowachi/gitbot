/**
 * ComponentRegistry — Redis-backed interaction component handler store.
 *
 * Problem with the old approach (pure EventEmitter):
 *   - Handlers live only in the current process; a restart or scale-out loses them.
 *   - A user clicking a confirmation button after a bot restart gets a silent failure.
 *
 * This solution adds a second layer:
 *   1. HOT LAYER  — in-process EventEmitter (instant, zero latency, same as before).
 *   2. WARM LAYER — Redis hash keyed by custom_id. When the hot layer has no listener,
 *      the dispatcher looks up the serialised handler descriptor in Redis and
 *      reconstructs the handler from a registered handler factory.
 *
 * Handler factories are named functions registered at startup via
 * `ComponentRegistry.registerFactory(name, fn)`. The factory receives the
 * persisted context object and returns the actual handler function.
 *
 * This means the handler logic lives in code (not Redis), while the
 * per-interaction state (owner, repo, PR number, etc.) is stored in Redis
 * and survives restarts.
 *
 * Usage:
 *   // At startup, register the factory once:
 *   registry.registerFactory("merge-confirm", (ctx) => async (btnRes, int) => {
 *     await octo.pulls.merge({ owner: ctx.owner, repo: ctx.repo, ... });
 *     ...
 *   });
 *
 *   // When handling a command, register a component:
 *   await registry.register({
 *     customId: confirmId,
 *     factory: "merge-confirm",
 *     context: { owner, repo, pull_number, merge_method, ... },
 *     ttlSeconds: 300,        // 5 minutes
 *     once: true,             // remove after first trigger
 *     authorId: userId,       // optional: restrict to one user
 *   });
 *
 *   // The dispatcher in index.ts calls:
 *   await registry.dispatch(customId, res, interaction);
 */

import type { Response } from "express";
import type { APIInteraction } from "discord-api-types/v10";
import { InteractionResponseType, MessageFlags } from "discord-api-types/v10";
import { EventEmitter } from "events";
import { getRedis } from "./functions/cache.js";
import { log } from "./logger.js";

// ─── Types ────────────────────────────────────────────────────────────────────

/** The actual handler function invoked when a component interaction arrives. */
export type ComponentHandlerFn = (
  res: Response,
  interaction: APIInteraction
) => Promise<void> | void;

/**
 * A named factory that rebuilds a ComponentHandlerFn from a stored context.
 * Factories are registered once at startup and never stored in Redis.
 */
export type ComponentFactory<Ctx = Record<string, unknown>> = (ctx: Ctx) => ComponentHandlerFn;

/** What is stored in Redis per component registration. */
interface StoredComponent {
  /** Name of the factory to call when this component fires. */
  factory: string;
  /** Arbitrary JSON context forwarded to the factory. */
  context: Record<string, unknown>;
  /** Discord user ID allowed to trigger this component (undefined = anyone). */
  authorId?: string;
  /** Remove the handler after the first successful trigger. */
  once: boolean;
  /** Unix timestamp (ms) when this entry expires — informational only (Redis TTL handles it). */
  expiresAt: number;
}

/** Options for `ComponentRegistry.register()`. */
export interface RegisterOptions {
  customId: string;
  factory: string;
  context?: Record<string, unknown>;
  /** TTL in seconds (default: 900 = 15 minutes). */
  ttlSeconds?: number;
  /** Remove after first trigger (default: true). */
  once?: boolean;
  /** If set, only this Discord user ID can trigger the component. */
  authorId?: string;
}

const REDIS_PREFIX = "gitbot:component:";
const DEFAULT_TTL_S = 15 * 60;

// ─── Registry ─────────────────────────────────────────────────────────────────

export class ComponentRegistry {
  /** In-process hot-layer emitter. */
  private readonly emitter = new EventEmitter();
  /** Named factory map — populated at startup by registerFactory(). */
  private readonly factories = new Map<string, ComponentFactory>();

  constructor() {
    // Allow an arbitrary number of listeners per event (one per active component)
    this.emitter.setMaxListeners(0);
  }

  // ── Factory registration ────────────────────────────────────────────────────

  /**
   * Register a named handler factory.
   * Must be called at startup, before any interactions arrive.
   */
  registerFactory<Ctx = Record<string, unknown>>(
    name: string,
    factory: ComponentFactory<Ctx>
  ): void {
    this.factories.set(name, factory as ComponentFactory);
  }

  // ── Component registration ──────────────────────────────────────────────────

  /**
   * Register a component handler.
   *
   * - Always adds a HOT listener to the in-process emitter.
   * - Also persists the handler descriptor to Redis so it survives restarts.
   */
  async register(opts: RegisterOptions): Promise<void> {
    const {
      customId,
      factory,
      context = {},
      ttlSeconds = DEFAULT_TTL_S,
      once = true,
      authorId,
    } = opts;

    if (!this.factories.has(factory)) {
      log.warn({ factory, customId }, "ComponentRegistry.register: unknown factory");
    }

    const stored: StoredComponent = {
      factory,
      context,
      authorId,
      once,
      expiresAt: Date.now() + ttlSeconds * 1000,
    };

    // 1. Persist to Redis
    const redis = await getRedis();
    await redis
      .set(`${REDIS_PREFIX}${customId}`, JSON.stringify(stored), { EX: ttlSeconds })
      .catch((err) => log.warn({ err, customId }, "Failed to persist component to Redis"));

    // 2. Add hot listener
    this._addHotListener(customId, stored, ttlSeconds);
  }

  // ── Dispatch ────────────────────────────────────────────────────────────────

  /**
   * Dispatch an incoming component interaction.
   *
   * Resolution order:
   *   1. Hot layer (in-process EventEmitter) — fastest path.
   *   2. Warm layer (Redis) — used after restarts or in multi-process deploys.
   *   3. Not found — reply with an ephemeral "expired" message.
   */
  async dispatch(customId: string, res: Response, interaction: APIInteraction): Promise<void> {
    // ── 1. Hot layer ──────────────────────────────────────────────────────────
    const hotHandled = this.emitter.emit(customId, res, interaction);
    if (hotHandled) return;

    // ── 2. Warm layer (Redis) ────────────────────────────────────────────────
    const redis = await getRedis();
    const raw = await redis.get(`${REDIS_PREFIX}${customId}`).catch(() => null);

    if (!raw) {
      // Not found in either layer
      this._replyExpired(res);
      return;
    }

    let stored: StoredComponent;
    try {
      stored = JSON.parse(raw) as StoredComponent;
    } catch {
      log.warn({ customId }, "Corrupt component entry in Redis");
      this._replyExpired(res);
      return;
    }

    // Author guard
    const callerId = (interaction as any).member?.user?.id ?? (interaction as any).user?.id;

    if (stored.authorId && callerId !== stored.authorId) {
      res.json({
        type: InteractionResponseType.ChannelMessageWithSource,
        data: {
          content: "This interaction is not for you.",
          flags: MessageFlags.Ephemeral,
        },
      });
      return;
    }

    const factory = this.factories.get(stored.factory);
    if (!factory) {
      log.error({ factory: stored.factory, customId }, "No factory registered for component");
      this._replyExpired(res);
      return;
    }

    const handler = factory(stored.context);

    // Re-register into the hot layer so subsequent clicks (non-once) are fast
    if (!stored.once) {
      const remainingTtlMs = Math.max(0, stored.expiresAt - Date.now());
      this._addHotListener(customId, stored, Math.ceil(remainingTtlMs / 1000));
    } else {
      // once = true: remove from Redis immediately
      await redis.del(`${REDIS_PREFIX}${customId}`).catch(() => {});
    }

    await handler(res, interaction);
  }

  // ── Unregister ───────────────────────────────────────────────────────────────

  /**
   * Explicitly remove a component handler (e.g. when a cancel button is clicked
   * and we want to also remove its paired confirm button).
   */
  async unregister(...customIds: string[]): Promise<void> {
    const redis = await getRedis();
    for (const id of customIds) {
      this.emitter.removeAllListeners(id);
      await redis.del(`${REDIS_PREFIX}${id}`).catch(() => {});
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private _addHotListener(customId: string, stored: StoredComponent, ttlSeconds: number): void {
    const { authorId, once } = stored;

    const handler = async (res: Response, interaction: APIInteraction) => {
      // Author guard
      const callerId = (interaction as any).member?.user?.id ?? (interaction as any).user?.id;

      if (authorId && callerId !== authorId) {
        res.json({
          type: InteractionResponseType.ChannelMessageWithSource,
          data: {
            content: "This interaction is not for you.",
            flags: MessageFlags.Ephemeral,
          },
        });
        // Re-emit so other listeners still get a chance (shouldn't be any,
        // but keeps the emitter consistent)
        return;
      }

      const factory = this.factories.get(stored.factory);
      if (!factory) {
        log.error({ factory: stored.factory, customId }, "Factory not found in hot handler");
        return;
      }

      if (once) {
        this.emitter.removeAllListeners(customId);
        // Also evict from Redis
        const redis = await getRedis().catch(() => null);
        if (redis) await redis.del(`${REDIS_PREFIX}${customId}`).catch(() => {});
      }

      await factory(stored.context)(res, interaction);
    };

    this.emitter.on(customId, handler);

    // Auto-remove from hot layer when TTL expires
    setTimeout(() => {
      this.emitter.removeAllListeners(customId);
    }, ttlSeconds * 1000);
  }

  private _replyExpired(res: Response): void {
    if (res.headersSent) return;
    res.json({
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        content:
          "⏱️ This interaction has expired or the bot was restarted. Please run the command again.",
        flags: MessageFlags.Ephemeral,
      },
    });
  }
}

/** Shared singleton — imported everywhere via `@utils`. */
export const registry = new ComponentRegistry();
