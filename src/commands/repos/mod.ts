import {
	ApplicationCommandType,
	InteractionResponseType,
	MessageFlags,
} from "discord-api-types/v10";
import {
	CommandData,
	PullsOptions,
	handleRepoAutocomplete,
	handleUserAutocomplete,
} from "@utils";

export default {
	name: "repos",
	description: "Manage repositories",
	type: ApplicationCommandType.ChatInput,
	contexts: [0, 1, 2],
	integration_types: [0, 1],
	options: [{
		name: "list",
		description: "List all repositories",
		type: 1,
	}],
	autocomplete: async (res, focused, gh, options) => {
		const owner = options?.get("owner");
		const repo = options?.get("repo");
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
			default:
				return;
		}
	},
	run: async (res, rest, gh, sub, options) => {
		switch (sub![0]) {
			// list repositories
			case "list": {
				// get repositories
				const repositories = await gh[1].repos.listForAuthenticatedUser();
				// send the message
				return res.json({
					type: InteractionResponseType.ChannelMessageWithSource,
					data: {
						content: `You have ${repositories.data.length} repositories`,
						//TODO: make optional
						//flags: MessageFlags.Ephemeral,
					},
				});
			}
			default:
				return res.json({
					type: InteractionResponseType.ChannelMessageWithSource,
					data: {
						content: "Invalid SubCommand",
						flags: MessageFlags.Ephemeral,
					},
				});
		}
	},
} as CommandData<true>;
