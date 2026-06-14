/**
 * Watchdog Module v2
 *
 * Three delivery modes for watching GitHub repositories:
 *
 *   poll    — Timed fetch. Works for any repo the token can read.
 *             No setup needed beyond the Discord webhook URL.
 *
 *   webhook — GitHub sends events in real-time via HTTPS POST.
 *             Requires admin:repo_hook scope on the token and SITE_URL to be set.
 *             Zero polling; instant delivery.
 *
 *   hybrid  — Webhook for real-time delivery + polling as a catchup fallback
 *             (every 30 min by default). Best of both worlds.
 *
 * Commands:
 *   /watch add [owner] [repo] [webhook_url] [events] [mode] [interval]
 *   /watch remove [owner] [repo]
 *   /watch list
 *   /watch status [owner] [repo]   — shows delivery mode, hook state, recent log
 *   /watch log [owner] [repo]      — last 20 delivery log entries
 *   /watch update [owner] [repo] [events] [mode]  — change settings in place
 */

import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  InteractionResponseType,
  MessageFlags,
} from "discord-api-types/v10";
import type { APIEmbed } from "discord-api-types/v10";
import { Octokit } from "@octokit/rest";

import type { Module, KernelHandle, ModuleContext } from "../../kernel/types.js";
import { WatchedRepoModel } from "./schema.js";
import type { DeliveryMode, WatchEvent } from "./schema.js";
import { startPoller } from "./poller.js";
import { buildWatchdogRouter } from "./router.js";
import { createHook, updateHook, deleteHook } from "./hooks.js";
import {
  handleRepoAutocomplete,
  handleUserAutocomplete,
  decryptToken,
  log,
  paginateContent,
  contentPager,
  truncate,
  safeFieldValue,
  LIMITS,
} from "@utils";
import { getUser } from "../../database/functions/user.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function modeLabel(mode: DeliveryMode): string {
  return { poll: "⏱️ Poll", webhook: "⚡ Webhook", hybrid: "🔀 Hybrid" }[mode];
}

function hookStateEmoji(state: string): string {
  return { active: "✅", inactive: "⏸️", pending: "⏳", failed: "❌", none: "—" }[state] ?? "?";
}

// ─── Module export ────────────────────────────────────────────────────────────

