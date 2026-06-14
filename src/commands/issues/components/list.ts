import { Response } from "express";
import { Octokit } from "@octokit/rest";
import { InteractionResponseType, MessageFlags } from "discord-api-types/v10";
import {
  octoErrResponse,
  CreateIssueEmbed,
  embedMaker,
  paginateContent,
  contentPager,
  LIMITS,
} from "@utils";
import type { DBUser } from "@database/interfaces/user.js";

export default async function List(
  res: Response,
  [db, octo]: [DBUser, Octokit],
  options: Map<string, unknown>
): Promise<void> {
  const owner = options.get("owner") as string;
  const repo = options.get("repo") as string;
  const state = (options.get("state") as "open" | "closed" | "all" | undefined) ?? "open";

  const req = await octo.issues.listForRepo({ owner, repo, state, per_page: 100 }).catch((e) => {
    octoErrResponse(res, e);
    return null;
  });

  if (!req) return;

  // GitHub's issues endpoint includes PRs — filter them
  const issues = req.data.filter((i) => !i.pull_request);

  if (!issues.length) {
    res.json({
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        content: `No ${state === "all" ? "" : state + " "}issues found for \`${owner}/${repo}\`.`,
        flags: MessageFlags.Ephemeral,
      },
    });
    return;
  }

  const ephem = db.settings.misc.ephemeral ? MessageFlags.Ephemeral : undefined;

  if (db.settings.misc.simple) {
    const lines = issues.map((i) => `**#${i.number}** [${i.title}](<${i.html_url}>) — ${i.state}`);
    const header = `**Issues for \`${owner}/${repo}\` (${state}, ${issues.length}):**`;
    const pages = paginateContent(lines, header, LIMITS.MESSAGE_CONTENT);
    await contentPager(res, pages, ephem);
    return;
  }

  await embedMaker(
    res,
    issues.map((i) => CreateIssueEmbed(i as any)),
    ephem
  );
}
