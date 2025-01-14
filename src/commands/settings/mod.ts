import {
	APIInteraction,
	ApplicationCommandOptionType,
	ApplicationCommandType,
	InteractionResponseType,
	MessageFlags,
} from "discord-api-types/v10";
import {
	CommandData,
	handleRepoAutocomplete,
	handleUserAutocomplete,
	RequiredOptions,
} from "@utils";
import { editUserSettings } from "@/database/functions/user.js";
import { Response } from "express";
import { inspect } from "node:util";
import { DBUser } from "@database/interfaces/user.js";

export default {
	name: "settings",
	description: "Manage Gitbot Settings",
	type: ApplicationCommandType.ChatInput,
	contexts: [0, 1, 2],
	integration_types: [0, 1],
	options: [
		{
			name: "misc",
			description: "Miscellaneous/General settings for the bot",
			type: ApplicationCommandOptionType.Subcommand,
			required: false,
			options: [
				{
					name: "ephemeral",
					description:
						"Whether the message should be ephermal/hidden or not (default: false)",
					type: ApplicationCommandOptionType.Boolean,
					required: false,
				},
				{
					name: "simple",
					description:
						"Whether to send a simpler response to commands or the full one (default: false)",
					type: ApplicationCommandOptionType.Boolean,
					required: false,
				},
			],
		},
		{
			name: "issues",
			description: "Manage issues settings",
			type: ApplicationCommandOptionType.Subcommand,
			required: false,
			options: [
				RequiredOptions.owner,
				RequiredOptions.repo,
				{
					name: "auto_project",
					description:
						"Automatically add the issue to a projectV2 (put the project's node_id)",
					type: ApplicationCommandOptionType.String,
					required: false,
					autocomplete: true,
				},
				{
					name: "auto_assignees",
					description:
						"Automatically assign the issue to users (logins comma separated)",
					type: ApplicationCommandOptionType.String,
					required: false,
				},
			],
		},
	],
	autocomplete: async (res, focused, gh, options) => {
		const owner = options?.get("owner");
		const repo = options?.get("repo");

		// switch the focused option
		switch (focused) {
			case "owner": {
				return res.json({
					type: InteractionResponseType.ApplicationCommandAutocompleteResult,
					data: {
						choices: (
							await handleUserAutocomplete(
								gh[0]!.github.login,
								options?.get("owner")
							)
						).map((user) => ({ name: user, value: user })),
					},
				});
			}
			case "repo": {
				// requirements
				if (!owner) return;
				// get repos filtered
				const array = await handleRepoAutocomplete(
					gh[1],
					owner,
					gh[0]!.github.login === owner,
					repo
				);
				// return the autocomplete array
				return res.json({
					type: InteractionResponseType.ApplicationCommandAutocompleteResult,
					data: {
						choices: array?.map((repo) => ({
							name: repo,
							value: repo,
						})),
					},
				});
			}
			case "auto_project": {
				// fetch projects
				const projects = [
					await gh[1]
						.graphql(
							`query($login: String!) {
							organization(login: $login)  { 
								projectsV2(first: 100) { 
									nodes {
										id
										title
									}
								} 
							} 
						}`,
							{ login: owner }
						)
						.catch((_) => {}),
					await gh[1]
						.graphql(
							`query($login: String!) {
							user(login: $login)  { 
								projectsV2(first: 100) { 
									nodes {
										id
										title
									}
								} 
							} 
						}`,
							{ login: owner }
						)
						.catch((_) => {}),
				];
				// return the autocomplete array
				return res.json({
					type: InteractionResponseType.ApplicationCommandAutocompleteResult,
					data: {
						choices: [
							// get org projects
							(
								projects as any
							)[0]?.organization.projectsV2.nodes?.map((n: any) =>
								n
									? { name: n.title, value: n.id }
									: {
											name: "Projects not accessible by integration",
											value: "x",
									  }
							) || {
								name: "No org projects found",
								value: "x",
							},
							// get user projects
							(projects as any)[1]?.user.projectsV2.nodes?.map(
								(n: any) =>
									n
										? { name: n.title, value: n.id }
										: {
												name: "Projects not accessible by integration",
												value: "x",
										  }
							) || {
								name: "No user projects found",
								value: "x",
							},
						],
					},
				});
			}
			default:
				return;
		}
	},
	run: async (res, [db], sub, options) => {
		const interaction = res.req.body as APIInteraction;
		const userId = interaction.member?.user.id || interaction.user?.id;

		if (!userId)
			return res.json({
				type: InteractionResponseType.ChannelMessageWithSource,
				data: {
					content: "An error occured while fetching your user id",
					flags: MessageFlags.Ephemeral,
				},
			});

		// switch the subcommand
		switch (sub![0]) {
			case "misc":
				return Misc(res, userId, options!);
			case "issues":
				return Issues(res, userId, options!, db);
			default:
				return res.json({
					type: InteractionResponseType.ChannelMessageWithSource,
					data: {
						content: `An error occured while managing settings: ${inspect(
							sub
						)}`,
						flags: MessageFlags.Ephemeral,
					},
				});
		}
	},
} as CommandData<true>;

