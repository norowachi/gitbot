/**
 * Streak Module
 *
 * Tracks how many consecutive days a user performs GitHub actions (create/close
 * issues, merge PRs, etc.) through Gitbot.  Displays a flame streak counter
 * similar to Duolingo or GitHub's contribution graph.
 *
 * Commands contributed:
 *   /streak         — show your current streak
 *   /streak top     — leaderboard of top 10 streaks in the server
 *
 * How recording works:
 *   The kernel emits a "github:action" event whenever an authenticated command
 *   completes a write operation.  This module listens for that event and calls
 *   recordAction(discordId).
 *
 *   Commands that trigger it: issues create/close/reopen, pulls create/merge/close.
 *   (The existing command files emit kernel events via the KernelHandle passed
 *    through the GHContext — see the note in mod.ts about the event contract.)
 */

import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  InteractionResponseType,
  MessageFlags,
} from "discord-api-types/v10";
import type { APIEmbed } from "discord-api-types/v10";
import type { Module, KernelHandle } from "../../kernel/types.js";
import { recordAction, getStreak } from "./tracker.js";
import { StreakModel } from "./schema.js";

const FLAME_LEVELS = [
  { min: 0, emoji: "🌱", label: "Seedling" },
  { min: 3, emoji: "🔥", label: "On Fire" },
  { min: 7, emoji: "🔥🔥", label: "Blazing" },
  { min: 14, emoji: "⚡", label: "Lightning" },
  { min: 30, emoji: "💎", label: "Diamond" },
] as const;

function flameLevel(streak: number) {
  return [...FLAME_LEVELS].reverse().find((l) => streak >= l.min) ?? FLAME_LEVELS[0];
}

export default {
  id: "streak",
  name: "Activity Streak",
  version: "1.0.0",

  commands: [
    {
      name: "streak",
      description: "View your GitHub activity streak on Gitbot",
      type: ApplicationCommandType.ChatInput,
      contexts: [0, 1, 2],
      integration_types: [0, 1],
      options: [
        {
          name: "top",
          description: "Show the top-10 streak leaderboard",
          type: ApplicationCommandOptionType.Subcommand,
        },
        {
          name: "view",
          description: "View your own streak (default)",
          type: ApplicationCommandOptionType.Subcommand,
        },
      ],

      run: async (res, _gh, sub) => {
        const interaction = (res.req as any).body;
        const userId: string = interaction?.member?.user?.id ?? interaction?.user?.id ?? "";

        // ── /streak top ──────────────────────────────────────────────────────
        if (sub?.[0] === "top") {
          const top = await StreakModel.find().sort({ currentStreak: -1 }).limit(10).lean();

          if (!top.length) {
            res.json({
              type: InteractionResponseType.ChannelMessageWithSource,
              data: {
                content: "No streaks recorded yet. Start using Gitbot to build yours!",
                flags: MessageFlags.Ephemeral,
              },
            });
            return;
          }

          const lines = top.map((s, i) => {
            const { emoji } = flameLevel(s.currentStreak);
            return `**${i + 1}.** <@${s.discordId}> — ${emoji} **${s.currentStreak}** day streak · ${s.totalActions} total actions`;
          });

          const description = lines.join("\n");
          const embed: APIEmbed = {
            title: "🏆 Gitbot Streak Leaderboard",
            // paginateLines not needed here — 10 entries × ~80 chars = ~800, well under 4096
            // but guard anyway for safety
            description: description.length > 4096 ? description.slice(0, 4093) + "…" : description,
            color: 0xff6b00,
          };

          res.json({
            type: InteractionResponseType.ChannelMessageWithSource,
            data: { embeds: [embed] },
          });
          return;
        }

        // ── /streak view ─────────────────────────────────────────────────────
        const s = await getStreak(userId);

        if (!s || s.totalActions === 0) {
          res.json({
            type: InteractionResponseType.ChannelMessageWithSource,
            data: {
              content:
                "You have no streak yet! Create an issue or merge a PR through Gitbot to start one. 🌱",
              flags: MessageFlags.Ephemeral,
            },
          });
          return;
        }

        const { emoji, label } = flameLevel(s.currentStreak);
        const embed: APIEmbed = {
          title: `${emoji} ${label} — ${s.currentStreak}-day streak`,
          color: 0xff6b00,
          fields: [
            { name: "Current Streak", value: `**${s.currentStreak}** days`, inline: true },
            { name: "Longest Streak", value: `**${s.longestStreak}** days`, inline: true },
            { name: "Total Actions", value: `**${s.totalActions}**`, inline: true },
            { name: "Last Active", value: s.lastActiveDay || "Never", inline: true },
          ],
        };

        res.json({
          type: InteractionResponseType.ChannelMessageWithSource,
          data: { embeds: [embed], flags: MessageFlags.Ephemeral },
        });
      },

      // Streak command doesn't need autocomplete
      autocomplete: undefined,
    },
  ],

  setup(kernel: KernelHandle) {
    // Listen for the "github:action" kernel event emitted by commands
    kernel.on("github:action", async (...args: unknown[]) => {
      const discordId = args[0] as string | undefined;
      if (discordId) await recordAction(discordId).catch(() => {});
    });
    return {};
  },

  teardown() {
    // EventEmitter listeners are cleaned up automatically when the module
    // is unloaded — the kernel removes all "github:action" listeners
    // attached during setup via the module's handle.
  },
} satisfies Module;
