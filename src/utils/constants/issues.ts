import { APIApplicationCommandOption, ApplicationCommandOptionType } from "discord-api-types/v10";
import { SharedOptions } from "./main.js";

export const IssueOptions: APIApplicationCommandOption[] = [
  {
    name: "create",
    description: "Create a new issue",
    type: ApplicationCommandOptionType.Subcommand,
    options: [
      SharedOptions.owner,
      SharedOptions.repo,
      {
        name: "title",
        description: "Issue title",
        type: ApplicationCommandOptionType.String,
        required: true,
      },
      {
        name: "body",
        description: "Issue body / description",
        type: ApplicationCommandOptionType.String,
        required: false,
      },
      {
        name: "labels",
        description: "Comma-separated label names",
        type: ApplicationCommandOptionType.String,
        required: false,
        autocomplete: true,
      },
      {
        name: "assignees",
        description: "Comma-separated GitHub usernames to assign",
        type: ApplicationCommandOptionType.String,
        required: false,
        autocomplete: true,
      },
      {
        name: "milestone",
        description: "Milestone number to associate",
        type: ApplicationCommandOptionType.Integer,
        required: false,
      },
    ],
  },
  {
    name: "get",
    description: "Show details of an issue",
    type: ApplicationCommandOptionType.Subcommand,
    options: [SharedOptions.owner, SharedOptions.repo, SharedOptions.issue_number],
  },
  {
    name: "update",
    description: "Open the issue on GitHub to edit it",
    type: ApplicationCommandOptionType.Subcommand,
    options: [SharedOptions.owner, SharedOptions.repo, SharedOptions.issue_number],
  },
  {
    name: "reopen",
    description: "Reopen a closed issue",
    type: ApplicationCommandOptionType.Subcommand,
    options: [SharedOptions.owner, SharedOptions.repo, SharedOptions.issue_number],
  },
  {
    name: "close",
    description: "Close an issue",
    type: ApplicationCommandOptionType.Subcommand,
    options: [
      SharedOptions.owner,
      SharedOptions.repo,
      SharedOptions.issue_number,
      {
        name: "reason",
        description: "Reason for closing",
        type: ApplicationCommandOptionType.String,
        required: false,
        choices: [
          { name: "Completed", value: "completed" },
          { name: "Not Planned", value: "not_planned" },
        ],
      },
    ],
  },
  {
    name: "comment",
    description: "Add a comment to an issue",
    type: ApplicationCommandOptionType.Subcommand,
    options: [
      SharedOptions.owner,
      SharedOptions.repo,
      SharedOptions.issue_number,
      {
        name: "body",
        description: "Comment body",
        type: ApplicationCommandOptionType.String,
        required: true,
      },
    ],
  },
  {
    name: "list",
    description: "List issues for a repository",
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
];
