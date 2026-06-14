/**
 * Express router for incoming GitHub webhook deliveries.
 * Mounted by the watchdog module at /watchdog.
 *
 * Routes:
 *   POST /watchdog/hook/:watchId   — receive a GitHub webhook payload
 */

import express, { type Router } from "express";
import { WatchedRepoModel } from "./schema.js";
import { verifySignature } from "./hooks.js";
import { dispatchEvent } from "./dispatcher.js";
import { postEmbeds, appendLog } from "./delivery.js";
import { log } from "@utils";

export function buildWatchdogRouter(): Router {
  const router = express.Router();

  /**
   * GitHub sends a raw JSON body with these headers:
   *   X-GitHub-Event      — event name (e.g. "issues", "pull_request")
   *   X-Hub-Signature-256 — HMAC-SHA256 signature
   *   X-GitHub-Delivery   — unique delivery UUID
   */
  router.post(
    "/hook/:watchId",
    // We need the raw body for HMAC verification — must run BEFORE json parsing
    express.raw({ type: "application/json", limit: "5mb" }),
    async (req, res) => {
      // Acknowledge immediately (GitHub expects <10s response)
      res.status(200).json({ ok: true });

      const { watchId } = req.params;
      const githubEvent = req.header("X-GitHub-Event") ?? "";
      const signature = req.header("X-Hub-Signature-256");
      const deliveryId = req.header("X-GitHub-Delivery") ?? "unknown";
      const rawBody = req.body as Buffer;

      log.debug({ watchId, githubEvent, deliveryId }, "[Watchdog] Webhook delivery received");

      // ── Lookup watch ──────────────────────────────────────────────────────
      const watch = await WatchedRepoModel.findById(watchId).catch(() => null);
      if (!watch) {
        log.warn({ watchId }, "[Watchdog] Unknown watchId in webhook delivery");
        return;
      }

      if (!watch.active) {
        log.debug({ watchId }, "[Watchdog] Watch is inactive — ignoring delivery");
        return;
      }

      // ── Verify signature ──────────────────────────────────────────────────
      if (!watch.hookSecret) {
        log.warn({ watchId }, "[Watchdog] Watch has no hookSecret — rejecting");
        return;
      }

      if (!verifySignature(rawBody, signature, watch.hookSecret)) {
        log.warn(
          { watchId, deliveryId, signature },
          "[Watchdog] Signature mismatch — payload rejected"
        );
        appendLog(watch, {
          source: "webhook",
          event: githubEvent,
          repoFullName: `${watch.owner}/${watch.repo}`,
          success: false,
          error: "signature_mismatch",
        });
        await watch.save().catch(() => {});
        return;
      }

      // ── Parse payload ─────────────────────────────────────────────────────
      let payload: any;
      try {
        payload = JSON.parse(rawBody.toString("utf-8"));
      } catch {
        log.warn({ watchId, deliveryId }, "[Watchdog] Failed to parse webhook payload");
        return;
      }

      // ── Dispatch ──────────────────────────────────────────────────────────
      const embeds = dispatchEvent(githubEvent, payload, watch.events);

      if (embeds.length === 0) {
        // Event received but not subscribed / action not handled
        watch.lastHookDeliveryAt = new Date();
        await watch.save().catch(() => {});
        return;
      }

      const { ok, error } = await postEmbeds(watch.discordWebhookUrl, embeds);

      appendLog(watch, {
        source: "webhook",
        event: `${githubEvent}/${payload.action ?? ""}`,
        repoFullName: `${watch.owner}/${watch.repo}`,
        success: ok,
        error,
      });

      watch.lastHookDeliveryAt = new Date();
      watch.hookState = watch.hookState === "failed" ? "active" : watch.hookState;

      await watch
        .save()
        .catch((err) => log.warn({ err }, "[Watchdog] Failed to save watch after delivery"));

      log.info(
        {
          watchId,
          githubEvent,
          repo: `${watch.owner}/${watch.repo}`,
          embeds: embeds.length,
          ok,
          deliveryId,
        },
        "[Watchdog] Webhook delivery processed"
      );
    }
  );

  return router;
}
