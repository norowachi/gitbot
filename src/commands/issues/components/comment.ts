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
  const issue_number = options.get("issue_number") as number;
  const body = options.get("body") as string;

  const req = await octo.issues.createComment({ owner, repo, issue_number, body }).catch((e) => {
    octoErrResponse(res, e);
    return null;
  });

  if (!req) return;

  const data = req.data;

  res.json({
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      content: `Comment added to issue #${issue_number}.`,
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
