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
	DiscordRestClient,
} from "@utils";
import { DBUser } from "@/database/interfaces/user.js";

export default async function Create(
	res: Response,
	rest: DiscordRestClient,
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

	// get customizers
	const customizers = db.settings.issues.find(
		(i) => i.owner == owner && i.repo == repo
	);
	// for customizer response
	let customizersRes: string = "";
	// handle auto_project customizer
	if (customizers?.auto_project)
		// add to project v2 with graphql
		customizersRes += (await octo
			.graphql(
				`mutation AddIssueToProject($projectId: ID!, $issueId: ID!) {
					addProjectV2ItemById(input: {
						contentId: $contentId
						projectId: $projectId
					}) {
						item {
							id
						}
					}
				}`,
				{
					projectId: customizers.auto_project,
					contentId: data.node_id,
				}
			)
			.catch((e) => {
				res.json({
					type: InteractionResponseType.ChannelMessageWithSource,
					data: {
						content: OctoErrMsg(e),
						flags: MessageFlags.Ephemeral,
					},
				});
				return;
			}))
			? "And added issue to project\n"
			: "";

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
			} comments\n${customizersRes}`,
			embeds: [embed],
			components: components,
			flags: db.settings.misc.ephemeral ? MessageFlags.Ephemeral : undefined,
		},
	});
}
