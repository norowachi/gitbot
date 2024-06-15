import {
	APIEmbed,
	APIInteraction,
	APIMessageComponentButtonInteraction,
	ApplicationCommandType,
	ButtonStyle,
	ComponentType,
	InteractionResponseType,
	MessageFlags,
} from "discord-api-types/v10";
import { CommandData, IntEmitter, OctoErrMsg } from "../../utils.js";
import { CommandConsts } from "../../constants.js";
import { Octokit, RequestError } from "octokit";
import { Response } from "express";
import { updateModal } from "./components/updateModal.js";

export default {
	name: "pulls",
	description: "Manage pull requests",
	type: ApplicationCommandType.ChatInput,
	contexts: [0, 1, 2],
	integration_types: [0, 1],
	options: CommandConsts.Pulls,
	run: async (res, interaction, gh, sub, options) => {
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
		switch (sub![0]) {
			case "create":
				await Create(res, gh[1]!, options!);
		}
	},
} as CommandData;

async function Create(
	res: Response,
	octokit: Octokit,
	options: Map<string, any>
) {
	// saved date and customId constants
	const date = Date.now().toString();
	const updateModalBtn = `umbtn-${date}`;

	/** owner of the repo
	 * ! REQUIRED
	 */
	const owner = options.get("owner");
	/** name of the repo
	 * ! REQUIRED
	 */
	const repo = options.get("repo");
	/** title of the pr
	 * ? REQUIRED if @param issue is not specified
	 */
	const title = options.get("title");
	/** name of branch where changed are implemented
	 * ! REQUIRED
	 */
	const head = options.get("head");
	/** name of the repo where the changes are implemented */
	const head_repo = options.get("head_repo");
	/**
	 * name of branch you want changed pulled into, on current repo
	 * ! REQUIRED
	 */
	const base = options.get("base");
	/** content of the pr */
	const body = options.get("body");
	/** whether maintainers can modify or not */
	const maintainer_can_modify = options.get("maintainer_can_modify");
	/** whether to mark pr as draft or not */
	const draft = options.get("draft");
	/** issue number to link to the pr
	 * ? REQUIRED unless @param title is specified
	 */
	const issue = options.get("issue");

	// if neither title nor issue is specified
	if (!title && !issue)
		return res.json({
			type: InteractionResponseType.ChannelMessageWithSource,
			data: {
				content: "You have to specify either `issue` or `title`",
				flags: MessageFlags.Ephemeral,
			},
		});

	// create req
	const req = await octokit.rest.pulls
		.create({
			owner,
			repo,
			title,
			head,
			head_repo,
			base,
			body,
			maintainer_can_modify,
			draft,
			issue,
		})
		// catch error
		.catch((e: RequestError) => {
			res.json({
				type: InteractionResponseType.ChannelMessageWithSource,
				data: {
					content: OctoErrMsg(e),
					flags: MessageFlags.Ephemeral,
				},
			});
			return;
		});

	// if error
	if (!req) return;

	// for buttons
	options.set("pull_number", req.data.number);

	// make a var for easier access
	const data = req.data;
	// create the embed
	const embed: APIEmbed = {
		title: `${data.title} #${data.number}`,
		author: {
			name: `${data.user.login} (${data.author_association})`,
			icon_url: data.user.avatar_url,
			url: data.user.html_url,
		},
		url: data.html_url,
		description:
			data.body && data.body.length > 3900
				? data.body.slice(1, 3900) + `[**...**](${data.html_url})`
				: data.body || "No Description",
		fields: [
			{
				name: "Additions/Deletions",
				value: [
					"```diff",
					"+ " + data.additions,
					"- " + data.deletions,
					"```",
					`with changes in [${data.changed_files} file(s)](${data.html_url}/files)`,
					`and [${data.commits} commits](${data.html_url}/files)`,
				].join("\n"),
				inline: true,
			},
			{
				name: "Labels",
				value:
					data.labels.length > 0
						? data.labels.map((l) => "`" + l.name + "`").join(", ")
						: "No Labels",
				inline: true,
			},
			{
				name: "Misc",
				value: [
					`**Created at**: <t:${Math.floor(
						new Date(data.created_at).getTime() / 1000
					)}:f>`,
					`**Draft**: ${data.draft}`,
					`**Maintainer Can Modify**: ${data.maintainer_can_modify}`,
					data.mergeable
						? `**Mergeable**: ${data.mergeable}, **Mergable State**: ${data.mergeable_state}\n**Merge Commit SHA**: ${data.merge_commit_sha}`
						: `**Merged**: ${data.merged}${
								data.merged
									? `, By [\`${data.merged_by?.login}\`](${data.merged_by?.html_url}), At ${data.merged_at}`
									: ""
						  }`,
					`**State**: ${data.state}, **Locked**: ${data.locked}${
						data.locked && data.active_lock_reason
							? ", **Reason**:" + data.active_lock_reason
							: ""
					}`,
				].join("\n"),
				inline: true,
			},
		],
	};

	// unshift order is opposite
	// adds to first of the array
	// so last element wanted to be added, is added first

	// if there's assignees
	if (data.assignees && data.assignees.length > 0) {
		embed.fields?.unshift({
			name: "Assignees",
			value: data.assignees
				.map((as) => `[\`${as.login}\`](${as.html_url})`)
				.join(", "),
		});
	}

	//if there's any reviewers
	if (data.requested_reviewers && data.requested_reviewers?.length) {
		embed.fields?.unshift({
			name: "Requested Reviewers",
			value: data.requested_reviewers
				.map((as) => `[\`${as.login}\`](${as.html_url})`)
				.join(", "),
		});
	}

	// handle button clicks
	// modal update click
	IntEmitter.on(updateModalBtn, async (...args) => {
		await updateModal(octokit, args[0], options);
		IntEmitter.removeAllListeners(updateModalBtn);
		return;
	});

	// button components to be added
	const components = [
		{
			type: ComponentType.ActionRow,
			components: [
				{
					type: ComponentType.Button,
					style: ButtonStyle.Primary,
					label: "Update",
					custom_id: updateModalBtn,
				},
			],
		},
	];

	// return the response
	return res.json({
		type: InteractionResponseType.ChannelMessageWithSource,
		data: {
			content: `[\`${data.user.login}\`](${data.user.html_url}) wants to merge ${data.commits} commits into [\`${data.base.label}\`](${data.base.repo.html_url}) from [\`${data.head.label}\`](${data.head.repo?.html_url})`,
			embeds: [embed],
			components: components,
			flags: MessageFlags.Ephemeral,
		},
	});
}

/*

		// gh[1]?.rest.pulls.checkIfMerged;
		// gh[1]?.rest.pulls.create;
		
		gh[1]?.rest.pulls.createReplyForReviewComment;
		gh[1]?.rest.pulls.createReview;
		gh[1]?.rest.pulls.createReviewComment;
		gh[1]?.rest.pulls.deletePendingReview;
		gh[1]?.rest.pulls.deleteReviewComment;
		gh[1]?.rest.pulls.dismissReview;

		// show "is merged" option
		gh[1]?.rest.pulls.get;
		// make button for that if its not in the get payload
		// gh[1]?.rest.pulls.getReview;
		// gh[1]?.rest.pulls.getReviewComment;
		// gh[1]?.rest.pulls.listCommits;
		// gh[1]?.rest.pulls.listFiles;
		// gh[1]?.rest.pulls.listRequestedReviewers;
		//

		gh[1]?.rest.pulls.list;

		gh[1]?.rest.pulls.listCommentsForReview;
		gh[1]?.rest.pulls.listReviewComments;
		gh[1]?.rest.pulls.listReviewCommentsForRepo;
		gh[1]?.rest.pulls.listReviews;

		gh[1]?.rest.pulls.merge;

		gh[1]?.rest.pulls.removeRequestedReviewers;
		gh[1]?.rest.pulls.requestReviewers;
		gh[1]?.rest.pulls.submitReview;

		gh[1]?.rest.pulls.update;
		gh[1]?.rest.pulls.updateBranch;
		gh[1]?.rest.pulls.updateReview;
		gh[1]?.rest.pulls.updateReviewComment;
*/
