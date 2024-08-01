import { Response } from "express";
import { Octokit } from "@octokit/rest";
import {
	InteractionResponseType,
	MessageFlags,
	ComponentType,
	ButtonStyle,
} from "discord-api-types/v10";
import {
	OctoErrMsg,
	CreateIssueEmbed,
	DiscordTimestamp,
} from "@utils";

export default async function Create(
	res: Response,
	octo: Octokit,
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
	/** title of the issue
	 * ! REQUIRED
	 */
	const title = options.get("title");
	/** content/body of the issue */
	const body = options.get("body");
	/** assignees */
	const assignees = options.get("assignees");
	/** milestone */
	const milestone = options.get("milestone");
	/** labels */
	const labels = options.get("labels");

	// create req
	const req = await octo.issues
		.create({
			owner,
			repo,
			title,
			body,
			assignees: assignees?.split(",").map((a: string) => a.trim()),
			milestone,
			labels: labels?.split(",").map((l: string) => l.trim()),
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
	options.set("issue_number", data.number);

	// create the embed
	const embed = CreateIssueEmbed(data);

	// button components to be added
	const components = [
		{
			type: ComponentType.ActionRow,
			components: [
				{
					type: ComponentType.Button,
					style: ButtonStyle.Link,
					label: "Edit",
					url: `https://github.com/${owner}/${repo}/issues/${data.number}`,
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
			embeds: [embed],
			components: components,
			//TODO: make optional
			// flags: MessageFlags.Ephemeral,
		},
	});
}
