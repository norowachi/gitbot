import {
	APIApplicationCommandOption,
	ApplicationCommandOptionType,
} from "discord-api-types/v10";
import { RequiredOptions } from "@utils";

/**
 * Issues Command options
 */
export const IssueOptions: APIApplicationCommandOption[] = [
	{
		name: "create",
		description: "Create a new issue",
		type: ApplicationCommandOptionType.Subcommand,
		options: [
			RequiredOptions.owner,
			RequiredOptions.repo,
			{
				name: "title",
				description: "The title of the issue",
				type: ApplicationCommandOptionType.String,
				required: true,
			},
			{
				name: "body",
				description: "The contents of the issue",
				type: ApplicationCommandOptionType.String,
			},
			{
				name: "labels",
				description: "An array of label names",
				type: ApplicationCommandOptionType.String,
				required: false,
				autocomplete: true,
			},
			{
				name: "assignees",
				description: "An array of user names",
				type: ApplicationCommandOptionType.String,
				required: false,
				autocomplete: true,
			},
		],
	},
	{
		name: "get",
		description: "Lists details of an issue by providing its number.",
		type: ApplicationCommandOptionType.Subcommand,
		options: [
			RequiredOptions.owner,
			RequiredOptions.repo,
			RequiredOptions.issue_number,
		],
	},
	{
		name: "update",
		description: "Update an issue",
		type: ApplicationCommandOptionType.Subcommand,
		options: [
			RequiredOptions.owner,
			RequiredOptions.repo,
			RequiredOptions.issue_number,
		],
	},
	{
		name: "close",
		description: "Close an issue",
		type: ApplicationCommandOptionType.Subcommand,
		options: [
			RequiredOptions.owner,
			RequiredOptions.repo,
			RequiredOptions.issue_number,
			{
				name: "reason",
				description: "The reason for closing the issue",
				type: ApplicationCommandOptionType.String,
				choices: [
					{
						name: "Completed",
						value: "completed",
					},
					{
						name: "Not Planned",
						value: "not_planned",
					},
				],
			},
		],
	},
];
