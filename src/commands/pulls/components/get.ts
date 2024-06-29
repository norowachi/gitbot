import { Response } from "express";
import { Octokit } from "@octokit/rest";
import {
	InteractionResponseType,
	MessageFlags,
	ComponentType,
	ButtonStyle,
} from "discord-api-types/v10";
import {
	// IntEmitter,
	DiscordRestClient,
	// ClearComponents,
	CreatePREmbed,
	OctoErrMsg,
} from "@utils";
// import Update from "./update.js";

export default async function Get(
	res: Response,
	rest: DiscordRestClient,
	octo: Octokit,
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
	/** number of the pr
	 * ! REQUIRED
	 */
	const pull_number = options.get("pull_number");

	// create req
	const req = await octo.pulls
		.get({
			owner,
			repo,
			pull_number,
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

	// make a var for easier access
	const data = req.data;
	// create the embed
	const embed = CreatePREmbed(data);

	//! update modal
	// // handle button clicks
	// // modal update click
	// IntEmitter.on(updateModalBtn, async (...args) => {
	// 	// call the update pr modal
	// 	await Update(args[0], octo, options);
	// 	// clear the components
	// 	await ClearComponents(rest, res.req.body);
	// 	// if the modal is closed, and everything successful, remove the listener
	// 	IntEmitter.removeAllListeners(updateModalBtn);
	// 	return;
	// });

	// button components to be added
	const components = [
		{
			type: ComponentType.ActionRow,
			components: [
				{
					type: ComponentType.Button,
					// style: ButtonStyle.Primary,
					style: ButtonStyle.Link,
					// label: "Update",
					label: "Edit",
					// custom_id: updateModalBtn,
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
			flags: MessageFlags.Ephemeral,
		},
	});
}
