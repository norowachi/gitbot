import { Response } from "express";
import { Octokit } from "@octokit/rest";
import {
  InteractionResponseType,
  MessageFlags,
  ComponentType,
  ButtonStyle,
} from "discord-api-types/v10";
import { octoErrResponse } from "@utils";
import type { DBUser } from "@database/interfaces/user.js";

export default async function Comment(
  res: Response,
  [db, octo]: [DBUser, Octokit],
  options: Map<string, unknown>
): Promise<void> {
  const owner = options.get("owner") as string;
  const repo = options.get("repo") as string;
  const pull_number = options.get("pull_number") as number;
  const body = options.get("body") as string;

  // PR comments use the issues API
  const req = await octo.issues
    .createComment({ owner, repo, issue_number: pull_number, body })
    .catch((e) => {
      octoErrResponse(res, e);
      return null;
    });

  if (!req) return;

  const data = req.data;

  res.json({
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      content: `Comment added to PR #${pull_number}.`,
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.Button,
              style: ButtonStyle.Link,
              label: "View Comment",
              url: data.html_url,
            },
          ],
        },
      ],
      flags: db.settings.misc.ephemeral ? MessageFlags.Ephemeral : undefined,
    },
  });
}
