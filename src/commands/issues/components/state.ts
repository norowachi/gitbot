import { Response } from "express";
import { Octokit } from "@octokit/rest";
import { InteractionResponseType, MessageFlags } from "discord-api-types/v10";
import { octoErrResponse, CreateIssueEmbed, emitAction } from "@utils";
import type { DBUser } from "@database/interfaces/user.js";

export async function Close(
  res: Response,
  [db, octo]: [DBUser, Octokit],
  options: Map<string, unknown>
): Promise<void> {
  const owner = options.get("owner") as string;
  const repo = options.get("repo") as string;
  const issue_number = options.get("issue_number") as number;
  const reason = (options.get("reason") as string | undefined) ?? null;

  const req = await octo.issues
    .update({ owner, repo, issue_number, state: "closed", state_reason: reason as any })
    .catch((e) => {
      octoErrResponse(res, e);
      return null;
    });

  if (!req) return;

  void emitAction(db.discord.id);
  const data = req.data;
  const isSimple = db.settings.misc.simple;

  res.json({
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      content: isSimple
        ? `Issue #${data.number} closed: [${data.title}](<${data.html_url}>)`
        : `## Closed`,
      embeds: isSimple ? undefined : [CreateIssueEmbed(data)],
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
  const issue_number = options.get("issue_number") as number;

  const req = await octo.issues.update({ owner, repo, issue_number, state: "open" }).catch((e) => {
    octoErrResponse(res, e);
    return null;
  });

  if (!req) return;

  void emitAction(db.discord.id);
  const data = req.data;
  const isSimple = db.settings.misc.simple;

  res.json({
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      content: isSimple
        ? `Issue #${data.number} reopened: [${data.title}](<${data.html_url}>)`
        : `## Reopened`,
      embeds: isSimple ? undefined : [CreateIssueEmbed(data)],
      flags: db.settings.misc.ephemeral ? MessageFlags.Ephemeral : undefined,
    },
  });
}
