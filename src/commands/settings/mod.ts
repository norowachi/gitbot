import {
	APIInteraction,
	ApplicationCommandOptionType,
	ApplicationCommandType,
	InteractionResponseType,
	MessageFlags,
} from "discord-api-types/v10";
import {
	CommandData,
	handleRepoAutocomplete,
	handleUserAutocomplete,
	RequiredOptions,
} from "@utils";

export default {
	name: "settings",
	description: "Manage Gitbot Settings",
	type: ApplicationCommandType.ChatInput,
	contexts: [0, 1, 2],
	integration_types: [0, 1],
	options: [
		{
			name: "ephermeral",
			description:
				"Whether the message should be ephermal or not (default: false)",
			type: ApplicationCommandOptionType.Boolean,
			required: false,
		},
		{
			name: "issues",
			description: "Manage issues settings",
			type: ApplicationCommandOptionType.Subcommand,
			required: false,
			options: [
				RequiredOptions.owner,
				RequiredOptions.repo,
				{
					name: "auto_project",
					description: "Automatically add the issue to a project",
					type: ApplicationCommandOptionType.String,
					required: false,
				},
			],
		},
	],
	autocomplete: async (res, focused, gh, options) => {
		const owner = options?.get("owner");
		const repo = options?.get("repo");
		const project = options?.get("auto_project");

		// switch the focused option
		switch (focused) {
			case "owner": {
				return res.json({
					type: InteractionResponseType.ApplicationCommandAutocompleteResult,
					data: {
						choices: (
							await handleUserAutocomplete(
								gh[0]!.github.login,
								options?.get("owner")
							)
						).map((user) => ({ name: user, value: user })),
					},
				});
			}
			case "repo": {
				// requirements
				if (!owner) return;
				// get repos filtered
				const array = await handleRepoAutocomplete(
					gh[1],
					owner,
					gh[0]!.github.login === owner,
					repo
				);
				// return the autocomplete array
				return res.json({
					type: InteractionResponseType.ApplicationCommandAutocompleteResult,
					data: {
						choices: array?.map((repo) => ({
							name: repo,
							value: repo,
						})),
					},
				});
			}
			case "auto_project": {
				// fetch projects
				const projects = await gh[1].projects.listForRepo({
					owner,
					repo,
				});
				// return the autocomplete array
				return res.json({
					type: InteractionResponseType.ApplicationCommandAutocompleteResult,
					data: {
						choices: projects.data.map((project) => ({
							name: project.name,
							value: project.id.toString(),
						})),
					},
				});
			}
			default:
				return;
		}
	},
	run: async (res, rest, gh, sub, options) => {
		const interaction = res.req.body as APIInteraction;
		const userId = interaction.member?.user.id || interaction.user?.id;

		if (!userId)
			return res.json({
				type: InteractionResponseType.ChannelMessageWithSource,
				data: {
					content: "An error occured while fetching your user id",
					flags: MessageFlags.Ephemeral,
				},
			});
		if (!sub || !sub[0]) {
			const ephemeral = options?.get("ephemeral");
			return res.json({
				type: InteractionResponseType.ChannelMessageWithSource,
				data: {
					content: "Please provide a subcommand",
					flags: MessageFlags.Ephemeral,
				},
			});
		}

		switch (sub[0]) {
			case "issues": {
			}
		}
	},
} as CommandData<true>;
