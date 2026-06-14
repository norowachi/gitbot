import {
  ApplicationCommandType,
  InteractionResponseType,
  MessageFlags,
} from "discord-api-types/v10";
import {
  CommandData,
  PullsOptions,
  handlePullNumberAutocomplete,
  handleIssueNumberAutocomplete,
  handleRepoAutocomplete,
  handleUserAutocomplete,
  handleBranchAutocomplete,
} from "@utils";
import Create from "./components/create.js";
import Get from "./components/get.js";
import { Close, Reopen } from "./components/state.js";
import Merge from "./components/merge.js";
import List from "./components/list.js";
import Comment from "./components/comment.js";
import RequestReview from "./components/request_review.js";
import type { DBUser } from "@database/interfaces/user.js";
import type { Octokit } from "@octokit/rest";

function autocompleteChoices<T>(items: T[]) {
  return {
    type: InteractionResponseType.ApplicationCommandAutocompleteResult,
    data: { choices: items.map((v) => ({ name: String(v), value: v })) },
  };
}

export default {
  name: "pulls",
  description: "Manage GitHub pull requests",
  type: ApplicationCommandType.ChatInput,
  contexts: [0, 1, 2],
  integration_types: [0, 1],
  options: PullsOptions,

  autocomplete: async (res, focused, [db, octo], options) => {
    const owner = options?.get("owner") as string | undefined;
    const repo = options?.get("repo") as string | undefined;
    const isOwner = owner ? db.github.login === owner : false;

    switch (focused) {
      case "owner":
        return res.json(autocompleteChoices(await handleUserAutocomplete(db.github.login, owner)));

      case "repo":
        if (!owner) return;
        return res.json(
          autocompleteChoices(await handleRepoAutocomplete(octo, owner, isOwner, repo))
        );

      case "pull_number":
        if (!owner || !repo) return;
        return res.json(
          autocompleteChoices(
            await handlePullNumberAutocomplete(
              octo,
              owner,
              repo,
              isOwner,
              options?.get("pull_number") as string | undefined
            )
          )
        );

      case "issue":
        if (!owner || !repo) return;
        return res.json(
          autocompleteChoices(
            await handleIssueNumberAutocomplete(
              octo,
              owner,
              repo,
              isOwner,
              options?.get("issue") as string | undefined
            )
          )
        );

      case "head":
      case "base":
        if (!owner || !repo) return;
        return res.json(
          autocompleteChoices(
            await handleBranchAutocomplete(
              octo,
              owner,
              repo,
              options?.get(focused) as string | undefined
            )
          )
        );

      case "reviewer":
        return res.json(
          autocompleteChoices(
            await handleUserAutocomplete(
              db.github.login,
              options?.get("reviewer") as string | undefined
            )
          )
        );

      default:
        return;
    }
  },

  run: async (res, gh, sub, options) => {
    const [db, octo] = gh as [DBUser, Octokit];

    switch (sub?.[0]) {
      case "create":
        return Create(res, [db, octo], options!);
      case "get":
        return Get(res, [db, octo], options!);
      case "list":
        return List(res, [db, octo], options!);
      case "merge":
        return Merge(res, [db, octo], options!);
      case "close":
        return Close(res, [db, octo], options!);
      case "reopen":
        return Reopen(res, [db, octo], options!);
      case "comment":
        return Comment(res, [db, octo], options!);
      case "request_review":
        return RequestReview(res, [db, octo], options!);
      case "update":
        return res.json({
          type: InteractionResponseType.ChannelMessageWithSource,
          data: {
            content: `Edit this PR on GitHub:\nhttps://github.com/${options?.get("owner")}/${options?.get("repo")}/pull/${options?.get("pull_number")}`,
            flags: db.settings.misc.ephemeral ? MessageFlags.Ephemeral : undefined,
          },
        });
      default:
        return res.json({
          type: InteractionResponseType.ChannelMessageWithSource,
          data: { content: "Unknown subcommand.", flags: MessageFlags.Ephemeral },
        });
    }
  },
} as CommandData<true>;