export default {
  id: "watchdog",
  name: "Repo Watchdog",
  version: "2.0.0",

  router: {
    path: "/watchdog",
    handler: buildWatchdogRouter(),
  },

  commands: [
    {
      name: "watch",
      description: "Watch a GitHub repository and get notified of new activity",
      type: ApplicationCommandType.ChatInput,
      contexts: [0, 1, 2],
      integration_types: [0, 1],

      options: [
        // ── add ──────────────────────────────────────────────────────────────
        {
          name: "add",
          description: "Start watching a repository",
          type: ApplicationCommandOptionType.Subcommand,
          options: [
            {
              name: "owner",
              description: "Repository owner",
              type: ApplicationCommandOptionType.String,
              required: true,
              autocomplete: true,
            },
            {
              name: "repo",
              description: "Repository name",
              type: ApplicationCommandOptionType.String,
              required: true,
              autocomplete: true,
            },
            {
              name: "webhook_url",
              description: "Discord channel webhook URL for notifications",
              type: ApplicationCommandOptionType.String,
              required: true,
            },
            {
              name: "events",
              description: "Which events to watch (default: both)",
              type: ApplicationCommandOptionType.String,
              required: false,
              choices: [
                { name: "Issues only", value: "issues" },
                { name: "Pull Requests only", value: "pulls" },
                { name: "Both (issues+PRs)", value: "both" },
                { name: "Releases only", value: "releases" },
                { name: "Everything", value: "all" },
              ],
            },
            {
              name: "mode",
              description: "Delivery mode (default: poll)",
              type: ApplicationCommandOptionType.String,
              required: false,
              choices: [
                { name: "⏱️ Poll — timed fetch, works everywhere", value: "poll" },
                { name: "⚡ Webhook — real-time, needs admin:repo_hook", value: "webhook" },
                { name: "🔀 Hybrid — webhook + polling fallback", value: "hybrid" },
              ],
            },
            {
              name: "interval",
              description:
                "Poll interval in minutes (default: 15, min: 5; ignored for pure webhook)",
              type: ApplicationCommandOptionType.Integer,
              required: false,
            },
          ],
        },

        // ── remove ───────────────────────────────────────────────────────────
        {
          name: "remove",
          description: "Stop watching a repository",
          type: ApplicationCommandOptionType.Subcommand,
          options: [
            {
              name: "owner",
              description: "Repository owner",
              type: ApplicationCommandOptionType.String,
              required: true,
              autocomplete: true,
            },
            {
              name: "repo",
              description: "Repository name",
              type: ApplicationCommandOptionType.String,
              required: true,
              autocomplete: true,
            },
          ],
        },

        // ── list ─────────────────────────────────────────────────────────────
        {
          name: "list",
          description: "List your active repository watches",
          type: ApplicationCommandOptionType.Subcommand,
        },

        // ── status ───────────────────────────────────────────────────────────
        {
          name: "status",
          description: "Show detailed status of a watch",
          type: ApplicationCommandOptionType.Subcommand,
          options: [
            {
              name: "owner",
              description: "Repository owner",
              type: ApplicationCommandOptionType.String,
              required: true,
              autocomplete: true,
            },
            {
              name: "repo",
              description: "Repository name",
              type: ApplicationCommandOptionType.String,
              required: true,
              autocomplete: true,
            },
          ],
        },

        // ── log ──────────────────────────────────────────────────────────────
        {
          name: "log",
          description: "Show the last 20 delivery log entries for a watch",
          type: ApplicationCommandOptionType.Subcommand,
          options: [
            {
              name: "owner",
              description: "Repository owner",
              type: ApplicationCommandOptionType.String,
              required: true,
              autocomplete: true,
            },
            {
              name: "repo",
              description: "Repository name",
              type: ApplicationCommandOptionType.String,
              required: true,
              autocomplete: true,
            },
          ],
        },

        // ── update ───────────────────────────────────────────────────────────
        {
          name: "update",
          description: "Update settings for an existing watch",
          type: ApplicationCommandOptionType.Subcommand,
          options: [
            {
              name: "owner",
              description: "Repository owner",
              type: ApplicationCommandOptionType.String,
              required: true,
              autocomplete: true,
            },
            {
              name: "repo",
              description: "Repository name",
              type: ApplicationCommandOptionType.String,
              required: true,
              autocomplete: true,
            },
            {
              name: "events",
              description: "New event filter",
              type: ApplicationCommandOptionType.String,
              required: false,
              choices: [
                { name: "Issues only", value: "issues" },
                { name: "Pull Requests only", value: "pulls" },
                { name: "Both", value: "both" },
                { name: "Releases only", value: "releases" },
                { name: "Everything", value: "all" },
              ],
            },
            {
              name: "mode",
              description: "New delivery mode",
              type: ApplicationCommandOptionType.String,
              required: false,
              choices: [
                { name: "⏱️ Poll", value: "poll" },
                { name: "⚡ Webhook", value: "webhook" },
                { name: "🔀 Hybrid", value: "hybrid" },
              ],
            },
            {
              name: "interval",
              description: "New poll interval in minutes",
              type: ApplicationCommandOptionType.Integer,
              required: false,
            },
          ],
        },
      ],

      // ── Autocomplete ────────────────────────────────────────────────────────

      autocomplete: async (res, focused, [db, octo], options) => {
        const owner = options?.get("owner") as string | undefined;
        const isOwner = owner ? db.github.login === owner : false;
        const choices = await (async () => {
          if (focused === "owner")
            return (await handleUserAutocomplete(db.github.login, owner)).map((u) => ({
              name: u,
              value: u,
            }));
          if (focused === "repo" && owner)
            return (
              await handleRepoAutocomplete(
                octo,
                owner,
                isOwner,
                options?.get("repo") as string | undefined
              )
            ).map((r) => ({ name: r, value: r }));
          return [];
        })();
        res.json({
          type: InteractionResponseType.ApplicationCommandAutocompleteResult,
          data: { choices },
        });
      },

      // ── Command handler ─────────────────────────────────────────────────────

      run: async (res, gh, sub, options) => {
        const [db] = gh as [import("../../database/interfaces/user.js").DBUser, Octokit];
        const interaction = (res.req as any).body;
        const userId: string = interaction?.member?.user?.id ?? interaction?.user?.id ?? "";

        // ── /watch add ──────────────────────────────────────────────────────
        if (sub?.[0] === "add") {
          const owner = options?.get("owner") as string;
          const repo = options?.get("repo") as string;
          const discordWebhookUrl = options?.get("webhook_url") as string;
          const events = (options?.get("events") as WatchEvent | undefined) ?? "both";
          const mode = (options?.get("mode") as DeliveryMode | undefined) ?? "poll";
          const intervalMinutes = Math.max(
            5,
            (options?.get("interval") as number | undefined) ?? 15
          );

          if (!discordWebhookUrl.startsWith("https://discord.com/api/webhooks/")) {
            res.json({
              type: InteractionResponseType.ChannelMessageWithSource,
              data: {
                content: "❌ Please provide a valid Discord webhook URL.",
                flags: MessageFlags.Ephemeral,
              },
            });
            return;
          }

          const octo = new Octokit({ auth: decryptToken(db.github.access_token) });

          // Seed lastSeen so only future events are reported
          const [latestIssue, latestPull] = await Promise.all([
            octo.issues
              .listForRepo({
                owner,
                repo,
                state: "open",
                per_page: 1,
                sort: "created",
                direction: "desc",
              })
              .then((r) => r.data.find((i) => !i.pull_request)?.number ?? 0)
              .catch(() => 0),
            octo.pulls
              .list({ owner, repo, state: "open", per_page: 1, sort: "created", direction: "desc" })
              .then((r) => r.data[0]?.number ?? 0)
              .catch(() => 0),
          ]);

          const watch = await WatchedRepoModel.findOneAndUpdate(
            { discordId: userId, owner, repo },
            {
              discordWebhookUrl,
              events,
              deliveryMode: mode,
              intervalMinutes,
              active: true,
              lastSeenIssue: latestIssue,
              lastSeenPull: latestPull,
              githubHookId: undefined,
              hookSecret: undefined,
              hookState: "none",
            },
            { upsert: true, new: true }
          );

          const lines = [
            `✅ Now watching **${truncate(`${owner}/${repo}`, 100)}**`,
            `Mode: **${modeLabel(mode)}** · Events: \`${events}\``,
          ];

          // Attempt GitHub webhook registration for webhook/hybrid modes
          if (mode === "webhook" || mode === "hybrid") {
            lines.push("");
            lines.push("⏳ Registering GitHub webhook...");
            res.json({
              type: InteractionResponseType.ChannelMessageWithSource,
              data: {
                content: lines.join("\n"),
                flags: MessageFlags.Ephemeral,
              },
            });

            const hookId = await createHook(octo, watch);
            await watch.save();

            // Edit original message with the result
            const { rest } = await import("@utils");
            await rest
              .req("PATCH", `/webhooks/${rest.me.id}/${interaction.token}/messages/@original`, {
                body: {
                  content: lines
                    .slice(0, -1)
                    .concat(
                      hookId
                        ? `✅ GitHub webhook registered (ID: \`${hookId}\`). Real-time delivery active!`
                        : `⚠️ Could not register GitHub webhook (check your token has \`admin:repo_hook\` scope). Falling back to polling every ${intervalMinutes} min.`
                    )
                    .join("\n"),
                },
              })
              .catch(() => {});
            return;
          }

          lines.push(`Check interval: every **${intervalMinutes} min**`);
          res.json({
            type: InteractionResponseType.ChannelMessageWithSource,
            data: {
              content: lines.join("\n"),
              flags: MessageFlags.Ephemeral,
            },
          });
          return;
        }

        // ── /watch remove ───────────────────────────────────────────────────
        if (sub?.[0] === "remove") {
          const owner = options?.get("owner") as string;
          const repo = options?.get("repo") as string;
          const watch = await WatchedRepoModel.findOne({ discordId: userId, owner, repo });

          if (!watch) {
            res.json({
              type: InteractionResponseType.ChannelMessageWithSource,
              data: {
                content: `No active watch found for **${owner}/${repo}**.`,
                flags: MessageFlags.Ephemeral,
              },
            });
            return;
          }

          // Delete the GitHub-side webhook if one was registered
          if (watch.githubHookId) {
            const dbUser = await getUser({ discordId: userId });
            if (dbUser) {
              const octo = new Octokit({ auth: decryptToken(dbUser.github.access_token) });
              await deleteHook(octo, watch);
            }
          }

          await watch.deleteOne();
          res.json({
            type: InteractionResponseType.ChannelMessageWithSource,
            data: {
              content: `✅ Stopped watching **${owner}/${repo}**.`,
              flags: MessageFlags.Ephemeral,
            },
          });
          return;
        }

        // ── /watch list ─────────────────────────────────────────────────────
        if (sub?.[0] === "list") {
          const watches = await WatchedRepoModel.find({ discordId: userId, active: true });
          if (!watches.length) {
            res.json({
              type: InteractionResponseType.ChannelMessageWithSource,
              data: {
                content: "You have no active watches. Use `/watch add` to set one up.",
                flags: MessageFlags.Ephemeral,
              },
            });
            return;
          }

          const lines = watches.map(
            (w) =>
              `• **${w.owner}/${w.repo}** — ${modeLabel(w.deliveryMode)} · \`${w.events}\` ${w.githubHookId ? `${hookStateEmoji(w.hookState)} hook` : ""}`
          );
          const header = `**Your watches (${watches.length}):**`;
          const pages = paginateContent(lines, header, LIMITS.MESSAGE_CONTENT);
          await contentPager(res, pages, MessageFlags.Ephemeral);
          return;
        }

        // ── /watch status ───────────────────────────────────────────────────
        if (sub?.[0] === "status") {
          const owner = options?.get("owner") as string;
          const repo = options?.get("repo") as string;
          const w = await WatchedRepoModel.findOne({ discordId: userId, owner, repo });

          if (!w) {
            res.json({
              type: InteractionResponseType.ChannelMessageWithSource,
              data: {
                content: `No watch found for **${owner}/${repo}**.`,
                flags: MessageFlags.Ephemeral,
              },
            });
            return;
          }

          const recentDeliveries =
            w.deliveryLog
              .slice(-5)
              .reverse()
              .map(
                (e) =>
                  `${e.success ? "✅" : "❌"} \`${e.source}\` ${e.event} <t:${Math.floor(e.ts.getTime() / 1000)}:R>`
              )
              .join("\n") || "None";

          const embed: APIEmbed = {
            title: truncate(`📡 Watch status: ${owner}/${repo}`, LIMITS.EMBED_TITLE),
            color:
              w.hookState === "active" ? 0x2da44e : w.hookState === "failed" ? 0xcf222e : 0xe3b341,
            fields: [
              { name: "Delivery Mode", value: modeLabel(w.deliveryMode), inline: true },
              { name: "Events", value: `\`${w.events}\``, inline: true },
              { name: "Active", value: w.active ? "Yes" : "No", inline: true },
              {
                name: "GitHub Hook",
                value: safeFieldValue(
                  w.githubHookId
                    ? `${hookStateEmoji(w.hookState)} ID \`${w.githubHookId}\``
                    : "Not registered"
                ),
                inline: true,
              },
              {
                name: "Last Webhook Delivery",
                value: w.lastHookDeliveryAt
                  ? `<t:${Math.floor(w.lastHookDeliveryAt.getTime() / 1000)}:R>`
                  : "Never",
                inline: true,
              },
              {
                name: "Last Poll",
                value: w.lastPolledAt
                  ? `<t:${Math.floor(w.lastPolledAt.getTime() / 1000)}:R>`
                  : "Never",
                inline: true,
              },
              ...(w.hookError
                ? [
                    {
                      name: "Hook Error",
                      value: safeFieldValue(`\`${w.hookError}\``),
                      inline: false,
                    },
                  ]
                : []),
              {
                name: "Recent Deliveries",
                value: safeFieldValue(recentDeliveries),
                inline: false,
              },
            ],
          };

          res.json({
            type: InteractionResponseType.ChannelMessageWithSource,
            data: {
              embeds: [embed],
              flags: MessageFlags.Ephemeral,
            },
          });
          return;
        }

        // ── /watch log ──────────────────────────────────────────────────────
        if (sub?.[0] === "log") {
          const owner = options?.get("owner") as string;
          const repo = options?.get("repo") as string;
          const w = await WatchedRepoModel.findOne({ discordId: userId, owner, repo });

          if (!w) {
            res.json({
              type: InteractionResponseType.ChannelMessageWithSource,
              data: {
                content: `No watch found for **${owner}/${repo}**.`,
                flags: MessageFlags.Ephemeral,
              },
            });
            return;
          }

          const entries = w.deliveryLog.slice(-20).reverse();
          if (!entries.length) {
            res.json({
              type: InteractionResponseType.ChannelMessageWithSource,
              data: {
                content: "No delivery log entries yet.",
                flags: MessageFlags.Ephemeral,
              },
            });
            return;
          }

          const lines = entries.map(
            (e) =>
              `${e.success ? "✅" : "❌"} [\`${e.source}\`] **${truncate(e.event, 40)}** <t:${Math.floor(e.ts.getTime() / 1000)}:R>${e.error ? ` — \`${truncate(e.error, 60)}\`` : ""}`
          );
          const header = `**Delivery log for ${owner}/${repo} (last ${entries.length}):**`;
          const pages = paginateContent(lines, header, LIMITS.MESSAGE_CONTENT);
          await contentPager(res, pages, MessageFlags.Ephemeral);
          return;
        }

        // ── /watch update ───────────────────────────────────────────────────
        if (sub?.[0] === "update") {
          const owner = options?.get("owner") as string;
          const repo = options?.get("repo") as string;
          const events = options?.get("events") as WatchEvent | undefined;
          const mode = options?.get("mode") as DeliveryMode | undefined;
          const interval = options?.get("interval") as number | undefined;

          const w = await WatchedRepoModel.findOne({ discordId: userId, owner, repo });
          if (!w) {
            res.json({
              type: InteractionResponseType.ChannelMessageWithSource,
              data: {
                content: `No watch found for **${owner}/${repo}**.`,
                flags: MessageFlags.Ephemeral,
              },
            });
            return;
          }

          const oldMode = w.deliveryMode;
          if (events) w.events = events;
          if (mode) w.deliveryMode = mode;
          if (interval) w.intervalMinutes = Math.max(5, interval);

          const octo = new Octokit({ auth: decryptToken(db.github.access_token) });
          const lines: string[] = [`✅ Updated watch for **${owner}/${repo}**`];

          // Handle mode transitions
          const switchingToWebhook = mode && mode !== "poll" && oldMode === "poll";
          const switchingToPoll = mode === "poll" && oldMode !== "poll";
          const eventsChanged = events && events !== w.events;

          if (switchingToPoll && w.githubHookId) {
            await deleteHook(octo, w);
            lines.push("GitHub webhook removed.");
          } else if (switchingToWebhook) {
            lines.push("⏳ Registering GitHub webhook...");
            res.json({
              type: InteractionResponseType.ChannelMessageWithSource,
              data: {
                content: lines.join("\n"),
                flags: MessageFlags.Ephemeral,
              },
            });
            await w.save();
            const hookId = await createHook(octo, w);
            await w.save();
            const { rest } = await import("@utils");
            await rest
              .req("PATCH", `/webhooks/${rest.me.id}/${interaction.token}/messages/@original`, {
                body: {
                  content: lines
                    .slice(0, -1)
                    .concat(
                      hookId
                        ? `✅ GitHub webhook registered (ID: \`${hookId}\`).`
                        : "⚠️ Webhook registration failed — check token scope."
                    )
                    .join("\n"),
                },
              })
              .catch(() => {});
            return;
          } else if (eventsChanged && w.githubHookId) {
            // Update event subscription on existing hook
            await updateHook(octo, w);
            lines.push("GitHub webhook event subscription updated.");
          }

          await w.save();
          res.json({
            type: InteractionResponseType.ChannelMessageWithSource,
            data: {
              content: lines.join("\n"),
              flags: MessageFlags.Ephemeral,
            },
          });
          return;
        }

        res.json({
          type: InteractionResponseType.ChannelMessageWithSource,
          data: {
            content: "Unknown subcommand.",
            flags: MessageFlags.Ephemeral,
          },
        });
      },
    },
  ],

  setup(_kernel: KernelHandle): ModuleContext {
    const poller = startPoller();
    log.info("[Watchdog] Module started (poller running)");
    return { poller };
  },

  teardown(ctx: ModuleContext): void {
    (ctx.poller as ReturnType<typeof startPoller>)?.stop();
    log.info("[Watchdog] Module torn down");
  },
} satisfies Module;
