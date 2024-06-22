import {
	APIApplicationCommandOption,
	ApplicationCommandOptionType,
} from "discord-api-types/v10";
import { RequiredOptions } from "@utils";

/**
 * Pulls Command options
 */
export const PullsOptions: APIApplicationCommandOption[] = [
	{
		name: "create",
		description: "Create a new pull request",
		type: ApplicationCommandOptionType.Subcommand,
		options: [
			RequiredOptions.owner,
			RequiredOptions.repo,
			{
				name: "head",
				description:
					"The name of the branch where your changes are implemented.",
				type: ApplicationCommandOptionType.String,
				required: true,
			},
			{
				name: "base",
				description:
					"The name of the branch you want the changes pulled into on the current repository.",
				type: ApplicationCommandOptionType.String,
				required: true,
			},
			{
				name: "title",
				description:
					'The title of the new pull request. Required unless "issue" is specified.',
				type: ApplicationCommandOptionType.String,
			},
			{
				name: "head_repo",
				description:
					"The name of the repository where the changes in the pull request were made.",
				type: ApplicationCommandOptionType.String,
			},
			{
				name: "issue",
				description:
					'The issue number in this repository to turn into a PR. Required unless "title" is specified.',
				type: ApplicationCommandOptionType.Integer,
			},
			{
				name: "body",
				description: "The contents of the pull request.",
				type: ApplicationCommandOptionType.String,
			},
			{
				name: "draft",
				description: "Whether the pull request is a draft. Default is false.",
				type: ApplicationCommandOptionType.Boolean,
			},
			{
				name: "maintainer_can_modify",
				description:
					"Whether maintainers can modify the pull request. Default is true.",
				type: ApplicationCommandOptionType.Boolean,
			},
		],
	},
	{
		name: "get",
		description: "Lists details of a pull request by providing its number.",
		type: ApplicationCommandOptionType.Subcommand,
		options: [
			RequiredOptions.owner,
			RequiredOptions.repo,
			RequiredOptions.pull_number,
		],
	},
	{
		name: "update",
		description: "Merge a pull request",
		type: ApplicationCommandOptionType.Subcommand,
		options: [
			RequiredOptions.owner,
			RequiredOptions.repo,
			RequiredOptions.pull_number,
		],
	},
	//TODO: uncomment these when the command is finished
	// {
	// 	name: "merge",
	// 	description: "Merge a pull request",
	// 	type: ApplicationCommandOptionType.Subcommand,
	// 	options: [
	// 		RequiredOptions.owner,
	// 		RequiredOptions.repo,
	// 		RequiredOptions.pull_number,
	// 		{
	// 			name: "commit_title",
	// 			description: "Title for the commit message",
	// 			type: ApplicationCommandOptionType.String,
	// 		},
	// 		{
	// 			name: "commit_message",
	// 			description: "Extra detail to append to automatic commit message.",
	// 			type: ApplicationCommandOptionType.String,
	// 		},
	// 		{
	// 			name: "sha",
	// 			description: "SHA that pull request head must match to allow merge",
	// 			type: ApplicationCommandOptionType.String,
	// 		},
	// 		{
	// 			name: "merge_method",
	// 			description: "Merge method to use",
	// 			type: ApplicationCommandOptionType.String,
	// 			choices: [
	// 				{
	// 					name: "Merge",
	// 					value: "merge",
	// 				},
	// 				{
	// 					name: "Rebase",
	// 					value: "rebase",
	// 				},
	// 				{
	// 					name: "Squash",
	// 					value: "squash",
	// 				},
	// 			],
	// 		},
	// 	],
	// },
	{
		name: "close",
		description: "Close a pull request",
		type: ApplicationCommandOptionType.Subcommand,
		options: [
			RequiredOptions.owner,
			RequiredOptions.repo,
			RequiredOptions.pull_number,
		],
	},
];
