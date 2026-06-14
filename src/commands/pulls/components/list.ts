import { Response } from "express";
import { Octokit } from "@octokit/rest";
import { InteractionResponseType, MessageFlags } from "discord-api-types/v10";
import {
  octoErrResponse,
  CreatePREmbed,
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

  const req = await octo.pulls.list({ owner, repo, state, per_page: 100 }).catch((e) => {
    octoErrResponse(res, e);
    return null;
  });

  if (!req) return;

  const prs = req.data;

  if (!prs.length) {
    res.json({
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        content: `No ${state === "all" ? "" : state + " "}pull requests found for \`${owner}/${repo}\`.`,
        flags: MessageFlags.Ephemeral,
      },
    });
    return;
  }

  const ephem = db.settings.misc.ephemeral ? MessageFlags.Ephemeral : undefined;

  if (db.settings.misc.simple) {
    const lines = prs.map((p) => `**#${p.number}** [${p.title}](<${p.html_url}>) — ${p.state}`);
    const header = `**Pull Requests for \`${owner}/${repo}\` (${state}, ${prs.length}):**`;
    const pages = paginateContent(lines, header, LIMITS.MESSAGE_CONTENT);
    await contentPager(res, pages, ephem);
    return;
  }

  await embedMaker(
    res,
    prs.map((p) => CreatePREmbed(p as any)),
    ephem
  );
}
