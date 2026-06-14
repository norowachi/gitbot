import { Response } from "express";
import { Octokit } from "@octokit/rest";
import {
  InteractionResponseType,
  MessageFlags,
  ComponentType,
  ButtonStyle,
} from "discord-api-types/v10";
import type { APIInteraction } from "discord-api-types/v10";
import { octoErrResponse, registry } from "@utils";
import type { DBUser } from "@database/interfaces/user.js";
import type { MergeContext, MergeCancelContext } from "@/factories/merge.js";

type MergeMethod = "merge" | "squash" | "rebase";

export default async function Merge(
  res: Response,
  [db, octo]: [DBUser, Octokit],
  options: Map<string, unknown>
): Promise<void> {
  const interaction = res.req.body as APIInteraction;
  const userId = (interaction as any).member?.user?.id ?? (interaction as any).user?.id;

  const owner = options.get("owner") as string;
  const repo = options.get("repo") as string;
  const pull_number = options.get("pull_number") as number;
  const merge_method = (options.get("merge_method") as MergeMethod | undefined) ?? "merge";
  const commit_title = options.get("commit_title") as string | undefined;
  const commit_message = options.get("commit_message") as string | undefined;

  const prReq = await octo.pulls.get({ owner, repo, pull_number }).catch((e) => {
    octoErrResponse(res, e);
    return null;
  });

  if (!prReq) return;

  const pr = prReq.data;

  if (pr.merged) {
    res.json({
      type: InteractionResponseType.ChannelMessageWithSource,
      data: { content: `PR #${pull_number} is already merged.`, flags: MessageFlags.Ephemeral },
    });
    return;
  }

  if (!pr.mergeable) {
    res.json({
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        content: `PR #${pull_number} cannot be merged (state: \`${pr.mergeable_state}\`). Resolve conflicts on GitHub first.`,
        flags: MessageFlags.Ephemeral,
      },
    });
    return;
  }

  const stamp = Date.now();
  const confirmId = `merge-confirm-${pull_number}-${stamp}`;
  const cancelId = `merge-cancel-${pull_number}-${stamp}`;
  const TTL = 5 * 60; // 5 minutes

  res.json({
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      content: [
        `Merge **${pr.title}** #${pr.number} into \`${pr.base.label}\`?`,
        `Method: \`${merge_method}\``,
      ].join("\n"),
      flags: MessageFlags.Ephemeral,
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.Button,
              style: ButtonStyle.Success,
              label: "Merge",
              custom_id: confirmId,
            },
            {
              type: ComponentType.Button,
              style: ButtonStyle.Danger,
              label: "Cancel",
              custom_id: cancelId,
            },
          ],
        },
      ],
    },
  });

  // Register both buttons in Redis so they survive restarts
  await registry.register({
    customId: confirmId,
    factory: "merge-confirm",
    context: {
      discordId: db.discord.id,
      owner,
      repo,
      pull_number,
      merge_method,
      commit_title,
      commit_message,
      cancelId,
    } satisfies MergeContext as Record<string, unknown>,
    ttlSeconds: TTL,
    once: true,
    authorId: userId,
  });

  await registry.register({
    customId: cancelId,
    factory: "merge-cancel",
    context: { confirmId } satisfies MergeCancelContext as Record<string, unknown>,
    ttlSeconds: TTL,
    once: true,
    authorId: userId,
  });
}
