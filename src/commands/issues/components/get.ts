import { Response } from "express";
import { Octokit } from "@octokit/rest";
import {
	InteractionResponseType,
	MessageFlags,
	ComponentType,
	ButtonStyle,
} from "discord-api-types/v10";
import { OctoErrMsg, CreateIssueEmbed, DiscordTimestamp } from "@utils";
import { DBUser } from "@/database/interfaces/user.js";

export default async function Get(
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
	/** number of the issue
	 * ! REQUIRED
	 */
	const issue_number = options.get("issue_number");

	// create req
	const req = await octo.issues
		.get({
			owner,
			repo,
			issue_number,
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

	// button components to be added
	const components = [
		{
			type: ComponentType.ActionRow,
			components: [
				{
					type: ComponentType.Button,
					style: ButtonStyle.Link,
					label: "Edit",
					url: `https://github.com/${owner}/${repo}/issues/${issue_number}`,
				},
			],
		},
	];

	// return the response
	return res.json({
		type: InteractionResponseType.ChannelMessageWithSource,
		data: {
			content: `[\`${data.user?.login}\`](${
				data.user?.html_url
			}) opened this issue ${DiscordTimestamp(data.created_at, "R")} | ${
				data.comments
			} comments`,
			embeds: db.settings.misc.simple
				? undefined
				: [CreateIssueEmbed(data)],
			components: db.settings.misc.simple ? undefined : components,
			flags: db.settings.misc.ephemeral
				? MessageFlags.Ephemeral
				: undefined,
		},
	});
}
