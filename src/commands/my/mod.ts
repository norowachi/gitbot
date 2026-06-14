import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  InteractionResponseType,
  MessageFlags,
} from "discord-api-types/v10";
import {
  CommandData,
  octoErrResponse,
  DiscordTimestamp,
  handleUserAutocomplete,
  paginateContent,
  contentPager,
  truncate,
  safeFieldValue,
  LIMITS,
} from "@utils";
import type { APIEmbed } from "discord-api-types/v10";

export default {
  name: "my",
  description: "View GitHub profile info",
  type: ApplicationCommandType.ChatInput,
  contexts: [0, 1, 2],
  integration_types: [0, 1],
  options: [
    {
      name: "profile",
      description: "View a GitHub user's profile",
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: "user",
          description: "GitHub username (defaults to your linked account)",
          type: ApplicationCommandOptionType.String,
          required: false,
          autocomplete: true,
        },
      ],
    },
    {
      name: "notifications",
      description: "View your unread GitHub notifications",
      type: ApplicationCommandOptionType.Subcommand,
    },
  ],

  autocomplete: async (res, focused, [db]) => {
    if (focused === "user") {
      return res.json({
        type: InteractionResponseType.ApplicationCommandAutocompleteResult,
        data: {
          choices: (await handleUserAutocomplete(db.github.login)).map((u) => ({
            name: u,
            value: u,
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
      case "profile": {
        const usernameOpt = options?.get("user") as string | undefined;

        const req = await (
          usernameOpt
            ? octo.users.getByUsername({ username: usernameOpt })
            : octo.users.getAuthenticated()
        ).catch((e) => {
          octoErrResponse(res, e);
          return null;
        });

        if (!req) return;

        const u = req.data;

        const bio: string | undefined = (u as any).bio ?? undefined;

        const embed: APIEmbed = {
          title: truncate(u.name ?? u.login, LIMITS.EMBED_TITLE),
          url: u.html_url,
          description: bio ? truncate(bio, LIMITS.EMBED_DESCRIPTION) : undefined,
          thumbnail: { url: u.avatar_url },
          color: 0x2da44e,
          fields: [
            {
              name: "Login",
              value: safeFieldValue(`[\`${u.login}\`](${u.html_url})`),
              inline: true,
            },
            { name: "Type", value: u.type, inline: true },
            { name: "Public Repos", value: String(u.public_repos), inline: true },
            { name: "Followers", value: String(u.followers), inline: true },
            { name: "Following", value: String(u.following), inline: true },
          ],
        };

        if ((u as any).company) {
          embed.fields!.push({
            name: "Company",
            value: truncate((u as any).company as string, 100),
            inline: true,
          });
        }
        if ((u as any).location) {
          embed.fields!.push({
            name: "Location",
            value: truncate((u as any).location as string, 100),
            inline: true,
          });
        }
        if ((u as any).blog) {
          embed.fields!.push({
            name: "Website",
            value: truncate((u as any).blog as string, 200),
            inline: true,
          });
        }
        if (u.created_at) {
          embed.fields!.push({
            name: "Joined GitHub",
            value: DiscordTimestamp(u.created_at, "f"),
            inline: true,
          });
        }

        return res.json({
          type: InteractionResponseType.ChannelMessageWithSource,
          data: {
            embeds: [embed],
            flags: db.settings.misc.ephemeral ? MessageFlags.Ephemeral : undefined,
          },
        });
      }

      case "notifications": {
        const req = await octo.activity
          .listNotificationsForAuthenticatedUser({ all: false, per_page: 50 })
          .catch((e) => {
            octoErrResponse(res, e);
            return null;
          });

        if (!req) return;

        const notifs = req.data;

        if (!notifs.length) {
          return res.json({
            type: InteractionResponseType.ChannelMessageWithSource,
            data: {
              content: "🎉 You have no unread notifications.",
              flags: MessageFlags.Ephemeral,
            },
          });
        }

        const lines = notifs.map((n) => {
          const repoName = n.repository.full_name;
          const type = n.subject.type;
          const title = truncate(n.subject.title, 80);
          const reason = n.reason;
          return `• **[${repoName}]** \`${type}\` — ${title} _(${reason})_`;
        });

        const trailer = "\n\n[View all on GitHub](<https://github.com/notifications>)";
        const header = `**Your unread GitHub notifications (${notifs.length}):**`;
        // Reserve space for the trailer on the last page
        const pages = paginateContent(lines, header, LIMITS.MESSAGE_CONTENT - trailer.length);
        pages[pages.length - 1] += trailer;

        const ephem = db.settings.misc.ephemeral ? MessageFlags.Ephemeral : undefined;
        return contentPager(res, pages, ephem);
      }

      default:
        return res.json({
          type: InteractionResponseType.ChannelMessageWithSource,
          data: { content: "Unknown subcommand.", flags: MessageFlags.Ephemeral },
        });
    }
  },
} as CommandData<true>;
