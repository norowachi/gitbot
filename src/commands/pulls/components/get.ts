import { Response } from "express";
import { Octokit } from "@octokit/rest";
import {
  InteractionResponseType,
  MessageFlags,
  ComponentType,
  ButtonStyle,
} from "discord-api-types/v10";
import { octoErrResponse, CreatePREmbed, markdownToPng, buildAttachmentPayload } from "@utils";
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

  const embed = CreatePREmbed(data);
  const message = {
    content: `[\`${data.user.login}\`](<${data.user.html_url}>) wants to merge ${data.commits} commit(s) into [\`${data.base.label}\`](<${data.base.repo.html_url}>) from [\`${data.head.label}\`](<${data.head.repo?.html_url}>)`,
    embeds: isSimple ? undefined : [embed],
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
  };

  if (data.body?.trim() && !isSimple) {
    const png = await markdownToPng(data.body);

    // Remove the text description — the image replaces it
    delete embed.description;

    // Reference the attachment in the embed
    embed.image = { url: "attachment://body.png" };

    const { body, contentType } = buildAttachmentPayload(
      {
        type: InteractionResponseType.ChannelMessageWithSource,
        data: {
          ...message,
          embeds: [embed],
          attachments: [{ id: 0, filename: "body.png" }],
        },
      },
      png,
      "body.png"
    );

    res.setHeader("Content-Type", contentType);
    res.end(body);
    return;
  }

  res.json({
    type: InteractionResponseType.ChannelMessageWithSource,
    data: message,
  });
}
