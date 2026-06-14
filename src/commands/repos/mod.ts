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
  embedMaker,
  DiscordTimestamp,
  paginateContent,
  contentPager,
  LIMITS,
  truncate,
  safeFieldValue,
} from "@utils";
import type { APIEmbed } from "discord-api-types/v10";

export default {
  name: "repos",
  description: "Browse GitHub repositories",
  type: ApplicationCommandType.ChatInput,
  contexts: [0, 1, 2],
  integration_types: [0, 1],
  options: [
    {
      name: "list",
      description: "List your repositories",
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: "visibility",
          description: "Filter by visibility (default: all)",
          type: ApplicationCommandOptionType.String,
          required: false,
          choices: [
            { name: "All", value: "all" },
            { name: "Public", value: "public" },
            { name: "Private", value: "private" },
          ],
        },
      ],
    },
    {
      name: "get",
      description: "Get details of a repository",
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
      default:
        return;
    }
  },

  run: async (res, gh, sub, options) => {
    const [db, octo] = gh as [
      import("@database/interfaces/user.js").DBUser,
      import("@octokit/rest").Octokit,
    ];

    switch (sub?.[0]) {
      case "list": {
        const visibility =
          (options?.get("visibility") as "all" | "public" | "private" | undefined) ?? "all";

        const repos = await octo.repos
          .listForAuthenticatedUser({ visibility, per_page: 100, sort: "updated" })
          .catch((e) => {
            octoErrResponse(res, e);
            return null;
          });

        if (!repos) return;

        if (!repos.data.length) {
          return res.json({
            type: InteractionResponseType.ChannelMessageWithSource,
            data: { content: "No repositories found.", flags: MessageFlags.Ephemeral },
          });
        }

        if (db.settings.misc.simple) {
          const lines = repos.data.map(
            (r) =>
              `[\`${r.full_name}\`](<${r.html_url}>) — ⭐ ${r.stargazers_count} · ${r.private ? "🔒 Private" : "Public"}`
          );
          const header = `**Your repositories (${visibility}, ${repos.data.length}):**`;
          const pages = paginateContent(lines, header, LIMITS.MESSAGE_CONTENT);
          await contentPager(
            res,
            pages,
            db.settings.misc.ephemeral ? MessageFlags.Ephemeral : undefined
          );
          return;
        }

        const embeds: APIEmbed[] = repos.data.map((r) => ({
          title: truncate(r.full_name, LIMITS.EMBED_TITLE),
          url: r.html_url,
          description: truncate(r.description ?? "*No description.*", LIMITS.EMBED_DESCRIPTION),
          color: r.private ? 0xcf222e : 0x2da44e,
          fields: [
            { name: "Language", value: r.language ?? "Unknown", inline: true },
            { name: "Stars", value: r.stargazers_count.toString(), inline: true },
            { name: "Forks", value: r.forks_count.toString(), inline: true },
            { name: "Open Issues", value: r.open_issues_count.toString(), inline: true },
            { name: "Visibility", value: r.private ? "🔒 Private" : "🌐 Public", inline: true },
            {
              name: "Last Updated",
              value: r.updated_at ? DiscordTimestamp(r.updated_at, "R") : "Unknown",
              inline: true,
            },
          ],
        }));

        return embedMaker(
          res,
          embeds,
          db.settings.misc.ephemeral ? MessageFlags.Ephemeral : undefined
        );
      }

      case "get": {
        const owner = options?.get("owner") as string;
        const repo = options?.get("repo") as string;

        const req = await octo.repos.get({ owner, repo }).catch((e) => {
          octoErrResponse(res, e);
          return null;
        });

        if (!req) return;

        const r = req.data;

        const embed: APIEmbed = {
          title: truncate(r.full_name, LIMITS.EMBED_TITLE),
          url: r.html_url,
          description: truncate(r.description ?? "*No description.*", LIMITS.EMBED_DESCRIPTION),
          color: r.private ? 0xcf222e : 0x2da44e,
          thumbnail: { url: r.owner.avatar_url },
          fields: [
            { name: "Language", value: r.language ?? "Unknown", inline: true },
            { name: "Stars ⭐", value: r.stargazers_count.toString(), inline: true },
            { name: "Forks 🍴", value: r.forks_count.toString(), inline: true },
            { name: "Open Issues 🐛", value: r.open_issues_count.toString(), inline: true },
            { name: "Watchers 👁", value: r.watchers_count.toString(), inline: true },
            { name: "Default Branch", value: `\`${r.default_branch}\``, inline: true },
            {
              name: "Topics",
              value: safeFieldValue(
                r.topics?.length ? r.topics.map((t) => `\`${t}\``).join(", ") : "None"
              ),
              inline: false,
            },
            {
              name: "Created",
              value: r.created_at ? DiscordTimestamp(r.created_at, "f") : "Unknown",
              inline: true,
            },
            {
              name: "Last Updated",
              value: r.updated_at ? DiscordTimestamp(r.updated_at, "R") : "Unknown",
              inline: true,
            },
          ],
        };

        if (r.license) {
          embed.fields!.push({ name: "License", value: r.license.spdx_id, inline: true });
        }

        return res.json({
          type: InteractionResponseType.ChannelMessageWithSource,
          data: {
            embeds: [embed],
            flags: db.settings.misc.ephemeral ? MessageFlags.Ephemeral : undefined,
          },
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
