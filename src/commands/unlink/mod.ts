import {
  APIInteraction,
  ApplicationCommandType,
  ButtonStyle,
  ComponentType,
  InteractionResponseType,
  MessageFlags,
} from "discord-api-types/v10";
import { CommandData, Errors, registry } from "@utils";
import type { UnlinkConfirmContext, UnlinkCancelContext } from "@/factories/unlink.js";

const TTL = 5 * 60; // 5 minutes

export default {
  name: "unlink",
  description: "Unlink your GitHub account and delete your Gitbot data",
  type: ApplicationCommandType.ChatInput,
  contexts: [0, 1, 2],
  integration_types: [0, 1],

  run: async (res) => {
    const interaction = res.req.body as APIInteraction;
    const userId = interaction.member?.user.id ?? (interaction as any).user?.id;

    if (!userId) {
      return res.json({
        type: InteractionResponseType.ChannelMessageWithSource,
        data: { content: Errors.NoUserId, flags: MessageFlags.Ephemeral },
      });
    }

    const stamp = Date.now();
    const confirmId = `unlink-confirm-${userId}-${stamp}`;
    const cancelId = `unlink-cancel-${userId}-${stamp}`;

    res.json({
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        content:
          "Are you sure you want to unlink your GitHub account and delete all saved data? **This cannot be undone.**",
        flags: MessageFlags.Ephemeral,
        components: [
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.Button,
                style: ButtonStyle.Danger,
                label: "Yes, unlink",
                custom_id: confirmId,
              },
              {
                type: ComponentType.Button,
                style: ButtonStyle.Secondary,
                label: "Cancel",
                custom_id: cancelId,
              },
            ],
          },
        ],
      },
    });

    await registry.register({
      customId: confirmId,
      factory: "unlink-confirm",
      context: { discordId: userId, cancelId } satisfies UnlinkConfirmContext as Record<
        string,
        unknown
      >,
      ttlSeconds: TTL,
      once: true,
      authorId: userId,
    });

    await registry.register({
      customId: cancelId,
      factory: "unlink-cancel",
      context: { confirmId } satisfies UnlinkCancelContext as Record<string, unknown>,
      ttlSeconds: TTL,
      once: true,
      authorId: userId,
    });
  },
} as CommandData<true>;
