import { InteractionResponseType, MessageFlags } from "discord-api-types/v10";
import { Response } from "express";
import { Octokit } from "@octokit/rest";
import { CreateIssueEmbed, DiscordTimestamp, OctoErrMsg } from "@utils";
import { DBUser } from "@database/interfaces/user.js";

export default async function Close(
	res: Response,
	[db, octo]: [DBUser, Octokit],
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
			content: db.settings.misc.simple
				? `Issue #${data.number} closed: [${data.title}](${data.html_url})`
				: `## Closed\n\n[\`${data.user?.login}\`](${
						data.user?.html_url
				  }) opened this issue ${DiscordTimestamp(
						data.created_at,
						"R"
				  )} | ${data.comments} comments`,
			embeds: db.settings.misc.simple
				? undefined
				: [CreateIssueEmbed(data)],
			flags: db.settings.misc.ephemeral
				? MessageFlags.Ephemeral
				: undefined,
		},
	});
}
