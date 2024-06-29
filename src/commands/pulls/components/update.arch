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
import { IntEmitter, Capitalize, CreatePREmbed, OctoErrMsg } from "@utils";

export default async function updateModal(
	res: Response,
	octo: Octokit,
	oldOptions: Map<string, any>
) {
	// get basic data from the interaction options
	const owner = oldOptions.get("owner");
	const repo = oldOptions.get("repo");
	const pull_number = oldOptions.get("pull_number");

	// get pr info
	const pullInfo = await octo.pulls
		.get({
			owner: owner!,
			repo: repo!,
			pull_number: pull_number!,
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
	if (!pullInfo) return;

	// set data
	const data = pullInfo.data;

	// updateable data
	const { title, body, state, base, maintainer_can_modify } = data;
	// show modal
	res.json({
		type: InteractionResponseType.Modal,
		data: {
			title: `Update ${base.label} PR #${data.number}`,
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
							custom_id: "base",
							label: "Base",
							style: TextInputStyle.Short,
							placeholder: base.ref,
							value: base.ref,
							required: false,
						},
					],
				},
				{
					type: ComponentType.ActionRow,
					components: [
						{
							type: ComponentType.TextInput,
							custom_id: "maintainer_can_modify",
							label: "Maintainer Can Modify ([T]rue/[F]alse)",
							style: TextInputStyle.Short,
							placeholder: maintainer_can_modify ? "True" : "False",
							value: maintainer_can_modify ? "True" : "False",
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
		const NewBase = map.get("base");
		const NewMCM = map.get("maintainer_can_modify");

		// if old = new
		// or if new is empty
		// ignore
		if (
			NewTitle === title &&
			NewBody === body &&
			NewState?.toLowerCase() === state.toLowerCase() &&
			NewBase?.toLowerCase() === base.label.toLowerCase() &&
			NewMCM?.toLowerCase() === (maintainer_can_modify ? "true" : "false")
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
		// validate maintainer_can_modify
		if (NewMCM && !["t", "f", "true", "false"].includes(NewMCM.toLowerCase())) {
			args[0].json({
				type: InteractionResponseType.ChannelMessageWithSource,
				data: {
					content:
						"Invalid `Maintainer Can Modify` value, please use `[T]rue` or `[F]alse`",
					flags: MessageFlags.Ephemeral,
				},
			});
			return;
		}

		const updateRes = await octo.pulls
			.update({
				title: NewTitle === title ? undefined : NewTitle,
				body: NewBody === body ? undefined : NewBody || undefined,
				state: NewState
					? ["c", "closed"].includes(NewState?.toLowerCase())
						? "closed"
						: "open"
					: undefined,
				base: NewBase === base.ref ? undefined : NewBase,
				maintainer_can_modify: NewMCM?.toLowerCase() === "true" ? true : false,
				owner: owner!,
				repo: repo!,
				pull_number: pull_number!,
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
		const embed = CreatePREmbed(data);

		// remove modal listener
		IntEmitter.removeAllListeners(data.id.toString());

		// send response
		// return the response
		return args[0].json({
			type: InteractionResponseType.ChannelMessageWithSource,
			data: {
				content: `## Updated\n\n[\`${data.user.login}\`](${data.user.html_url}) wants to merge ${data.commits} commits into [\`${data.base.label}\`](${data.base.repo.html_url}) from [\`${data.head.label}\`](${data.head.repo?.html_url})`,
				embeds: [embed],
				flags: MessageFlags.Ephemeral,
			},
		});
	}
}
