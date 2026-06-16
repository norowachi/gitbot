import { type Response } from "express";
import { type Octokit } from "@octokit/rest";
import {
  InteractionResponseType,
  MessageFlags,
  ComponentType,
  ButtonStyle,
} from "discord-api-types/v10";
import {
  octoErrResponse,
  CreateIssueEmbed,
  DiscordTimestamp,
  type OctoErrorType,
  markdownToPng,
  buildAttachmentPayload,
} from "@utils";
import type { DBUser } from "@database/interfaces/user.js";
import { type Endpoints } from "@octokit/types";

export default async function Get(
  res: Response,
  [db, octo]: [DBUser, Octokit],
  options: Map<string, unknown>
): Promise<void> {
  const owner = options.get("owner") as string;
  const repo = options.get("repo") as string;
  const issue_number = options.get("issue_number") as number;

  const req = await octo.issues.get({ owner, repo, issue_number }).catch((e: OctoErrorType) => {
    octoErrResponse(res, e);
    return null;
  });

  if (!req) return;

  const data = req.data;
  const isSimple = db.settings.misc.simple;

  const embed = CreateIssueEmbed(
    data as Endpoints["GET /repos/{owner}/{repo}/issues/{issue_number}"]["response"]["data"]
  );

  const message = {
    content: `[\`${data.user?.login}\`](<${data.user?.html_url}>) opened [**${data.title}**](<${data.html_url}>) #${data.number} ${DiscordTimestamp(data.created_at, "R")} · ${data.comments} comment(s)`,
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
