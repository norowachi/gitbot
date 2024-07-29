import { InteractionResponseType, MessageFlags } from "discord-api-types/v10";
import { Response } from "express";
import { Octokit } from "@octokit/rest";
import { CreatePREmbed, OctoErrMsg } from "@utils";

export default async function Close(
	res: Response,
	octo: Octokit,
	options: Map<string, any>
) {
	// get basic data from the interaction options
	const owner = options.get("owner");
	const repo = options.get("repo");
	const pull_number = options.get("pull_number");

	// get pr update response
	const UpdateResp = await octo.pulls
		.update({
			owner: owner!,
			repo: repo!,
			pull_number: pull_number!,
			state: "closed",
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

	// if no pr info, i.e. error
	if (!UpdateResp) return;

	// set data for easier access
	const data = UpdateResp.data;

	// send response
	return res.json({
		type: InteractionResponseType.ChannelMessageWithSource,
		data: {
			content: `## Closed\n\n[\`${data.user.login}\`](${data.user.html_url}) wants to merge ${data.commits} commits into [\`${data.base.label}\`](${data.base.repo.html_url}) from [\`${data.head.label}\`](${data.head.repo?.html_url})`,
			embeds: [CreatePREmbed(data)],
			//TODO: make optional
			//flags: MessageFlags.Ephemeral,
		},
	});
}
