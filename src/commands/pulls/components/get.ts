import { Response } from "express";
import { Octokit } from "@octokit/rest";
import {
  InteractionResponseType,
  MessageFlags,
  ComponentType,
  ButtonStyle,
} from "discord-api-types/v10";
import { octoErrResponse, CreatePREmbed } from "@utils";
import type { DBUser } from "@database/interfaces/user.js";

export default async function Get(
  res: Response,
  [db, octo]: [DBUser, Octokit],
  options: Map<string, unknown>
): Promise<void> {
  const owner = options.get("owner") as string;
  const repo = options.get("repo") as string;
  const pull_number = options.get("pull_number") as number;

  const req = await octo.pulls.get({ owner, repo, pull_number }).catch((e) => {
    octoErrResponse(res, e);
    return null;
  });

  if (!req) return;

  const data = req.data;
  const isSimple = db.settings.misc.simple;

  res.json({
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      content: `[\`${data.user.login}\`](<${data.user.html_url}>) wants to merge ${data.commits} commit(s) into [\`${data.base.label}\`](<${data.base.repo.html_url}>) from [\`${data.head.label}\`](<${data.head.repo?.html_url}>)`,
      embeds: isSimple ? undefined : [CreatePREmbed(data)],
      components: isSimple
        ? undefined
        : [
            {
              type: ComponentType.ActionRow,
              components: [
                {
                  type: ComponentType.Button,
                  style: ButtonStyle.Link,
                  label: "View on GitHub",
                  url: data.html_url,
                },
              ],
            },
          ],
      flags: db.settings.misc.ephemeral ? MessageFlags.Ephemeral : undefined,
    },
  });
}
