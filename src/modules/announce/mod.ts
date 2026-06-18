/**
 * Announce Module
 *
 * Lets bot admins create, manage, and broadcast announcements to users.
 * Announcements are automatically delivered as Discord DMs the next time
 * a user interacts with the bot.  Target audiences can be filtered to
 * all users, new users only, or returning users only.
 *
 * All /announce subcommands are admin-gated via ADMIN_DISCORD_IDS env var.
 *
 * Commands contributed:
 *   /announce create  — draft a new announcement
 *   /announce publish — make a draft live (starts delivery)
 *   /announce archive — stop delivery of an announcement
 *   /announce edit    — edit title/body/color/url of a draft
 *   /announce list    — list all announcements with status + seen count
 *   /announce preview — see how an announcement will look (ephemeral)
 *   /announce blast   — immediately DM all eligible users (rate-limited)
 *
 * Kernel events consumed:
 *   "user:interaction" (discordId, linkedAt) — injected by the kernel
 *       whenever an authenticated command runs; triggers DM delivery.
 */

import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ComponentType,
  InteractionResponseType,
  MessageFlags,
  TextInputStyle,
} from "discord-api-types/v10";
import type { APIEmbed } from "discord-api-types/v10";
import type { Module, KernelHandle } from "../../kernel/types.js";
import { AnnouncementModel } from "./schema.js";
import { buildAnnouncementEmbed, deliverViaDM, getPendingAnnouncements } from "./delivery.js";
import { registerAnnouncementMiddleware } from "./middleware.js";
import { env, log, truncate, safeFieldValue, LIMITS, IntEmitter } from "@utils";
import UserModel from "../../database/schemas/user.js";
import { Response } from "express";

// ─── Admin guard ──────────────────────────────────────────────────────────────

function isAdmin(userId: string): boolean {
  const ids = env.ADMIN_DISCORD_IDS;
  if (!ids) return false;
  return ids
    .split(",")
    .map((s) => s.trim())
    .includes(userId);
}

