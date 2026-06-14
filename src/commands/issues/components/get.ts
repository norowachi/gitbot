import { Response } from "express";
import { Octokit } from "@octokit/rest";
import {
  InteractionResponseType,
  MessageFlags,
  ComponentType,
  ButtonStyle,
} from "discord-api-types/v10";
import { octoErrResponse, CreateIssueEmbed, DiscordTimestamp } from "@utils";
import type { DBUser } from "@database/interfaces/user.js";

export default async function Get(
  res: Response,
  [db, octo]: [DBUser, Octokit],
  options: Map<string, unknown>
): Promise<void> {
  const owner = options.get("owner") as string;
  const repo = options.get("repo") as string;
  const issue_number = options.get("issue_number") as number;

  const req = await octo.issues.get({ owner, repo, issue_number }).catch((e) => {
    octoErrResponse(res, e);
    return null;
  });

  if (!req) return;

  const data = req.data;
  const isSimple = db.settings.misc.simple;

  res.json({
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      content: `[\`${data.user?.login}\`](<${data.user?.html_url}>) opened [**${data.title}**](<${data.html_url}>) #${data.number} ${DiscordTimestamp(data.created_at, "R")} · ${data.comments} comment(s)`,
      embeds: isSimple ? undefined : [CreateIssueEmbed(data)],
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
