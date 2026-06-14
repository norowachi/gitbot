/**
 * Shared delivery utilities:
 *   - postEmbeds()   — sends embeds to a Discord webhook URL (chunked)
 *   - appendLog()    — ring-buffer log write (max 50 entries per watch)
 */

import axios from "axios";
import type { IWatchedRepo, DeliveryLogEntry } from "./schema.js";
import type { WatchdogEmbed } from "./embeds.js";
import { log } from "@utils";

// ─── Discord delivery ─────────────────────────────────────────────────────────

export async function postEmbeds(
  discordWebhookUrl: string,
  embeds: WatchdogEmbed[]
): Promise<{ ok: boolean; error?: string }> {
  // Discord allows max 10 embeds per message
  for (let i = 0; i < embeds.length; i += 10) {
    const chunk = embeds.slice(i, i + 10);
    const res = await axios
      .post(
        discordWebhookUrl,
        { embeds: chunk },
        {
          headers: { "Content-Type": "application/json", "User-Agent": "gitbot-watchdog/2.0" },
          timeout: 8000,
        }
      )
      .catch((err) => {
        log.warn(
          { err: err?.response?.data ?? err?.message, url: discordWebhookUrl },
          "[Watchdog] Discord webhook post failed"
        );
        return { status: -1, data: { message: err?.message ?? "network error" } };
      });

    if ((res as any).status >= 400 || (res as any).status === -1) {
      const msg = (res as any).data?.message ?? "HTTP error";
      return { ok: false, error: msg };
    }
  }
  return { ok: true };
}

// ─── Delivery log ─────────────────────────────────────────────────────────────

const LOG_LIMIT = 50;

export function appendLog(watch: IWatchedRepo, entry: Omit<DeliveryLogEntry, "ts">): void {
  watch.deliveryLog.push({ ...entry, ts: new Date() });
  if (watch.deliveryLog.length > LOG_LIMIT) {
    watch.deliveryLog.splice(0, watch.deliveryLog.length - LOG_LIMIT);
  }
}
