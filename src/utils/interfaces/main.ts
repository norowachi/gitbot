/* eslint-disable no-unused-vars */
import {
  type APIInteraction,
  InteractionResponseType,
  MessageFlags,
  type RESTPostAPIApplicationCommandsJSONBody,
} from "discord-api-types/v10";
import type { Response } from "express";
import { EventEmitter } from "events";
import { type Octokit } from "@octokit/rest";
import type { DBUser } from "@database/interfaces/user.js";

// ─── Error messages ───────────────────────────────────────────────────────────

export enum Errors {
  Unexpected = "An unexpected error occurred. Please try again.",
  NotLinked = "You must link your GitHub account first. Use `/link`.",
  NoUserId = "Could not determine your Discord user ID.",
}

// ─── GH auth tuple ────────────────────────────────────────────────────────────

export type GHContext = [db: DBUser, octo: Octokit];

// ─── Custom interaction emitter ───────────────────────────────────────────────

/**
 * An EventEmitter that automatically cleans up listeners after 30 minutes
 * and sends a fallback "unexpected error" response if no listener is registered
 * for an emitted event.
 */
export class CustomIntEmitter extends EventEmitter {
  private readonly TTL_MS = 30 * 60 * 1000;

  emit(event: string, res: Response, int: APIInteraction): boolean {
    // Schedule cleanup
    setTimeout(() => this.removeAllListeners(event), this.TTL_MS);

    const handled = super.emit(event, res, int);

    if (!handled && res.writable) {
      res.json({
        type: InteractionResponseType.ChannelMessageWithSource,
        data: {
          content: Errors.Unexpected,
          flags: MessageFlags.Ephemeral,
        },
      });
    }
    return handled;
  }
}

// ─── Command structure ────────────────────────────────────────────────────────

/**
 * Describes a slash command module.
 *
 * * `T = true`  → command requires the user to be GitHub-authenticated (most commands).
 * * `T = false` → command works without auth (link, ping).
 */
export interface CommandData<T extends boolean = false> extends Omit<
  RESTPostAPIApplicationCommandsJSONBody,
  "id" | "application_id"
> {
  // API type is wrong ig, we want to enforce it being present in our code
  description: string;

  /**
   * Interaction install contexts.
   * 0 = Guild, 1 = Bot DM, 2 = Private channel / group DM
   */
  contexts: number[];
  /**
   * Integration installation types.
   * 0 = Guild install, 1 = User install
   */
  integration_types: number[];

  /**
   * Main command handler.
   * @param res       Express response – reply via `res.json({...})`
   * @param gh        `[DBUser, Octokit]` if authenticated; `[]` otherwise
   * @param sub       Subcommand path, e.g. `["issues", "create"]`
   * @param options   Flat map of option name → value for the deepest subcommand
   */
  run: (
    res: Response,
    gh: T extends true ? GHContext : GHContext | [],
    sub?: string[],
    options?: Map<string, unknown>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) => Promise<any> | any;

  /**
   * Autocomplete handler (optional).
   */
  autocomplete?: (
    res: Response,
    focused: string,
    gh: GHContext,
    options?: Map<string, unknown>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) => Promise<any> | any;
}

/** Shorthand for `undefined | null | T` */
export type UN<Type> = undefined | null | Type;
