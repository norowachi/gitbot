/**
 * Announcement middleware.
 *
 * Listens for the "user:interaction" kernel event emitted by the kernel
 * whenever an authenticated command interaction is processed. When pending
 * announcements exist for that user, they are delivered via DM immediately
 * (fire-and-forget, never blocks the command response).
 *
 * If the DM fails (user has DMs closed), the announcement is silently skipped
 * and will be retried on their next interaction.
 */

import { getPendingAnnouncements, deliverViaDM } from "./delivery.js";
import { log } from "@utils";
import type { KernelHandle } from "../../kernel/types.js";

/**
 * Register the announcement injection listener on the kernel.
 * Called once during module setup().
 */
export function registerAnnouncementMiddleware(kernel: KernelHandle): void {
  kernel.on("user:interaction", async (...args: unknown[]) => {
    const discordId = args[0] as string | undefined;
    const userLinkedAt = args[1] as Date | undefined;

    if (!discordId || !userLinkedAt) return;

    const pending = await getPendingAnnouncements(discordId, userLinkedAt).catch(() => []);
    if (!pending.length) return;

    log.debug({ discordId, count: pending.length }, "[Announce] Delivering pending announcements");

    // Deliver all pending announcements — failures are silent
    for (const ann of pending) {
      void deliverViaDM(discordId, ann);
    }
  });
}
