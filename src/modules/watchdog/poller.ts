/**
 * Polling fallback — used when deliveryMode is "poll" or "hybrid".
 *
 * In hybrid mode the poller catches up on any events missed during downtime
 * (e.g. the bot was offline when a webhook fired).  It runs at a reduced
 * frequency when a webhook is active (min interval: 30 min instead of 5 min).
 */

import { Octokit } from "@octokit/rest";
import { WatchedRepoModel } from "./schema.js";
import { getUser } from "../../database/functions/user.js";
import { decryptToken, log } from "@utils";
import { postEmbeds, appendLog } from "./delivery.js";
import { issueOpenedEmbed, prOpenedEmbed } from "./embeds.js";

/** Minutes between catchup polls when a webhook is active (hybrid mode). */
const HYBRID_CATCHUP_MINUTES = 30;

// ─── Per-repo poll ────────────────────────────────────────────────────────────

export async function pollRepo(watch: InstanceType<typeof WatchedRepoModel>): Promise<void> {
  const dbUser = await getUser({ discordId: watch.discordId });
  if (!dbUser) return;

  const octo = new Octokit({ auth: decryptToken(dbUser.github.access_token) });
  const { owner, repo } = watch;
  const embeds = [];

  // ── Issues ─────────────────────────────────────────────────────────────────
  if (["issues", "both", "all"].includes(watch.events)) {
    const res = await octo.issues
      .listForRepo({
        owner,
        repo,
        state: "open",
        sort: "created",
        direction: "asc",
        per_page: 20,
        since: watch.lastPolledAt?.toISOString(),
      })
      .catch(() => null);

    if (res) {
      const fresh = res.data.filter((i) => !i.pull_request && i.number > watch.lastSeenIssue);
      for (const issue of fresh)
        embeds.push(issueOpenedEmbed({ issue, repository: { full_name: `${owner}/${repo}` } }));
      const max = Math.max(
        watch.lastSeenIssue,
        ...res.data.filter((i) => !i.pull_request).map((i) => i.number)
      );
      if (max > watch.lastSeenIssue) watch.lastSeenIssue = max;
    }
  }

  // ── PRs ────────────────────────────────────────────────────────────────────
  if (["pulls", "both", "all"].includes(watch.events)) {
    const res = await octo.pulls
      .list({ owner, repo, state: "open", sort: "created", direction: "asc", per_page: 20 })
      .catch(() => null);

    if (res) {
      const fresh = res.data.filter((p) => p.number > watch.lastSeenPull);
      for (const pr of fresh)
        embeds.push(
          prOpenedEmbed({ pull_request: pr, repository: { full_name: `${owner}/${repo}` } })
        );
      const max = Math.max(watch.lastSeenPull, ...res.data.map((p) => p.number));
      if (max > watch.lastSeenPull) watch.lastSeenPull = max;
    }
  }

  const repoFullName = `${owner}/${repo}`;
  watch.lastPolledAt = new Date();

  if (embeds.length > 0) {
    const { ok, error } = await postEmbeds(watch.discordWebhookUrl, embeds);
    appendLog(watch, { source: "poll", event: "catchup", repoFullName, success: ok, error });
    if (ok) log.info({ owner, repo, count: embeds.length }, "[Watchdog] Poll posted notifications");
  }

  await watch.save().catch(() => {});
}

// ─── Poll loop ────────────────────────────────────────────────────────────────

export function startPoller(defaultIntervalMs = 60_000): { stop: () => void } {
  let running = true;
  const lastCheck = new Map<string, number>();

  const loop = async () => {
    while (running) {
      try {
        const watches = await WatchedRepoModel.find({ active: true });
        const now = Date.now();

        await Promise.allSettled(
          watches
            .filter((w) => {
              if (w.deliveryMode === "webhook") return false; // pure webhook — skip poll

              // In hybrid mode, use a longer catch-up interval
              const intervalMin =
                w.deliveryMode === "hybrid"
                  ? Math.max(w.intervalMinutes, HYBRID_CATCHUP_MINUTES)
                  : Math.max(w.intervalMinutes, 5);

              const last = lastCheck.get(w.id as string) ?? 0;
              return now - last >= intervalMin * 60_000;
            })
            .map(async (w) => {
              lastCheck.set(w.id as string, now);
              await pollRepo(w);
            })
        );
      } catch (err) {
        log.warn({ err }, "[Watchdog] Poll loop error (non-fatal)");
      }

      await new Promise<void>((r) => setTimeout(r, defaultIntervalMs));
    }
  };

  void loop();
  return {
    stop() {
      running = false;
    },
  };
}
