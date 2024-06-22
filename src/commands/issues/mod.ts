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
import Update from "./components/update.js";
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
	autocomplete: async (res, focused, gh, options) => {
		const owner = options?.get("owner");
		const repo = options?.get("repo");
		const issue_number = options?.get("issue_number");
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
			case "issue_number": {
				// requirements
				if (!owner || !repo) return;

				// get issue numbers filtered
				const array = await handleIssueNumberAutocomplete(
					gh[1],
					owner,
					repo,
					gh[0]!.github.login === owner,
					issue_number
				);
				// return the autocomplete array
				return res.json({
					type: InteractionResponseType.ApplicationCommandAutocompleteResult,
					data: {
						choices: array?.map((prn) => ({
							name: prn.toString(),
							value: prn,
						})),
					},
				});
			}
			case "labels": {
				// requirements
				if (!owner || !repo) return;

				// get labels filtered, but this one is already in a ready-to-use array
				const array = await handleLabelAutocomplete(
					gh[1],
					owner,
					repo,
					gh[0]!.github.login === owner,
					options?.get("labels")
				);
				// return the autocomplete array
				return res.json({
					type: InteractionResponseType.ApplicationCommandAutocompleteResult,
					data: {
						choices: array?.choices,
					},
				});
			}
			default:
				return;
		}
	},
	run: async (res, rest, gh, sub, options) => {
		switch (sub![0]) {
			case "create":
				await Create(res, rest, gh[1]!, options!);
				return;
			case "update":
				await Update(res, gh[1]!, options!);
				return;
			case "get":
				await Get(res, rest, gh[1]!, options!);
				return;
			case "close":
				await Close(res, gh[1]!, options!);
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
} as CommandData;

// // gh[1]?.rest.pulls.checkIfMerged;
// // gh[1]?.rest.pulls.create;
// // button
// gh[1]?.rest.pulls.requestReviewers;
// gh[1]?.rest.pulls.update;

// //
// gh[1]?.rest.pulls.createReviewComment;
// gh[1]?.rest.pulls.deletePendingReview;
// gh[1]?.rest.pulls.deleteReviewComment;
// gh[1]?.rest.pulls.dismissReview;

// // show "is merged" option
// gh[1]?.rest.pulls.get;
// // make button for that if its not in the get payload
// gh[1]?.rest.pulls.getReview;
// gh[1]?.rest.pulls.getReviewComment;
// gh[1]?.rest.pulls.listCommits;
// gh[1]?.rest.pulls.listFiles;
// gh[1]?.rest.pulls.listRequestedReviewers;
// gh[1]?.rest.pulls.createReview;
// gh[1]?.rest.pulls.removeRequestedReviewers;
// gh[1]?.rest.pulls.requestReviewers;
// gh[1]?.rest.pulls.update;
// //

// gh[1]?.rest.pulls.list;
// // button
// gh[1]?.rest.pulls.createReview;
// gh[1]?.rest.pulls.removeRequestedReviewers;
// gh[1]?.rest.pulls.requestReviewers;
// gh[1]?.rest.pulls.update;
// //

// gh[1]?.rest.pulls.listCommentsForReview;
// gh[1]?.rest.pulls.listReviewComments;
// //button
// gh[1]?.rest.pulls.createReplyForReviewComment;
// //

// gh[1]?.rest.pulls.merge;

// gh[1]?.rest.pulls.submitReview;

// gh[1]?.rest.pulls.updateBranch;
// gh[1]?.rest.pulls.updateReview;
// gh[1]?.rest.pulls.updateReviewComment;
