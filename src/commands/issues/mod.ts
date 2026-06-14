import {
  ApplicationCommandType,
  InteractionResponseType,
  MessageFlags,
} from "discord-api-types/v10";
import {
  CommandData,
  IssueOptions,
  handleIssueNumberAutocomplete,
  handleLabelAutocomplete,
  handleRepoAutocomplete,
  handleUserAutocomplete,
} from "@utils";
import Create from "./components/create.js";
import Get from "./components/get.js";
import { Close, Reopen } from "./components/state.js";
import Comment from "./components/comment.js";
import List from "./components/list.js";

// Shared autocomplete helper
function autocompleteChoices<T>(items: T[]) {
  return {
    type: InteractionResponseType.ApplicationCommandAutocompleteResult,
    data: { choices: items.map((v) => ({ name: String(v), value: v })) },
  };
}

export default {
  name: "issues",
  description: "Manage GitHub issues",
  type: ApplicationCommandType.ChatInput,
  contexts: [0, 1, 2],
  integration_types: [0, 1],
  options: IssueOptions,

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

      case "issue_number":
        if (!owner || !repo) return;
        return res.json(
          autocompleteChoices(
            await handleIssueNumberAutocomplete(
              octo,
              owner,
              repo,
              isOwner,
              options?.get("issue_number") as string | undefined
            )
          )
        );

      case "labels":
        if (!owner || !repo) return;
        return res.json({
          type: InteractionResponseType.ApplicationCommandAutocompleteResult,
          data: {
            choices: await handleLabelAutocomplete(
              octo,
              owner,
              repo,
              isOwner,
              options?.get("labels") as string | undefined
            ),
          },
        });

      default:
        return;
    }
  },

  run: async (res, gh, sub, options) => {
    const [db, octo] = gh as [
      import("@database/interfaces/user.js").DBUser,
      import("@octokit/rest").Octokit,
    ];

    switch (sub?.[0]) {
      case "create":
        return Create(res, [db, octo], options!);
      case "get":
        return Get(res, [db, octo], options!);
      case "list":
        return List(res, [db, octo], options!);
      case "close":
        return Close(res, [db, octo], options!);
      case "reopen":
        return Reopen(res, [db, octo], options!);
      case "comment":
        return Comment(res, [db, octo], options!);
      case "update":
        return res.json({
          type: InteractionResponseType.ChannelMessageWithSource,
          data: {
            content: `Edit this issue on GitHub:\nhttps://github.com/${options?.get("owner")}/${options?.get("repo")}/issues/${options?.get("issue_number")}`,
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
