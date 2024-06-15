import {
	ApplicationCommandType,
	ApplicationCommandOptionType,
	APIApplicationCommandOption,
	APIApplicationCommandSubcommandOption,
} from "discord-api-types/v10";
import { CommandData, runCommand } from "../../utils.js";
import { CommandConsts } from "../../constants.js";

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
			options: CommandConsts.Pulls.map(
				(option: APIApplicationCommandOption) => {
					return {
						name: option.name,
						description: option.description,
						type: option.type,
						required: option.required,
						options: (
							option as APIApplicationCommandSubcommandOption
						).options?.slice(1),
					};
				}
			),
		},
	],
	run: async (res, interaction, gh, sub: any[], options) => {
		return (await runCommand(sub?.at(0)!))(
			res,
			interaction,
			gh,
			sub?.slice(1),
			options?.set("owner", gh[0]!.github.login)
		);
	},
} as CommandData;
