import {
	APIModalInteractionResponseCallbackData,
	APIModalSubmitInteraction,
	ComponentType,
	InteractionResponseType,
	MessageFlags,
	TextInputStyle,
} from "discord-api-types/v10";
import { Response } from "express";
import { Octokit } from "@octokit/rest";
import {
	IntEmitter,
	Capitalize,
	OctoErrMsg,
	CreateIssueEmbed,
	DiscordTimestamp,
} from "@utils";

export default async function Update(
	res: Response,
	octo: Octokit,
	oldOptions: Map<string, any>
) {
	// get basic data from the interaction options
	const owner = oldOptions.get("owner");
	const repo = oldOptions.get("repo");
	const issue_number = oldOptions.get("issue_number");

	// get issue info
	const issueInfo = await octo.issues
		.get({
			owner,
			repo,
			issue_number,
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
	if (!issueInfo) return;

	// set data
	const data = issueInfo.data;

	// updateable data
	const { title, body, state, assignees, labels, milestone, state_reason } =
		data;
	// show modal
	res.json({
		type: InteractionResponseType.Modal,
		data: {
			title: `Update Issue #${data.number}`,
			custom_id: data.id.toString(),
			components: [
				{
					type: ComponentType.ActionRow,
					components: [
						{
							type: ComponentType.TextInput,
							custom_id: "title",
							label: "Title",
							style: TextInputStyle.Short,
							placeholder: title,
							value: title,
							required: false,
						},
					],
				},
				{
					type: ComponentType.ActionRow,
					components: [
						{
							type: ComponentType.TextInput,
							custom_id: "body",
							label: "Body",
							style: TextInputStyle.Paragraph,
							placeholder: body,
							value: body,
							required: false,
						},
					],
				},
				{
					type: ComponentType.ActionRow,
					components: [
						{
							type: ComponentType.TextInput,
							custom_id: "state",
							label: "State ([O]pen/[C]losed)",
							style: TextInputStyle.Short,
							placeholder: Capitalize(state),
							value: Capitalize(state),
							required: false,
						},
					],
				},
				{
					type: ComponentType.ActionRow,
					components: [
						{
							type: ComponentType.TextInput,
							custom_id: "state_reason",
							label: "Reason ([C]ompleted/[R]eopened/[N]ot Planned)",
							style: TextInputStyle.Short,
							placeholder: state_reason,
							value: state_reason,
							required: false,
						},
					],
				},
				{
					type: ComponentType.ActionRow,
					components: [
						{
							type: ComponentType.TextInput,
							custom_id: "labels",
							label: "Labels",
							style: TextInputStyle.Short,
							placeholder: labels
								?.map((l) => (typeof l == "string" ? l : l.name))
								.join(", "),
							value: labels
								?.map((l) => (typeof l == "string" ? l : l.name))
								.join(", "),
							required: false,
						},
					],
				},
			],
		} as APIModalInteractionResponseCallbackData,
	});

	IntEmitter.on(data.id.toString(), ModalSubmit);

	return;

	// Handle Modal Submission
	async function ModalSubmit(...args: [Response, APIModalSubmitInteraction]) {
		const map = new Map<string, string>();

		// [
		//   ActionRow [
		//     TextInput [
		//       id, value
		//     ]
		//   ]
		// ]
		args[1].data.components.map((row) => {
			// map thru each component and add it to the map
			row.components.map((component) => {
				map.set(component.custom_id, component.value);
			});
		});

		const NewTitle = map.get("title");
		// or null cuz body isnt required
		const NewBody = map.get("body") || null;
		const NewState = map.get("state");
		const NewStateReason = map.get("state_reason");
		// const NewAssignees = map.get("assignees");
		const NewLabels = map.get("labels");
		// const NewMilestone = map.get("milestone");

		// if old = new
		// or if new is empty
		// ignore
		if (
			NewTitle === title &&
			NewBody === body &&
			NewState?.toLowerCase() === state.toLowerCase() &&
			NewStateReason?.toLowerCase() === state_reason?.toLowerCase() &&
			// NewAssignees?.toLowerCase() ===
			// 	assignees?.map((a) => a?.login).join(", ") &&
			NewLabels?.toLowerCase() ===
				labels?.map((l) => (typeof l == "string" ? l : l.name)).join(", ")
			// && NewMilestone?.toLowerCase() === milestone?.title
		) {
			args[0].json({
				type: InteractionResponseType.ChannelMessageWithSource,
				data: {
					content: `No edits were made, ignoring.`,
					flags: MessageFlags.Ephemeral,
				},
			});
			return;
		}

		// validate state
		if (
			NewState &&
			!["o", "c", "open", "closed"].includes(NewState.toLowerCase())
		) {
			args[0].json({
				type: InteractionResponseType.ChannelMessageWithSource,
				data: {
					content: "Invalid `State` value, please use `[O]pen` or `[C]losed`",
					flags: MessageFlags.Ephemeral,
				},
			});
			return;
		}
		// validate state_reason
		if (
			NewStateReason &&
			!["c", "r", "n", "completed", "resolved", "not planned"].includes(
				NewStateReason.toLowerCase()
			)
		) {
			args[0].json({
				type: InteractionResponseType.ChannelMessageWithSource,
				data: {
					content:
						"Invalid `State Reason` value, please use `[C]ompleted`, `[R]eopened`, `[N]ot Planned`",
					flags: MessageFlags.Ephemeral,
				},
			});
			return;
		}

		const updateRes = await octo.issues
			.update({
				title: NewTitle === title ? undefined : NewTitle,
				body: NewBody === body ? undefined : NewBody || undefined,
				state: NewState
					? ["c", "closed"].includes(NewState?.toLowerCase())
						? "closed"
						: "open"
					: undefined,
				state_reason: NewStateReason
					? ["c", "completed"].includes(NewStateReason.toLowerCase())
						? "completed"
						: ["r", "reopened"].includes(NewStateReason.toLowerCase())
						? "reopened"
						: "not_planned"
					: undefined,
				// assignees: NewAssignees?.split(",").map((a: string) => a.trim()),
				labels: NewLabels
					? NewLabels?.split(",").map((l: string) => ({ name: l.trim() }))
					: [],
				// milestone: NewMilestone,
				owner,
				repo,
				issue_number,
			})
			.catch((err) => {
				args[0].json({
					type: InteractionResponseType.ChannelMessageWithSource,
					data: {
						content: OctoErrMsg(err),
						flags: MessageFlags.Ephemeral,
					},
				});
				return;
			});

		// if error
		if (!updateRes) return;

		const data = updateRes.data;
		// create the updated embed
		const embed = CreateIssueEmbed(data);

		// remove modal listener
		IntEmitter.removeAllListeners(data.id.toString());

		// send response
		// return the response
		return args[0].json({
			type: InteractionResponseType.ChannelMessageWithSource,
			data: {
				content: `## Updated\n\n[\`${data.user?.login}\`](${
					data.user?.html_url
				}) opened this issue ${DiscordTimestamp(data.created_at, "R")} | ${
					data.comments
				} comments`,
				embeds: [embed],
				flags: MessageFlags.Ephemeral,
			},
		});
	}
}
