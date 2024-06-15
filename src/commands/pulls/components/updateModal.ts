import {
	APIActionRowComponent,
	APIApplicationCommandInteraction,
	APIEmbed,
	APIInteractionResponseCallbackData,
	APIModalActionRowComponent,
	APIModalInteractionResponseCallbackData,
	APIModalSubmitInteraction,
	ComponentType,
	InteractionResponseType,
	MessageFlags,
	ModalSubmitActionRowComponent,
	ModalSubmitComponent,
	TextInputStyle,
} from "discord-api-types/v10";
import { Response } from "express";
import { Octokit } from "octokit";
import { Capitalize, IntEmitter, OctoErrMsg } from "../../../utils.js";

export async function updateModal(
	octo: Octokit,
	res: Response,
	oldOptions: Map<string, any>
) {
	// get basic data from the interaction options
	const owner = oldOptions.get("owner");
	const repo = oldOptions.get("repo");
	const pull_number = oldOptions.get("pull_number");

	// get pr info
	const pullInfo = await octo.rest.pulls
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
			title: `Update ${base.label} #${data.number}`,
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

		const OGContent = args[1].message?.content;

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
				type: InteractionResponseType.UpdateMessage,
				data: {
					content:
						`No edits were made, ignoring.` +
						(OGContent ? `\n\n${OGContent}` : ""),

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
				type: InteractionResponseType.UpdateMessage,
				data: {
					content:
						"Invalid `State` value, please use `[O]pen` or `[C]losed`" +
						(OGContent ? `\n\n${OGContent}` : ""),
					flags: MessageFlags.Ephemeral,
				},
			});
			return;
		}
		// validate maintainer_can_modify
		if (NewMCM && !["t", "f", "true", "false"].includes(NewMCM.toLowerCase())) {
			args[0].json({
				type: InteractionResponseType.UpdateMessage,
				data: {
					content:
						"Invalid `Maintainer Can Modify` value, please use `[T]rue` or `[F]alse`" +
						(OGContent ? `\n\n${OGContent}` : ""),
					flags: MessageFlags.Ephemeral,
				},
			});
			return;
		}

		const updateRes = await octo.rest.pulls
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
		const embed: APIEmbed = {
			title: `${data.title} #${data.number}`,
			author: {
				name: `${data.user.login} (${data.author_association})`,
				icon_url: data.user.avatar_url,
				url: data.user.html_url,
			},
			url: data.html_url,
			description:
				data.body && data.body.length > 3900
					? data.body.slice(1, 3900) + `[**...**](${data.html_url})`
					: data.body || "No Description",
			fields: [
				{
					name: "Additions/Deletions",
					value: [
						"```diff",
						"+ " + data.additions,
						"- " + data.deletions,
						"```",
						`with changes in [${data.changed_files} file(s)](${data.html_url}/files)`,
						`and [${data.commits} commits](${data.html_url}/files)`,
					].join("\n"),
					inline: true,
				},
				{
					name: "Labels",
					value:
						data.labels.length > 0
							? data.labels.map((l) => "`" + l.name + "`").join(", ")
							: "No Labels",
					inline: true,
				},
				{
					name: "Misc",
					value: [
						`**Created at**: <t:${Math.floor(
							new Date(data.created_at).getTime() / 1000
						)}:f>`,
						`**Draft**: ${data.draft}`,
						`**Maintainer Can Modify**: ${data.maintainer_can_modify}`,
						data.mergeable
							? `**Mergeable**: ${data.mergeable}, **Mergable State**: ${data.mergeable_state}\n**Merge Commit SHA**: ${data.merge_commit_sha}`
							: `**Merged**: ${data.merged}${
									data.merged
										? `, By [\`${data.merged_by?.login}\`](${data.merged_by?.html_url}), At ${data.merged_at}`
										: ""
							  }`,
						`**State**: ${data.state}, **Locked**: ${data.locked}${
							data.locked && data.active_lock_reason
								? ", **Reason**:" + data.active_lock_reason
								: ""
						}`,
					].join("\n"),
					inline: true,
				},
			],
		};

		// if there's assignees
		if (data.assignees && data.assignees.length > 0) {
			embed.fields?.unshift({
				name: "Assignees",
				value: data.assignees
					.map((as) => `[\`${as.login}\`](${as.html_url})`)
					.join(", "),
			});
		}

		//if there's any reviewers
		if (data.requested_reviewers && data.requested_reviewers?.length) {
			embed.fields?.unshift({
				name: "Requested Reviewers",
				value: data.requested_reviewers
					.map((as) => `[\`${as.login}\`](${as.html_url})`)
					.join(", "),
			});
		}

		// send response
		// return the response
		return args[0].json({
			type: InteractionResponseType.UpdateMessage,
			data: {
				content: `## Updated\n\n[\`${data.user.login}\`](${data.user.html_url}) wants to merge ${data.commits} commits into [\`${data.base.label}\`](${data.base.repo.html_url}) from [\`${data.head.label}\`](${data.head.repo?.html_url})`,
				embeds: [embed],
				flags: MessageFlags.Ephemeral,
			},
		});
	}
}
