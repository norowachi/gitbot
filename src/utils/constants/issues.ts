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
			//TODO: add the options
		],
	},
	{
		name: "get",
		description: "Lists details of an issue by providing its number.",
		type: ApplicationCommandOptionType.Subcommand,
		options: [
			RequiredOptions.owner,
			RequiredOptions.repo,
			//TODO: RequiredOptions.issue_number
		],
	},
	{
		name: "update",
		description: "Update an issue",
		type: ApplicationCommandOptionType.Subcommand,
		options: [
			RequiredOptions.owner,
			RequiredOptions.repo,
			//TODO: RequiredOptions.issue_number
		],
	},
	{
		name: "close",
		description: "Close an issue",
		type: ApplicationCommandOptionType.Subcommand,
		options: [
			RequiredOptions.owner,
			RequiredOptions.repo,
			//TODO: RequiredOptions.issue_number
		],
	},
];
