/**
 * Factories for paginated embed navigation buttons.
 *
 * Context shape: { authorId, embeds, page, prevId, nextId, token }
 *
 * Embeds are stored as serialised JSON in the context.
 * The page index is updated in-place in Redis on each click via re-registration.
 */

import {
  InteractionResponseType,
  MessageFlags,
  ComponentType,
  ButtonStyle,
} from "discord-api-types/v10";
import type { APIEmbed, APIActionRowComponent, APIButtonComponent } from "discord-api-types/v10";
import { registry, emojis } from "@utils";
import { log } from "@utils";

export interface PaginationContext {
  authorId: string;
  /** JSON-serialised APIEmbed[] */
  embedsJson: string;
  page: number;
  prevId: string;
  nextId: string;
  /** Interaction token for patching the original message on TTL. */
  token: string;
  ttlSeconds: number;
}

function buildNavRow(
  page: number,
  total: number,
  prevId: string,
  nextId: string
): APIActionRowComponent<APIButtonComponent> {
  return {
    type: ComponentType.ActionRow,
    components: [
      {
        type: ComponentType.Button,
        style: ButtonStyle.Primary,
        emoji: { name: emojis.arrowLeft },
        custom_id: prevId,
        disabled: page === 0,
      },
      {
        type: ComponentType.Button,
        style: ButtonStyle.Primary,
        emoji: { name: emojis.arrowRight },
        custom_id: nextId,
        disabled: page >= total - 1,
      },
    ],
  };
}

async function reregister(ctx: PaginationContext, newPage: number): Promise<void> {
  const updated: PaginationContext = { ...ctx, page: newPage };
  const remaining = Math.max(0, ctx.ttlSeconds);

  await registry.register({
    customId: ctx.prevId,
    factory: "pagination-prev",
    context: updated as unknown as Record<string, unknown>,
    ttlSeconds: remaining,
    once: true,
    authorId: ctx.authorId,
  });

  await registry.register({
    customId: ctx.nextId,
    factory: "pagination-next",
    context: updated as unknown as Record<string, unknown>,
    ttlSeconds: remaining,
    once: true,
    authorId: ctx.authorId,
  });
}

registry.registerFactory<PaginationContext>(
  "pagination-prev",
  (ctx) => async (res, interaction) => {
    const callerId = interaction.member?.user?.id ?? interaction.user?.id;

    if (ctx.authorId && callerId !== ctx.authorId) {
      res.json({
        type: InteractionResponseType.ChannelMessageWithSource,
        data: {
          content: "This pagination is not for you!",
          flags: MessageFlags.Ephemeral,
        },
      });
      // Re-register so the rightful owner can still use it
      await reregister(ctx, ctx.page);
      return;
    }

    let embeds: APIEmbed[];
    try {
      embeds = JSON.parse(ctx.embedsJson) as APIEmbed[];
    } catch {
      log.warn({ customId: ctx.prevId }, "Failed to parse embeds from pagination context");
      return;
    }

    const newPage = Math.max(0, ctx.page - 1);
    embeds[newPage].footer = {
      text: `Page ${newPage + 1} of ${embeds.length}`,
    };

    const navRow = buildNavRow(newPage, embeds.length, ctx.prevId, ctx.nextId);

    res.json({
      type: InteractionResponseType.UpdateMessage,
      data: { embeds: [embeds[newPage]], components: [navRow] },
    });

    await reregister(ctx, newPage);
  }
);

registry.registerFactory<PaginationContext>(
  "pagination-next",
  (ctx) => async (res, interaction) => {
    const callerId = interaction.member?.user?.id ?? interaction.user?.id;

    if (ctx.authorId && callerId !== ctx.authorId) {
      res.json({
        type: InteractionResponseType.ChannelMessageWithSource,
        data: {
          content: "This pagination is not for you!",
          flags: MessageFlags.Ephemeral,
        },
      });
      await reregister(ctx, ctx.page);
      return;
    }

    let embeds: APIEmbed[];
    try {
      embeds = JSON.parse(ctx.embedsJson) as APIEmbed[];
    } catch {
      log.warn({ customId: ctx.nextId }, "Failed to parse embeds from pagination context");
      return;
    }

    const newPage = Math.min(embeds.length - 1, ctx.page + 1);
    embeds[newPage].footer = {
      text: `Page ${newPage + 1} of ${embeds.length}`,
    };

    const navRow = buildNavRow(newPage, embeds.length, ctx.prevId, ctx.nextId);

    res.json({
      type: InteractionResponseType.UpdateMessage,
      data: { embeds: [embeds[newPage]], components: [navRow] },
    });

    await reregister(ctx, newPage);
  }
);
