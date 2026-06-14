import { Response } from "express";
import { Octokit } from "@octokit/rest";
import { InteractionResponseType, MessageFlags } from "discord-api-types/v10";
import { octoErrResponse } from "@utils";
import type { DBUser } from "@database/interfaces/user.js";

export default async function RequestReview(
  res: Response,
  [db, octo]: [DBUser, Octokit],
  options: Map<string, unknown>
): Promise<void> {
  const owner = options.get("owner") as string;
  const repo = options.get("repo") as string;
  const pull_number = options.get("pull_number") as number;
  const reviewer = options.get("reviewer") as string;

  const req = await octo.pulls
    .requestReviewers({ owner, repo, pull_number, reviewers: [reviewer] })
    .catch((e) => {
      octoErrResponse(res, e);
      return null;
    });

  if (!req) return;

  res.json({
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      content: `Review requested from [\`${reviewer}\`](<https://github.com/${reviewer}>) on PR #${pull_number}.`,
      flags: db.settings.misc.ephemeral ? MessageFlags.Ephemeral : undefined,
    },
  });
}
