import { APIApplicationCommandOption, ApplicationCommandOptionType } from "discord-api-types/v10";
import { SharedOptions } from "./main.js";

export const PullsOptions: APIApplicationCommandOption[] = [
  {
    name: "create",
    description: "Create a new pull request",
    type: ApplicationCommandOptionType.Subcommand,
    options: [
      SharedOptions.owner,
      SharedOptions.repo,
      {
        name: "head",
        description: "Branch containing your changes (e.g. feature/my-fix)",
        type: ApplicationCommandOptionType.String,
        required: true,
        autocomplete: true,
      },
      {
        name: "base",
        description: "Branch to merge into (e.g. main)",
        type: ApplicationCommandOptionType.String,
        required: true,
        autocomplete: true,
      },
      {
        name: "title",
        description: "PR title (required unless linking an issue)",
        type: ApplicationCommandOptionType.String,
        required: false,
      },
      {
        name: "issue",
        description: "Issue number to convert to a PR (required unless title is given)",
        type: ApplicationCommandOptionType.Integer,
        required: false,
        autocomplete: true,
      },
      {
        name: "body",
        description: "PR description",
        type: ApplicationCommandOptionType.String,
        required: false,
      },
      {
        name: "draft",
        description: "Open as a draft PR (default: false)",
        type: ApplicationCommandOptionType.Boolean,
        required: false,
      },
      {
        name: "maintainer_can_modify",
        description: "Allow maintainers to push to the head branch (default: true)",
        type: ApplicationCommandOptionType.Boolean,
        required: false,
      },
      {
        name: "head_repo",
        description: "Fork repo name if the head branch lives in a fork",
        type: ApplicationCommandOptionType.String,
        required: false,
      },
    ],
  },
  {
    name: "get",
    description: "Show details of a pull request",
    type: ApplicationCommandOptionType.Subcommand,
    options: [SharedOptions.owner, SharedOptions.repo, SharedOptions.pull_number],
  },
  {
    name: "update",
    description: "Open the pull request on GitHub to edit it",
    type: ApplicationCommandOptionType.Subcommand,
    options: [SharedOptions.owner, SharedOptions.repo, SharedOptions.pull_number],
  },
  {
    name: "merge",
    description: "Merge a pull request",
    type: ApplicationCommandOptionType.Subcommand,
    options: [
      SharedOptions.owner,
      SharedOptions.repo,
      SharedOptions.pull_number,
      {
        name: "merge_method",
        description: "Merge strategy (default: merge)",
        type: ApplicationCommandOptionType.String,
        required: false,
        choices: [
          { name: "Merge commit", value: "merge" },
          { name: "Squash and merge", value: "squash" },
          { name: "Rebase and merge", value: "rebase" },
        ],
      },
      {
        name: "commit_title",
        description: "Title for the merge commit (merge/squash only)",
        type: ApplicationCommandOptionType.String,
        required: false,
      },
      {
        name: "commit_message",
        description: "Extra detail appended to the merge commit message",
        type: ApplicationCommandOptionType.String,
        required: false,
      },
    ],
  },
  {
    name: "close",
    description: "Close a pull request without merging",
    type: ApplicationCommandOptionType.Subcommand,
    options: [SharedOptions.owner, SharedOptions.repo, SharedOptions.pull_number],
  },
  {
    name: "reopen",
    description: "Reopen a closed pull request",
    type: ApplicationCommandOptionType.Subcommand,
    options: [SharedOptions.owner, SharedOptions.repo, SharedOptions.pull_number],
  },
  {
    name: "list",
    description: "List pull requests for a repository",
    type: ApplicationCommandOptionType.Subcommand,
    options: [
      SharedOptions.owner,
      SharedOptions.repo,
      {
        name: "state",
        description: "Filter by state (default: open)",
        type: ApplicationCommandOptionType.String,
        required: false,
        choices: [
          { name: "Open", value: "open" },
          { name: "Closed", value: "closed" },
          { name: "All", value: "all" },
        ],
      },
    ],
  },
  {
    name: "comment",
    description: "Add a review comment to a pull request",
    type: ApplicationCommandOptionType.Subcommand,
    options: [
      SharedOptions.owner,
      SharedOptions.repo,
      SharedOptions.pull_number,
      {
        name: "body",
        description: "Comment body",
        type: ApplicationCommandOptionType.String,
        required: true,
      },
    ],
  },
  {
    name: "request_review",
    description: "Request a review from a GitHub user",
    type: ApplicationCommandOptionType.Subcommand,
    options: [
      SharedOptions.owner,
      SharedOptions.repo,
      SharedOptions.pull_number,
      {
        name: "reviewer",
        description: "GitHub username to request a review from",
        type: ApplicationCommandOptionType.String,
        required: true,
        autocomplete: true,
      },
    ],
  },
];
