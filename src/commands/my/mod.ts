import {
	ApplicationCommandType,
	ApplicationCommandOptionType,
	APIApplicationCommandOption,
	APIApplicationCommandSubcommandOption,
} from "discord-api-types/v10";
import {
	CommandData,
	runCommand,
	runCommandAutoComplete,
	IssueOptions,
	PullsOptions,
} from "@utils";

export default {
	name: "my",
	description: "Manage everything about you",
	type: ApplicationCommandType.ChatInput,
	contexts: [0, 1, 2],
	integration_types: [0, 1],
	options: [
		{
			name: "pulls",
			description: "Manage your pull requests",
			type: ApplicationCommandOptionType.SubcommandGroup,
			options: PullsOptions.map((option: APIApplicationCommandOption) => {
				return {
					name: option.name,
					description: option.description,
					type: option.type,
					required: option.required,
					options: (
						option as APIApplicationCommandSubcommandOption
					).options?.slice(1),
				};
			}),
		},
		{
			name: "issues",
			description: "Manage your issues",
			type: ApplicationCommandOptionType.SubcommandGroup,
			options: IssueOptions.map((option: APIApplicationCommandOption) => {
				return {
					name: option.name,
					description: option.description,
					type: option.type,
					required: option.required,
					options: (
						option as APIApplicationCommandSubcommandOption
					).options?.slice(1),
				};
			}),
		},
	],
	autocomplete: async (res, focused, gh, options) => {
		return (
			await runCommandAutoComplete(res.req.body.data.options?.at(0)?.name!)
		)(
			res,
			focused,
			gh,
			options?.set("owner", gh[0].github.login)
		);
	},
	run: async (res, gh, sub: any[], options) => {
		return (await runCommand(sub?.at(0)!))(
			res,
			gh,
			sub?.slice(1),
			options?.set("owner", gh[0].github.login)
		);
	},
} as CommandData<true>;
