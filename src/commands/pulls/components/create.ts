import { Response } from "express";
import { Octokit } from "@octokit/rest";
import {
	InteractionResponseType,
	MessageFlags,
	ComponentType,
	ButtonStyle,
} from "discord-api-types/v10";
import { CreatePREmbed, OctoErrMsg } from "@utils";
import { DBUser } from "@/database/interfaces/user.js";

export default async function Create(
	res: Response,
	[db, octo]: [DBUser, Octokit],
	options: Map<string, any>
) {
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
	const req = await octo.pulls
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
		.catch((e) => {
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
	// var for easier access
	const data = req.data;

	// for buttons
	options.set("pull_number", data.number);

	// create the embed
	const embed = CreatePREmbed(data);

	// button components to be added
	const components = [
		{
			type: ComponentType.ActionRow,
			components: [
				{
					type: ComponentType.Button,
					style: ButtonStyle.Link,
					label: "Edit",
					url: `https://github.com/${owner}/${repo}/pull/${data.number}`,
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
			flags: db.settings.misc.ephemeral ? MessageFlags.Ephemeral : undefined,
		},
	});
}
