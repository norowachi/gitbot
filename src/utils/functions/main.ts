import { Response } from "express";
import {
	APIEmbed,
	APIApplicationCommandInteraction,
	APIActionRowComponent,
	APIButtonComponent,
	ComponentType,
	ButtonStyle,
	APIInteractionResponseCallbackData,
	InteractionResponseType,
	MessageFlags,
	APIMessageComponentInteraction,
	APIMessageComponentInteractionData,
	APIApplicationCommandInteractionDataOption,
	ApplicationCommandOptionType,
} from "discord-api-types/v10";
import {
	ConsoleColors,
	emojis,
	IntEmitter,
	commandsData,
	env,
	DiscordRestClient,
} from "@utils";
import { Endpoints } from "@octokit/types";

/**
 * Run a command
 */

export async function runCommand(name: string) {
	const Command = commandsData.get(name);
	if (Command) {
		return Command.run;
	}
	return function (res: Response) {
		return res.json({
			type: InteractionResponseType.ChannelMessageWithSource,
			data: {
				content: "Command not found",
				flags: MessageFlags.Ephemeral,
			},
		});
	};
}

/**
 * Run a command's autocomplete
 */

export async function runCommandAutoComplete(name: string) {
	const Command = commandsData.get(name);
	if (Command && Command.autocomplete) {
		return Command.autocomplete;
	}
	return function (res: Response) {
		return res.json({
			type: InteractionResponseType.ApplicationCommandAutocompleteResult,
			data: {
				choices: [],
			},
		});
	};
}

/**
 * Converts data received to options map
 */
export function getOptionsValue(
	data: APIApplicationCommandInteractionDataOption[]
): Map<string, any> {
	const options: Map<string, any> = new Map();
	for (const option of data) {
		if (
			option.type === ApplicationCommandOptionType.Subcommand ||
			option.type === ApplicationCommandOptionType.SubcommandGroup
		) {
			return getOptionsValue(option.options!);
		} else {
			options.set(option.name, option.value);
		}
	}
	return options;
}

/**
 * Get Autocomplete focused field
 */
export function getFocusedField(
	data: APIApplicationCommandInteractionDataOption[]
) {
	for (const option of data) {
		if (
			option.type === ApplicationCommandOptionType.Subcommand ||
			option.type === ApplicationCommandOptionType.SubcommandGroup
		) {
			return getFocusedField(option.options!);
		} else if ((option as any).focused) {
			return option.name;
		}
	}
	return null;
}

/**
 * returns sub commands and/or sub command groups if any
 * @param dataOptions options gotten from interaction
 * @returns
 */
export function getSub(
	dataOptions?: APIApplicationCommandInteractionDataOption
) {
	if (!dataOptions) return;
	if (dataOptions.type === ApplicationCommandOptionType.SubcommandGroup) {
		return [dataOptions.name, dataOptions.options?.[0].name!];
	}
	if (dataOptions.type === ApplicationCommandOptionType.Subcommand) {
		return [dataOptions.name];
	}
	return;
}

/**
 * nap time!
 */
export function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * returns current time in ISO format
 * @param shard_id bot shard if any
 * @returns
 */
export function DateInISO(shard_id: number | null = null) {
	return (
		ChangeConsoleColor("FgCyan", "[" + new Date().toISOString() + "]") +
		(shard_id !== null ? ChangeConsoleColor("FgMagenta", ` [${shard_id}]`) : "")
	);
}

/** change color of text in console */
export function ChangeConsoleColor(
	color: keyof typeof ConsoleColors,
	...value: any[]
) {
	return `${ConsoleColors[color]}${value.map((v) => v).join(" ")}${
		ConsoleColors.Reset
	}`;
}

/** change date-time string to discord timestamp format */
export function DiscordTimestamp(date: string, format: "R" | "f" | "F") {
	return `<t:${Math.floor(new Date(date).getTime() / 1000)}:${format}>`;
}

/**
 * Create an embed pagination
 * @param interaction the interaction object
 * @param embeds embeds to paginate
 *
 */
