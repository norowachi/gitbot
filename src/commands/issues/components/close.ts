import { InteractionResponseType, MessageFlags } from "discord-api-types/v10";
import { Response } from "express";
import { Octokit } from "@octokit/rest";
import {
	CreateIssueEmbed,
	DiscordTimestamp,
	OctoErrMsg,
} from "@utils";

export default async function Close(
	res: Response,
	octo: Octokit,
	options: Map<string, any>
) {
	// get basic data from the interaction options
	const owner = options.get("owner");
	const repo = options.get("repo");
	const issue_number = options.get("issue_number");
	const reason = options.get("reason");

	// get pr update response
	const UpdateResp = await octo.issues
		.update({
			owner: owner!,
			repo: repo!,
			issue_number: issue_number!,
			state: "closed",
			state_reason: reason || null,
		})
		.catch((err) => {
			res.json({
				type: InteractionResponseType.ChannelMessageWithSource,
				data: {
					content: OctoErrMsg(err),
					flags: MessageFlags.Ephemeral,
				},
			});
			return;
		});

	// if no issue info, i.e. error
	if (!UpdateResp) return;

	// set data for easier access
	const data = UpdateResp.data;

	// send response
	return res.json({
		type: InteractionResponseType.ChannelMessageWithSource,
		data: {
			content: `## Closed\n\n[\`${data.user?.login}\`](${
				data.user?.html_url
			}) opened this issue ${DiscordTimestamp(data.created_at, "R")} | ${
				data.comments
			} comments`,
			embeds: [CreateIssueEmbed(data)],
			//TODO: make optional
			// flags: MessageFlags.Ephemeral,
		},
	});
}
