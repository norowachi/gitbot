/**
 * GitHub webhook lifecycle management.
 *
 * Handles:
 *   - Registering a new webhook on a repo (createHook)
 *   - Updating event subscriptions (updateHook)
 *   - Deleting the webhook when a watch is removed (deleteHook)
 *   - Verifying incoming webhook payloads via HMAC-SHA256 (verifySignature)
 *   - Generating secure hook secrets
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Octokit } from "@octokit/rest";
import type { IWatchedRepo } from "./schema.js";
import { githubEventNames } from "./dispatcher.js";
import { env, log } from "@utils";

// ─── Secret generation ────────────────────────────────────────────────────────

export function generateHookSecret(): string {
  return randomBytes(32).toString("hex");
}

// ─── Signature verification ───────────────────────────────────────────────────

/**
 * Verify a GitHub webhook payload using the stored HMAC-SHA256 secret.
 * Uses timing-safe comparison to prevent timing attacks.
 *
 * @param rawBody   Raw request body Buffer (must be the exact bytes received)
 * @param signature X-Hub-Signature-256 header value, e.g. "sha256=abc123..."
 * @param secret    The watch's hookSecret
 */
export function verifySignature(
  rawBody: Buffer,
  signature: string | undefined,
  secret: string
): boolean {
  if (!signature?.startsWith("sha256=")) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");

  const receivedHex = signature.slice(7); // strip "sha256="

  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(receivedHex, "hex"));
  } catch {
    return false;
  }
}

// ─── GitHub hook CRUD ─────────────────────────────────────────────────────────

/**
 * Register a new webhook on the repo.
 * The delivery URL is `SITE_URL/watchdog/hook/<watch._id>`.
 *
 * @returns The GitHub hook ID, or null on failure.
 */
export async function createHook(octo: Octokit, watch: IWatchedRepo): Promise<number | null> {
  if (!env.SITE_URL) {
    log.warn("[Watchdog] SITE_URL not set — cannot register GitHub webhooks");
    return null;
  }

  const url = `${env.SITE_URL}/watchdog/hook/${watch._id}`;
  const secret = generateHookSecret();
  const events = githubEventNames(watch.events);

  const res = await octo.repos
    .createWebhook({
      owner: watch.owner,
      repo: watch.repo,
      config: { url, secret, content_type: "json", insecure_ssl: "0" },
      events,
      active: true,
    })
    .catch((err) => {
      log.warn(
        {
          err: err?.response?.data ?? err?.message,
          owner: watch.owner,
          repo: watch.repo,
        },
        "[Watchdog] Failed to create GitHub webhook"
      );
      return null;
    });

  if (!res) return null;

  watch.githubHookId = res.data.id;
  watch.hookSecret = secret;
  watch.hookState = "active";
  watch.hookError = undefined;

  log.info(
    { hookId: res.data.id, repo: `${watch.owner}/${watch.repo}` },
    "[Watchdog] GitHub webhook created"
  );

  return res.data.id;
}

/**
 * Update the event subscription list of an existing hook.
 */
export async function updateHook(octo: Octokit, watch: IWatchedRepo): Promise<boolean> {
  if (!watch.githubHookId) return false;

  const events = githubEventNames(watch.events);

  const res = await octo.repos
    .updateWebhook({
      owner: watch.owner,
      repo: watch.repo,
      hook_id: watch.githubHookId,
      config: { content_type: "json" },
      events,
      active: true,
    })
    .catch((err) => {
      log.warn(
        {
          err: err?.response?.data ?? err?.message,
          hookId: watch.githubHookId,
        },
        "[Watchdog] Failed to update GitHub webhook"
      );
      return null;
    });

  if (!res) {
    watch.hookState = "failed";
    return false;
  }

  watch.hookState = "active";
  return true;
}

/**
 * Delete the GitHub-side webhook.
 * Called when `/watch remove` is run or when the module is unloaded cleanly.
 */
export async function deleteHook(octo: Octokit, watch: IWatchedRepo): Promise<void> {
  if (!watch.githubHookId) return;

  await octo.repos
    .deleteWebhook({
      owner: watch.owner,
      repo: watch.repo,
      hook_id: watch.githubHookId,
    })
    .catch((err) =>
      log.warn(
        { err: err?.response?.data ?? err?.message, hookId: watch.githubHookId },
        "[Watchdog] Failed to delete GitHub webhook (may already be gone)"
      )
    );

  watch.githubHookId = undefined;
  watch.hookSecret = undefined;
  watch.hookState = "none";
  watch.hookError = undefined;
}

/**
 * Re-register a webhook that has gone stale (e.g. after a URL change).
 * Deletes the old one first (best-effort), then creates a fresh one.
 */
export async function recreateHook(octo: Octokit, watch: IWatchedRepo): Promise<number | null> {
  await deleteHook(octo, watch);
  return createHook(octo, watch);
}
