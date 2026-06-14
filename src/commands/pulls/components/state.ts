import { Response } from "express";
import { Octokit } from "@octokit/rest";
import { InteractionResponseType, MessageFlags } from "discord-api-types/v10";
import { octoErrResponse, CreatePREmbed } from "@utils";
import type { DBUser } from "@database/interfaces/user.js";

export async function Close(
  res: Response,
  [db, octo]: [DBUser, Octokit],
  options: Map<string, unknown>
): Promise<void> {
  const owner = options.get("owner") as string;
  const repo = options.get("repo") as string;
  const pull_number = options.get("pull_number") as number;

  const req = await octo.pulls.update({ owner, repo, pull_number, state: "closed" }).catch((e) => {
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
        ? `PR #${data.number} closed: [${data.title}](<${data.html_url}>)`
        : `## Closed`,
      embeds: isSimple ? undefined : [CreatePREmbed(data)],
      flags: db.settings.misc.ephemeral ? MessageFlags.Ephemeral : undefined,
    },
  });
}

export async function Reopen(
  res: Response,
  [db, octo]: [DBUser, Octokit],
  options: Map<string, unknown>
): Promise<void> {
  const owner = options.get("owner") as string;
  const repo = options.get("repo") as string;
  const pull_number = options.get("pull_number") as number;

  const req = await octo.pulls.update({ owner, repo, pull_number, state: "open" }).catch((e) => {
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
        ? `PR #${data.number} reopened: [${data.title}](<${data.html_url}>)`
        : `## Reopened`,
      embeds: isSimple ? undefined : [CreatePREmbed(data)],
      flags: db.settings.misc.ephemeral ? MessageFlags.Ephemeral : undefined,
    },
  });
}
