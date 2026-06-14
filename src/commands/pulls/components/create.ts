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

export default async function Create(
  res: Response,
  [db, octo]: [DBUser, Octokit],
  options: Map<string, unknown>
): Promise<void> {
  const owner = options.get("owner") as string;
  const repo = options.get("repo") as string;
  const head = options.get("head") as string;
  const base = options.get("base") as string;
  const title = options.get("title") as string | undefined;
  const issue = options.get("issue") as number | undefined;
  const body = options.get("body") as string | undefined;
  const draft = options.get("draft") as boolean | undefined;
  const maintainer_can_modify = options.get("maintainer_can_modify") as boolean | undefined;
  const head_repo = options.get("head_repo") as string | undefined;

  if (!title && !issue) {
    res.json({
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        content: "You must provide either a `title` or an `issue` number.",
        flags: MessageFlags.Ephemeral,
      },
    });
    return;
  }

  const req = await octo.pulls
    .create({
      owner,
      repo,
      head,
      base,
      title,
      issue,
      body,
      draft,
      maintainer_can_modify,
      head_repo,
    })
    .catch((e) => {
      octoErrResponse(res, e);
      return null;
    });

  if (!req) return;

  const data = req.data;
  const isSimple = db.settings.misc.simple;

  res.json({
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      content: isSimple
        ? `PR #${data.number} created: [${data.title}](<${data.html_url}>)`
        : `[\`${data.user.login}\`](<${data.user.html_url}>) wants to merge ${data.commits} commit(s) into [\`${data.base.label}\`](<${data.base.repo.html_url}>) from [\`${data.head.label}\`](<${data.head.repo?.html_url}>)`,
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