export async function embedMaker(res: Response, embeds: APIEmbed[]) {
	// defining interaction
	const interaction = res.req.body as APIApplicationCommandInteraction;
	// constants, custom ids and first page
	let page = 0;
	const date = Date.now();
	const prev = `previous-${date}`;
	const next = `next-${date}`;

	// nav buttons
	const navbtns: APIActionRowComponent<APIButtonComponent> = {
		type: ComponentType.ActionRow,
		components: [
			{
				type: ComponentType.Button,
				style: ButtonStyle.Primary,
				emoji: { name: emojis.arrowLeft },
				custom_id: prev,
				disabled: true,
			},
			{
				type: ComponentType.Button,
				style: ButtonStyle.Primary,
				emoji: { name: emojis.arrowRight },
				custom_id: next,
				// if only one embed, disable next button
				disabled: embeds.length == 1 ? true : false,
			},
		],
	};

	// setting first footer
	embeds[page].footer = {
		text: `page ${page + 1} of ${embeds.length}`,
	};

	// defining first message
	const message: APIInteractionResponseCallbackData = {
		embeds: [embeds[page]],
		components: [navbtns],
	};

	// sending first message
	res.json({
		type: InteractionResponseType.ChannelMessageWithSource,
		data: message,
	});

	// add listeners for the nav buttons
	IntEmitter.on(prev, InteractionCreateEventListener);
	IntEmitter.on(next, InteractionCreateEventListener);

	// remove listeners & disable component after 15 minutes
	setTimeout(() => {
		IntEmitter.off(prev, InteractionCreateEventListener);
		IntEmitter.off(next, InteractionCreateEventListener);
		navbtns.components![0].disabled = true;
		navbtns.components![1].disabled = true;
		new DiscordRestClient(env.DISCORD_APP_TOKEN!, IntEmitter).req(
			"PATCH",
			`/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`,
			{
				body: {
					components: [navbtns],
				},
			}
		);
	}, 15 * 60 * 1000);

	// interaction create event listener
	async function InteractionCreateEventListener(
		...args: [Response, APIApplicationCommandInteraction]
	) {
		interaction.user = interaction.member?.user || interaction.user;
		// if not author of the interaction, nuh uh
		if ((args[1].user || args[1].member?.user)?.id !== interaction.user?.id) {
			args[0].json({
				type: InteractionResponseType.ChannelMessageWithSource,
				data: {
					content: "This interaction is not for you!",
					flags: MessageFlags.Ephemeral,
				},
			});
			return;
		}
		// defining response, interaction and interaction data
		const res = args[0];
		const int = args[1] as unknown as APIMessageComponentInteraction;
		const intData = int.data as unknown as APIMessageComponentInteractionData;

		// if previous button clicked
		if (intData.custom_id == prev) {
			// if not first page
			if (page != 0) {
				// go to previous page
				page--;
				// edit footer
				embeds[page].footer = {
					text: `page ${page + 1} of ${embeds.length}`,
				};
				// if new page is first page, disable prev button
				if (page == 0) {
					navbtns.components![0].disabled = true;
					// else enable both buttons
				} else {
					navbtns.components![0].disabled = false;
					navbtns.components![1].disabled = false;
				}

				// finally update the embed
				res.json({
					type: InteractionResponseType.UpdateMessage,
					data: {
						embeds: [embeds[page]],
						components: [navbtns],
					},
				});
				return;
			}
		}

		// if next button clicked
		if (intData.custom_id == next) {
			// if not last page
			if (page < embeds.length - 1) {
				// go to next page
				page++;
				// edit footer
				embeds[page].footer = {
					text: `page ${page + 1} of ${embeds.length}`,
				};
				// if new page is last page, disable next button
				if (page === embeds.length - 1) {
					navbtns.components![1].disabled = true;
					// else enable both buttons
				} else {
					navbtns.components![0].disabled = false;
					navbtns.components![1].disabled = false;
				}

				// and again, finally update the embed
				res.json({
					type: InteractionResponseType.UpdateMessage,
					data: {
						embeds: [embeds[page]],
						components: [navbtns],
					},
				});
				return;
			}
		}
		return;
	}
}

