import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  InteractionResponseType,
  MessageFlags,
} from "discord-api-types/v10";
import {
  CommandData,
  handleRepoAutocomplete,
  handleUserAutocomplete,
  octoErrResponse,
  safeFieldValue,
  truncate,
  LIMITS,
} from "@utils";
import { editUserSettings } from "@database/functions/user.js";
import type { APIEmbed } from "discord-api-types/v10";

export default {
  name: "settings",
  description: "Manage your Gitbot settings",
  type: ApplicationCommandType.ChatInput,
  contexts: [0, 1, 2],
  integration_types: [0, 1],
  options: [
    {
      name: "view",
      description: "View your current Gitbot settings",
      type: ApplicationCommandOptionType.Subcommand,
    },
    {
      name: "misc",
      description: "Toggle global display preferences",
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: "ephemeral",
          description: "Send responses as ephemeral (only visible to you)",
          type: ApplicationCommandOptionType.Boolean,
          required: false,
        },
        {
          name: "simple",
          description: "Use compact text replies instead of rich embeds",
          type: ApplicationCommandOptionType.Boolean,
          required: false,
        },
      ],
    },
    {
      name: "issues",
      description: "Configure per-repository issue defaults",
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
          name: "auto_assignees",
          description: "Comma-separated GitHub logins to auto-assign (leave empty to clear)",
          type: ApplicationCommandOptionType.String,
          required: false,
        },
        {
          name: "auto_project",
          description: "GitHub ProjectV2 node ID to auto-add issues into (leave empty to clear)",
          type: ApplicationCommandOptionType.String,
          required: false,
        },
      ],
    },
  ],

  autocomplete: async (res, focused, [db, octo], options) => {
    const owner = options?.get("owner") as string | undefined;
    const repo = options?.get("repo") as string | undefined;
    const isOwner = owner ? db.github.login === owner : false;

    switch (focused) {
      case "owner":
        return res.json({
          type: InteractionResponseType.ApplicationCommandAutocompleteResult,
          data: {
            choices: (await handleUserAutocomplete(db.github.login, owner)).map((u) => ({
              name: u,
              value: u,
            })),
          },
        });
      case "repo":
        if (!owner) return;
        return res.json({
          type: InteractionResponseType.ApplicationCommandAutocompleteResult,
          data: {
            choices: (await handleRepoAutocomplete(octo, owner, isOwner, repo)).map((r) => ({
              name: r,
              value: r,
            })),
          },
        });
    }
  },

  run: async (res, gh, sub, options) => {
    const [db, octo] = gh as [
      import("@database/interfaces/user.js").DBUser,
      import("@octokit/rest").Octokit,
    ];

    switch (sub?.[0]) {
      case "view": {
        const issueConfigs = db.settings.issues;

        const embed: APIEmbed = {
          title: "Your Gitbot Settings",
          color: 0x5865f2,
          fields: [
            {
              name: "Ephemeral Responses",
              value: db.settings.misc.ephemeral ? "✅ Enabled" : "❌ Disabled",
              inline: true,
            },
            {
              name: "Simple Mode",
              value: db.settings.misc.simple ? "✅ Enabled" : "❌ Disabled",
              inline: true,
            },
            {
              name: "Per-Repo Issue Config",
              value: safeFieldValue(
                issueConfigs.length > 0
                  ? issueConfigs
                      .map((c) => {
                        const parts = [`**${truncate(`${c.owner}/${c.repo}`, 80)}**`];
                        if (c.auto_assignees?.length)
                          parts.push(
                            `→ Auto-assignees: ${truncate(c.auto_assignees.join(", "), 200)}`
                          );
                        if (c.auto_project) parts.push(`→ Auto-project: \`${c.auto_project}\``);
                        return parts.join("\n");
                      })
                      .join("\n\n")
                  : "None configured"
              ),
              inline: false,
            },
          ],
        };

        return res.json({
          type: InteractionResponseType.ChannelMessageWithSource,
          data: { embeds: [embed], flags: MessageFlags.Ephemeral },
        });
      }

      case "misc": {
        const ephemeral = options?.get("ephemeral") as boolean | undefined;
        const simple = options?.get("simple") as boolean | undefined;

        if (ephemeral === undefined && simple === undefined) {
          return res.json({
            type: InteractionResponseType.ChannelMessageWithSource,
            data: {
              content: "Please provide at least one setting to update.",
              flags: MessageFlags.Ephemeral,
            },
          });
        }

        await editUserSettings(db.discord.id, {
          misc: {
            ephemeral: ephemeral ?? db.settings.misc.ephemeral,
            simple: simple ?? db.settings.misc.simple,
          },
        });

        const lines: string[] = [];
        if (ephemeral !== undefined) lines.push(`Ephemeral: ${ephemeral ? "✅ On" : "❌ Off"}`);
        if (simple !== undefined) lines.push(`Simple Mode: ${simple ? "✅ On" : "❌ Off"}`);

        return res.json({
          type: InteractionResponseType.ChannelMessageWithSource,
          data: {
            content: `Settings updated:\n${lines.join("\n")}`,
            flags: MessageFlags.Ephemeral,
          },
        });
      }

      case "issues": {
        const owner = options?.get("owner") as string;
        const repo = options?.get("repo") as string;
        const auto_assignees_raw = options?.get("auto_assignees") as string | undefined;
        const auto_project = options?.get("auto_project") as string | undefined;

        const auto_assignees = auto_assignees_raw
          ?.split(",")
          .map((a) => a.trim())
          .filter(Boolean);

        await editUserSettings(db.discord.id, {
          issues: [{ owner, repo, auto_assignees, auto_project }],
        });

        const lines = [`Saved issue config for \`${owner}/${repo}\`:`];
        if (auto_assignees?.length) lines.push(`→ Auto-assignees: ${auto_assignees.join(", ")}`);
        else if (auto_assignees_raw !== undefined) lines.push("→ Auto-assignees: cleared");
        if (auto_project !== undefined)
          lines.push(
            auto_project ? `→ Auto-project: \`${auto_project}\`` : "→ Auto-project: cleared"
          );

        return res.json({
          type: InteractionResponseType.ChannelMessageWithSource,
          data: { content: lines.join("\n"), flags: MessageFlags.Ephemeral },
        });
      }

      default:
        return res.json({
          type: InteractionResponseType.ChannelMessageWithSource,
          data: { content: "Unknown subcommand.", flags: MessageFlags.Ephemeral },
        });
    }
  },
} as CommandData<true>;