// misc stuff
function Misc(res: Response, userId: string, options: Map<string, any>) {
	const ephemeral: boolean | undefined = options?.get("ephemeral");
	const simple: boolean | undefined = options?.get("simple");

	// if no options at all
	if (!options?.size) {
		return res.json({
			type: InteractionResponseType.ChannelMessageWithSource,
			data: {
				content: "Please specify what you want to manage",
				flags: MessageFlags.Ephemeral,
			},
		});
	}
	// build response
	let response = "## Settings Updated:\n";

	// edit ephemeral
	if (typeof ephemeral !== "undefined") {
		editUserSettings(userId, {
			misc: { ephemeral },
		});
		response += `**Ephemeral** is now \`${ephemeral}\`\n`;
	}
	// edit simple
	if (typeof simple !== "undefined") {
		editUserSettings(userId, {
			misc: { simple },
		});
		response += `**Simple** is now \`${simple}\`\n`;
	}

	// lastly return response/ack
	return res.json({
		type: InteractionResponseType.ChannelMessageWithSource,
		data: {
			content: response,
			flags: MessageFlags.Ephemeral,
		},
	});
}

// issues stuff
function Issues(
	res: Response,
	userId: string,
	options: Map<string, any>,
	db: DBUser
) {
	const owner: string = options.get("owner");
	const repo: string = options.get("repo");
	const auto_project: string | undefined = options.get("auto_project");
	const auto_assignees: string | undefined = options.get("auto_assignees");

	//get saved customizers if it exists
	const customizers = db.settings.issues.find(
		(i) => i.owner === owner && i.repo === repo
	);

	// if no options at all
	if (options?.size <= 2) {
		return res.json({
			type: InteractionResponseType.ChannelMessageWithSource,
			data: {
				content: "Please specify what you want to manage",
				flags: MessageFlags.Ephemeral,
			},
		});
	}
	// build response
	let response = `Settings Updated For [\`${owner}/${repo}\`](<https://github.com/${owner}/${repo}>):\n`;

	// edit auto_project
	if (auto_project) {
		if (auto_project === "x") {
			response += "**Auto Project** id is incorrect.\n";
		} else {
			response += `**Auto Project** is now linked to project id \`${auto_project}\`\n`;
		}
	}

	// edit auto_assignees
	if (auto_assignees) {
		response += `**Auto Assignees** is set to ${auto_assignees
			.split(",")
			.map(
				(as) => `[\`${as.trim()}\`](<https://github.com/${as.trim()}>)`
			)
			.join(", ")}\n`;
	}

	// now edit & save settings
	editUserSettings(userId, {
		issues: [
			{
				owner,
				repo,
				auto_project:
					(auto_project === "x" ? undefined : auto_project) ||
					customizers?.auto_project,
				auto_assignees:
					auto_assignees?.split(",").map((as) => as.trim()) ||
					customizers?.auto_assignees,
			},
		],
	});

	// lastly return response/ack
	return res.json({
		type: InteractionResponseType.ChannelMessageWithSource,
		data: {
			content: response,
			flags: MessageFlags.Ephemeral,
		},
	});
}
