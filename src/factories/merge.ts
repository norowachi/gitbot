/**
 * Factories for /pulls merge confirmation buttons.
 *
 * Context shape: { discordId, owner, repo, pull_number, merge_method, commit_title?, commit_message? }
 */

import { InteractionResponseType, MessageFlags } from "discord-api-types/v10";
import { registry } from "@utils";
import { getUser } from "@database/functions/user.js";
import { decryptToken } from "@utils";
import { Octokit } from "@octokit/rest";
import { octoErrResponse, emitAction } from "@utils";

export interface MergeContext {
  discordId: string;
  owner: string;
  repo: string;
  pull_number: number;
  merge_method: "merge" | "squash" | "rebase";
  commit_title?: string;
  commit_message?: string;
  /** The paired cancel button's customId — so we can unregister it on confirm. */
  cancelId: string;
}

export interface MergeCancelContext {
  /** The paired confirm button's customId — so we can unregister it on cancel. */
  confirmId: string;
}

registry.registerFactory<MergeContext>("merge-confirm", (ctx) => async (res) => {
  await registry.unregister(ctx.cancelId);

  const dbUser = await getUser({ discordId: ctx.discordId });
  if (!dbUser) {
    res.json({
      type: InteractionResponseType.UpdateMessage,
      data: {
        content: "Could not find your linked account. Please re-link with `/link`.",
        components: [],
        flags: MessageFlags.Ephemeral,
      },
    });
    return;
  }

  const octo = new Octokit({
    auth: decryptToken(dbUser.github.access_token),
  });

  const mergeReq = await octo.pulls
    .merge({
      owner: ctx.owner,
      repo: ctx.repo,
      pull_number: ctx.pull_number,
      merge_method: ctx.merge_method,
      commit_title: ctx.commit_title,
      commit_message: ctx.commit_message,
    })
    .catch((e) => {
      octoErrResponse(res, e);
      return null;
    });

  if (!mergeReq) return;

  void emitAction(ctx.discordId);
  res.json({
    type: InteractionResponseType.UpdateMessage,
    data: {
      content: `✅ PR #${ctx.pull_number} merged successfully!\nSHA: \`${mergeReq.data.sha?.slice(0, 7)}\``,
      components: [],
      flags: MessageFlags.Ephemeral,
    },
  });
});

registry.registerFactory<MergeCancelContext>("merge-cancel", (ctx) => async (res) => {
  await registry.unregister(ctx.confirmId);

  res.json({
    type: InteractionResponseType.UpdateMessage,
    data: {
      content: "Merge cancelled.",
      components: [],
      flags: MessageFlags.Ephemeral,
    },
  });
});
