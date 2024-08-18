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
import Close from "./components/close.js";

export default {
	name: "issues",
	description: "Manage issues",
	type: ApplicationCommandType.ChatInput,
	contexts: [0, 1, 2],
	integration_types: [0, 1],
	options: IssueOptions,
	autocomplete: async (res, focused, [db, octo], options) => {
		const owner = options?.get("owner");
		const repo = options?.get("repo");
		const issue_number = options?.get("issue_number");
		// switch the focused option
		switch (focused) {
			case "owner": {
				const array = await handleUserAutocomplete(
					db.github.login,
					owner
				);
				return res.json({
					type: InteractionResponseType.ApplicationCommandAutocompleteResult,
					data: {
						choices:
							array.map((user) => ({
								name: user,
								value: user,
							})) || [],
					},
				});
			}
			case "repo": {
				// requirements
				if (!owner) return;
				// get repos filtered
				const array = await handleRepoAutocomplete(
					octo,
					owner,
					db.github.login === owner,
					repo
				);
				// return the autocomplete array
				return res.json({
					type: InteractionResponseType.ApplicationCommandAutocompleteResult,
					data: {
						choices:
							array?.map((repo) => ({
								name: repo,
								value: repo,
							})) || [],
					},
				});
			}
			case "issue_number": {
				// requirements
				if (!owner || !repo) return;

				// get issue numbers filtered
				const array = await handleIssueNumberAutocomplete(
					octo,
					owner,
					repo,
					db.github.login === owner,
					issue_number
				);
				// return the autocomplete array
				return res.json({
					type: InteractionResponseType.ApplicationCommandAutocompleteResult,
					data: {
						choices:
							array?.map((prn) => ({
								name: prn.toString(),
								value: prn,
							})) || [],
					},
				});
			}
			case "labels": {
				// requirements
				if (!owner || !repo) return;

				// get labels filtered, but this one is already in a ready-to-use array
				const array = await handleLabelAutocomplete(
					octo,
					owner,
					repo,
					db.github.login === owner,
					options?.get("labels")
				);
				// return the autocomplete array
				return res.json({
					type: InteractionResponseType.ApplicationCommandAutocompleteResult,
					data: {
						choices: array || [],
					},
				});
			}
			default:
				return;
		}
	},
	run: async (res, gh, sub, options) => {
		switch (sub![0]) {
			case "create":
				await Create(res, gh, options!);
				return;
			case "update":
				res.json({
					type: InteractionResponseType.ChannelMessageWithSource,
					data: {
						content: `https://github.com/${options?.get(
							"owner"
						)}/${options?.get("repo")}/issues/${options?.get(
							"issue_number"
						)}`,
						flags: gh[0].settings.misc.ephemeral
							? MessageFlags.Ephemeral
							: undefined,
					},
				});
				return;
			case "get":
				await Get(res, gh, options!);
				return;
			case "close":
				await Close(res, gh, options!);
				return;
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