export function Capitalize(str: string) {
	return str[0].toUpperCase() + str.slice(1).toLowerCase();
}

export function OctoErrMsg(req: any) {
	// get all errors and map them to show *pretty* info
	const errors = (req.response?.data as any).errors
		// map thru all errors
		?.map((c: { [K: string]: string }) =>
			// map thru the entries of the error and format it to a pretty readable way :v
			Object.entries(c)
				.map((c) => `> ${Capitalize(c[0])}: \`${c[1]}\``)
				.join("\n")
		)
		.join("\n\n");
	// message, status code & the mapped errors, if response exists
	return (
		(req.response
			? `${(req.response.data as any).message}`
			: "Operation was not successful") +
		((req.response?.data as any).errors
			? `\nStatus: ${(req.response?.data as any).status}, Error(s):\n${errors}`
			: "")
	);
}

/**
 * embed maker for PR commands
 */
export function CreatePREmbed(
	data: Endpoints["GET /repos/{owner}/{repo}/pulls/{pull_number}"]["response"]["data"]
): APIEmbed {
	const embed: APIEmbed = {
		title: `${data.title} #${data.number}`,
		author: {
			name: `${data.user.login} (${data.author_association})`,
			icon_url: data.user.avatar_url,
			url: data.user.html_url,
		},
		url: data.html_url,
		description:
			data.body && data.body.length > 1000
				? data.body.slice(0, 1000) + `\n\n[**...**](${data.html_url})`
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
					data.labels?.length > 0
						? data.labels.map((l) => `\`${l.name}\``).join(", ")
						: "No Labels",
				inline: true,
			},
			{
				name: "Misc",
				value: [
					`**Created at**: ${DiscordTimestamp(data.created_at, "f")}`,
					`**Draft**: ${data.draft}`,
					`**Maintainer Can Modify**: ${data.maintainer_can_modify}`,
					data.mergeable
						? `**Mergeable**: ${data.mergeable}, **Mergable State**: ${data.mergeable_state}\n**Merge Commit SHA**: ${data.merge_commit_sha}`
						: `**Merged**: ${data.merged}${
								data.merged
									? `, at ${DiscordTimestamp(data.merged_at!, "f")}, by [\`${
											data.merged_by?.login
									  }\`](${data.merged_by?.html_url})`
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
	// unshift order is opposite
	// adds to first of the array
	// so last element wanted to be added, is added first

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

	return embed;
}

export function CreateIssueEmbed(
	data: Endpoints["GET /repos/{owner}/{repo}/issues/{issue_number}"]["response"]["data"]
) {
	const embed: APIEmbed = {
		title: `${data.title} #${data.number}`,
		author: {
			name: `${data.user?.login} (${data.author_association})`,
			icon_url: data.user?.avatar_url,
			url: data.user?.html_url,
		},
		url: data.html_url,
		description:
			data.body && data.body.length > 1000
				? data.body.slice(0, 1000) + `\n\n[**...**](${data.html_url})`
				: data.body || "No Description",
		fields: [
			{
				name: "Labels",
				value:
					data.labels?.length > 0
						? data.labels
								.map((l) => `\`${typeof l === "string" ? l : l.name}\``)
								.join(", ")
						: "No Labels",
				inline: true,
			},
			{
				name: "Misc",
				value: [
					`**State**: ${data.state}${
						data.state == "closed"
							? `, at ${
									data.closed_at ? DiscordTimestamp(data.closed_at, "f") : "N/A"
							  }, by ${
									data.closed_by
										? `[\`${data.closed_by.login}\`](${data.closed_by.html_url})`
										: "N/A"
							  }`
							: ""
					}`,
					`**Locked**: ${data.locked}${
						data.locked && data.active_lock_reason
							? ", **Reason**:" + data.active_lock_reason
							: ""
					}`,

					,
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

	// return the embed
	return embed;
}