function adminDenied(res: import("express").Response): void {
  res.json({
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      content: "❌ This command is restricted to bot administrators.",
      flags: MessageFlags.Ephemeral,
    },
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusEmoji(status: string): string {
  return status === "active" ? "🟢" : status === "draft" ? "🟡" : "⚫";
}

function targetLabel(target: string): string {
  return target === "all" ? "Everyone" : target === "new" ? "New users" : "Returning users";
}

// ─── Module ───────────────────────────────────────────────────────────────────

export default {
  id: "announce",
  name: "Announcements",
  version: "1.0.0",

  commands: [
    {
      name: "announce",
      description: "Manage bot announcements (admin only)",
      type: ApplicationCommandType.ChatInput,
      contexts: [0, 1, 2],
      integration_types: [0, 1],

      options: [
        // ── create ──────────────────────────────────────────────────────────
        {
          name: "create",
          description: "Create a new announcement draft",
          type: ApplicationCommandOptionType.Subcommand,
          options: [
            {
              name: "slug",
              description: "Short unique identifier, e.g. 'v2-launch'",
              type: ApplicationCommandOptionType.String,
              required: true,
            },
            {
              name: "title",
              description: "Embed title",
              type: ApplicationCommandOptionType.String,
              required: true,
            },
            {
              name: "body",
              description: "Embed body (Markdown supported, max 4000 chars)",
              type: ApplicationCommandOptionType.String,
              required: true,
            },
            {
              name: "target",
              description: "Who to show this to (default: all)",
              type: ApplicationCommandOptionType.String,
              required: false,
              choices: [
                { name: "Everyone", value: "all" },
                { name: "New users only", value: "new" },
                { name: "Returning users", value: "returning" },
              ],
            },
            {
              name: "color",
              description: "Embed color as hex string, e.g. #ff6b00 (default: Gitbot blue)",
              type: ApplicationCommandOptionType.String,
              required: false,
            },
            {
              name: "url",
              description: "Optional URL for the embed title",
              type: ApplicationCommandOptionType.String,
              required: false,
            },
          ],
        },

        // ── publish ──────────────────────────────────────────────────────────
        {
          name: "publish",
          description: "Publish a draft announcement (starts delivery on next interaction)",
          type: ApplicationCommandOptionType.Subcommand,
          options: [
            {
              name: "slug",
              description: "Announcement slug",
              type: ApplicationCommandOptionType.String,
              required: true,
              autocomplete: true,
            },
          ],
        },

        // ── archive ──────────────────────────────────────────────────────────
        {
          name: "archive",
          description: "Archive an announcement (stops delivery)",
          type: ApplicationCommandOptionType.Subcommand,
          options: [
            {
              name: "slug",
              description: "Announcement slug",
              type: ApplicationCommandOptionType.String,
              required: true,
              autocomplete: true,
            },
          ],
        },

        // ── edit ─────────────────────────────────────────────────────────────
        {
          name: "edit",
          description: "Edit a draft announcement",
          type: ApplicationCommandOptionType.Subcommand,
          options: [
            {
              name: "slug",
              description: "Announcement slug",
              type: ApplicationCommandOptionType.String,
              required: true,
              autocomplete: true,
            },
            {
              name: "title",
              description: "New title",
              type: ApplicationCommandOptionType.String,
              required: false,
            },
            {
              name: "body",
              description: "New body",
              type: ApplicationCommandOptionType.String,
              required: false,
            },
            {
              name: "color",
              description: "New hex color, e.g. #2da44e",
              type: ApplicationCommandOptionType.String,
              required: false,
            },
            {
              name: "url",
              description: "New URL",
              type: ApplicationCommandOptionType.String,
              required: false,
            },
          ],
        },

        // ── list ─────────────────────────────────────────────────────────────
        {
          name: "list",
          description: "List all announcements",
          type: ApplicationCommandOptionType.Subcommand,
          options: [
            {
              name: "status",
              description: "Filter by status (default: all)",
              type: ApplicationCommandOptionType.String,
              required: false,
              choices: [
                { name: "All", value: "all" },
                { name: "Draft", value: "draft" },
                { name: "Active", value: "active" },
                { name: "Archived", value: "archived" },
              ],
            },
          ],
        },

        // ── preview ──────────────────────────────────────────────────────────
        {
          name: "preview",
          description: "Preview how an announcement will look",
          type: ApplicationCommandOptionType.Subcommand,
          options: [
            {
              name: "slug",
              description: "Announcement slug",
              type: ApplicationCommandOptionType.String,
              required: true,
              autocomplete: true,
            },
          ],
        },

        // ── blast ─────────────────────────────────────────────────────────────
        {
          name: "blast",
          description: "Immediately DM all eligible users (rate-limited, use sparingly)",
          type: ApplicationCommandOptionType.Subcommand,
          options: [
            {
              name: "slug",
              description: "Announcement slug",
              type: ApplicationCommandOptionType.String,
              required: true,
              autocomplete: true,
            },
          ],
        },
      ],

      // ── Autocomplete ────────────────────────────────────────────────────────

      autocomplete: async (res, _focused, [db]) => {
        if (!isAdmin(db.discord.id)) {
          res.json({
            type: InteractionResponseType.ApplicationCommandAutocompleteResult,
            data: { choices: [] },
          });
          return;
        }

        const anns = await AnnouncementModel.find().select("slug status").lean();
        res.json({
          type: InteractionResponseType.ApplicationCommandAutocompleteResult,
          data: {
            choices: anns.map((a) => ({
              name: `${statusEmoji(a.status)} ${a.slug}`,
              value: a.slug,
            })),
          },
        });
      },

      // ── Command handler ──────────────────────────────────────────────────────

      run: async (res, _gh, sub, options) => {
        const interaction = (res.req as any).body;
        const userId: string = interaction?.member?.user?.id ?? interaction?.user?.id ?? "";

        if (!isAdmin(userId)) {
          adminDenied(res);
          return;
        }

        switch (sub?.[0]) {
          // ── create ─────────────────────────────────────────────────────────
          case "create": {
            const slug = (options?.get("slug") as string).toLowerCase().replace(/\s+/g, "-");
            const title = options?.get("title") as string;
            const rawBody = options?.get("body") as string;
            const target = (options?.get("target") as string | undefined) ?? "all";
            const colorStr = options?.get("color") as string | undefined;
            const url = options?.get("url") as string | undefined;

            // Warn admin if body was truncated to the embed limit
            const body =
              rawBody.length > LIMITS.EMBED_DESCRIPTION
                ? rawBody.slice(0, LIMITS.EMBED_DESCRIPTION - 1) + "…"
                : rawBody;

            const color = colorStr ? parseInt(colorStr.replace("#", ""), 16) : 0x5865f2;

            const existing = await AnnouncementModel.findOne({ slug });
            if (existing) {
              res.json({
                type: InteractionResponseType.ChannelMessageWithSource,
                data: {
                  content: `❌ An announcement with slug \`${slug}\` already exists. Use \`/announce edit\` to modify it.`,
                  flags: MessageFlags.Ephemeral,
                },
              });
              return;
            }

            const ann = await AnnouncementModel.create({
              slug,
              title,
              body,
              target,
              color,
              url,
              status: "draft",
              createdBy: userId,
            });

            res.json({
              type: InteractionResponseType.ChannelMessageWithSource,
              data: {
                content: [
                  `✅ Draft created: \`${ann.slug}\``,
                  `Target: **${targetLabel(target)}** · Use \`/announce preview ${slug}\` to review, then \`/announce publish ${slug}\` to go live.`,
                ].join("\n"),
                embeds: [buildAnnouncementEmbed(ann)],
                flags: MessageFlags.Ephemeral,
              },
            });
            return;
          }

          // ── publish ────────────────────────────────────────────────────────
          case "publish": {
            const slug = options?.get("slug") as string;
            const ann = await AnnouncementModel.findOneAndUpdate(
              { slug },
              { status: "active" },
              { new: true }
            );

            if (!ann) {
              res.json({
                type: InteractionResponseType.ChannelMessageWithSource,
                data: {
                  content: `❌ No announcement found with slug \`${slug}\`.`,
                  flags: MessageFlags.Ephemeral,
                },
              });
              return;
            }

            res.json({
              type: InteractionResponseType.ChannelMessageWithSource,
              data: {
                content: `🟢 **${ann.title}** is now live. Users will receive it as a DM on their next interaction.`,
                embeds: [buildAnnouncementEmbed(ann)],
                flags: MessageFlags.Ephemeral,
              },
            });
            return;
          }

          // ── archive ────────────────────────────────────────────────────────
          case "archive": {
            const slug = options?.get("slug") as string;
            const ann = await AnnouncementModel.findOneAndUpdate(
              { slug },
              { status: "archived" },
              { new: true }
            );

            if (!ann) {
              res.json({
                type: InteractionResponseType.ChannelMessageWithSource,
                data: {
                  content: `❌ No announcement found with slug \`${slug}\`.`,
                  flags: MessageFlags.Ephemeral,
                },
              });
              return;
            }

            res.json({
              type: InteractionResponseType.ChannelMessageWithSource,
              data: {
                content: `⚫ **${ann.title}** archived. It will no longer be delivered. ${ann.seenCount} user(s) had seen it.`,
                flags: MessageFlags.Ephemeral,
              },
            });
            return;
          }

          // ── edit ───────────────────────────────────────────────────────────
          case "edit": {
            const slug = options?.get("slug") as string;
            const ann = await AnnouncementModel.findOne({ slug });

            if (!ann) {
              res.json({
                type: InteractionResponseType.ChannelMessageWithSource,
                data: {
                  content: `❌ No announcement found with slug \`${slug}\`.`,
                  flags: MessageFlags.Ephemeral,
                },
              });
              return;
            }

            if (ann.status !== "draft") {
              res.json({
                type: InteractionResponseType.ChannelMessageWithSource,
                data: {
                  content: `❌ Only **draft** announcements can be edited. Archive \`${slug}\` and create a new draft if you need changes.`,
                  flags: MessageFlags.Ephemeral,
                },
              });
              return;
            }

            const title = options?.get("title") as string | undefined;
            const rawBody = options?.get("body") as string | undefined;
            const colorStr = options?.get("color") as string | undefined;
            const url = options?.get("url") as string | undefined;

            if (!(rawBody && title && colorStr && url)) {
              const modalId = `announce-edit:${slug}`;
              res.json({
                type: InteractionResponseType.Modal,
                data: {
                  title: "Edit announcement body",
                  custom_id: modalId,
                  components: [
                    {
                      type: ComponentType.ActionRow,
                      components: [
                        {
                          type: ComponentType.TextInput,
                          custom_id: "body",
                          style: TextInputStyle.Paragraph,
                          label: "Body",
                          placeholder: "Enter the announcement body...",
                          required: true,
                          max_length: LIMITS.MODAL_TEXT_INPUT,
                          value: ann.body ?? "",
                        },
                      ],
                    },
                  ],
                },
              });
              IntEmitter.once(modalId, async (modalRes: Response, int: any) => {
                const body: string = int.data.components[0].components[0].value;

                if (body) ann.body = body;

                await ann.save();

                modalRes.json({
                  type: InteractionResponseType.ChannelMessageWithSource,
                  data: {
                    content: `✅ Draft \`${slug}\` updated.`,
                    embeds: [buildAnnouncementEmbed(ann)],
                    flags: MessageFlags.Ephemeral,
                  },
                });
                return;
              });
              return;
            }

            const body =
              rawBody !== undefined ? truncate(rawBody, LIMITS.EMBED_DESCRIPTION) : undefined;

            if (title) ann.title = title;
            if (body) ann.body = body;
            if (colorStr) ann.color = parseInt(colorStr.replace("#", ""), 16);
            if (url !== undefined) ann.url = url || undefined;

            await ann.save();

            res.json({
              type: InteractionResponseType.ChannelMessageWithSource,
              data: {
                content: `✅ Draft \`${slug}\` updated.`,
                embeds: [buildAnnouncementEmbed(ann)],
                flags: MessageFlags.Ephemeral,
              },
            });
            return;
          }

          // ── list ───────────────────────────────────────────────────────────
          case "list": {
            const statusFilter = options?.get("status") as string | undefined;
            const query = !statusFilter || statusFilter === "all" ? {} : { status: statusFilter };

            const anns = await AnnouncementModel.find(query).sort({ createdAt: -1 }).lean();

            if (!anns.length) {
              res.json({
                type: InteractionResponseType.ChannelMessageWithSource,
                data: { content: "No announcements found.", flags: MessageFlags.Ephemeral },
              });
              return;
            }

            // Discord: max 25 fields per embed — paginate across multiple embeds
            const FIELDS_PER_PAGE = LIMITS.FIELDS_PER_EMBED;
            const embedPages: APIEmbed[] = [];

            for (let i = 0; i < anns.length; i += FIELDS_PER_PAGE) {
              const chunk = anns.slice(i, i + FIELDS_PER_PAGE);
              embedPages.push({
                title: i === 0 ? "📢 Announcements" : undefined,
                color: 0x5865f2,
                fields: chunk.map((a) => ({
                  name: truncate(`${statusEmoji(a.status)} ${a.slug}`, LIMITS.EMBED_TITLE),
                  value: safeFieldValue(
                    [
                      `**${truncate(a.title, 100)}**`,
                      `Target: ${targetLabel(a.target)} · Seen: **${a.seenCount}**`,
                      `Created: <t:${Math.floor(new Date(a.createdAt).getTime() / 1000)}:R> by <@${a.createdBy}>`,
                    ].join("\n")
                  ),
                  inline: false,
                })),
              });
            }

            if (embedPages.length === 1) {
              res.json({
                type: InteractionResponseType.ChannelMessageWithSource,
                data: { embeds: embedPages, flags: MessageFlags.Ephemeral },
              });
            } else {
              // Use the registry-backed paginator so the admin can page through
              const { embedMaker } = await import("@utils");
              await embedMaker(res, embedPages, MessageFlags.Ephemeral);
            }
            return;
          }

          // ── preview ────────────────────────────────────────────────────────
          case "preview": {
            const slug = options?.get("slug") as string;
            const ann = await AnnouncementModel.findOne({ slug });

            if (!ann) {
              res.json({
                type: InteractionResponseType.ChannelMessageWithSource,
                data: {
                  content: `❌ No announcement found with slug \`${slug}\`.`,
                  flags: MessageFlags.Ephemeral,
                },
              });
              return;
            }

            res.json({
              type: InteractionResponseType.ChannelMessageWithSource,
              data: {
                content: `Preview of \`${slug}\` (${statusEmoji(ann.status)} ${ann.status}) — Target: **${targetLabel(ann.target)}**`,
                embeds: [buildAnnouncementEmbed(ann)],
                flags: MessageFlags.Ephemeral,
              },
            });
            return;
          }

          // ── blast ──────────────────────────────────────────────────────────
          case "blast": {
            const slug = options?.get("slug") as string;
            const ann = await AnnouncementModel.findOne({ slug, status: "active" });

            if (!ann) {
              res.json({
                type: InteractionResponseType.ChannelMessageWithSource,
                data: {
                  content: `❌ No **active** announcement found with slug \`${slug}\`. Publish it first.`,
                  flags: MessageFlags.Ephemeral,
                },
              });
              return;
            }

            // Acknowledge immediately — blast is async
            res.json({
              type: InteractionResponseType.ChannelMessageWithSource,
              data: {
                content: `📨 Blast started for \`${slug}\`. Eligible users will receive a DM. Check \`/announce list\` for the seen count.`,
                flags: MessageFlags.Ephemeral,
              },
            });

            // Run in background — fire and forget
            void (async () => {
              const users = await UserModel.find().select("discord.id createdAt").lean();
              let sent = 0;
              let skipped = 0;

              for (const user of users) {
                const pending = await getPendingAnnouncements(
                  user.discord.id,
                  new Date((user as any).createdAt ?? 0)
                ).catch(() => []);

                const thisAnn = pending.find((p) => String(p._id) === String(ann._id));
                if (!thisAnn) {
                  skipped++;
                  continue;
                }

                const ok = await deliverViaDM(user.discord.id, thisAnn);
                if (ok) sent++;

                // Respect Discord rate limits: ~1 DM per second is safe
                await new Promise<void>((r) => setTimeout(r, 1100));
              }

              log.info({ slug, sent, skipped }, "[Announce] Blast complete");
            })();

            return;
          }

          default:
            res.json({
              type: InteractionResponseType.ChannelMessageWithSource,
              data: { content: "Unknown subcommand.", flags: MessageFlags.Ephemeral },
            });
        }
      },
    },
  ],

  setup(kernel: KernelHandle) {
    registerAnnouncementMiddleware(kernel);
    log.info("[Announce] Module ready — announcement middleware registered");
    return {};
  },

  teardown() {
    // Kernel cleans up event listeners scoped to this module's handle
  },
} satisfies Module;
