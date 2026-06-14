import { Response } from "express";
import { Octokit } from "@octokit/rest";
import {
  InteractionResponseType,
  MessageFlags,
  ComponentType,
  ButtonStyle,
} from "discord-api-types/v10";
import { octoErrResponse, CreateIssueEmbed, DiscordTimestamp, emitAction } from "@utils";
import type { DBUser } from "@database/interfaces/user.js";

export default async function Create(
  res: Response,
  [db, octo]: [DBUser, Octokit],
  options: Map<string, unknown>
): Promise<void> {
  const owner = options.get("owner") as string;
  const repo = options.get("repo") as string;
  const title = options.get("title") as string;
  const body = options.get("body") as string | undefined;
  const labelsRaw = options.get("labels") as string | undefined;
  const assigneesRaw = options.get("assignees") as string | undefined;
  const milestone = options.get("milestone") as number | undefined;

  // Per-repo customisers
  const cfg = db.settings.issues.find(
    (i) =>
      i.owner.toLowerCase() === owner.toLowerCase() && i.repo.toLowerCase() === repo.toLowerCase()
  );

  const assigneeSet = new Set<string>([
    ...(cfg?.auto_assignees ?? []),
    ...(assigneesRaw
      ?.split(",")
      .map((a) => a.trim())
      .filter(Boolean) ?? []),
  ]);

  const req = await octo.issues
    .create({
      owner,
      repo,
      title,
      body,
      assignees: [...assigneeSet],
      milestone,
      labels: labelsRaw
        ?.split(",")
        .map((l) => l.trim())
        .filter(Boolean),
    })
    .catch((e) => {
      octoErrResponse(res, e);
      return null;
    });

  if (!req) return;

  void emitAction(db.discord.id);

  // Auto-add to GitHub ProjectV2
  let projectNote = "";
  if (cfg?.auto_project) {
    const added = await octo
      .graphql(
        `mutation($projectId: ID!, $issueId: ID!) {
          addProjectV2ItemById(input: { contentId: $issueId, projectId: $projectId }) {
            item { id }
          }
        }`,
        { projectId: cfg.auto_project, issueId: data.node_id }
      )
      .catch(() => null);
    projectNote = added ? "Added to project.\n" : "*Could not add to project.*\n";
  }

  const isSimple = db.settings.misc.simple;

  res.json({
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      content: isSimple
        ? `Issue #${data.number} created: [${data.title}](<${data.html_url}>)\n${projectNote}`
        : `[\`${data.user?.login}\`](<${data.user?.html_url}>) opened this issue ${DiscordTimestamp(data.created_at, "R")}\n${projectNote}`,
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
