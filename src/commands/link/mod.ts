import {
	APIActionRowComponent,
	APIButtonComponent,
	APIInteraction,
	APIInteractionResponseCallbackData,
	ApplicationCommandType,
	ButtonStyle,
	ComponentType,
	InteractionResponseType,
	MessageFlags,
	TextInputStyle,
} from "discord-api-types/v10";
import {
	CommandData,
	encryptToken,
	env,
	ghLinks,
	IntEmitter,
	OctoErrMsg,
} from "@utils";
import { getUser, InitUser } from "@database/functions/user.js";
import { UserEnums } from "@database/interfaces/user.js";
import { randomBytes, hash } from "node:crypto";
import { Octokit } from "@octokit/rest";

export default {
	name: "link",
	description: "Link your Github account with Discord",
	type: ApplicationCommandType.ChatInput,
	contexts: [0, 1, 2],
	integration_types: [0, 1],
	run: async (res) => {
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

		// check if user is already linked
		if (await getUser({ discordId: userId }))
			return res.json({
				type: InteractionResponseType.ChannelMessageWithSource,
				data: {
					content: UserEnums.DiscordLinked,
					flags: MessageFlags.Ephemeral,
				},
			});

		// generate a random hash
		const random = hash("sha256", new Uint8Array(randomBytes(16)));
		// add user id to the ghlinks list with the random string
		ghLinks.set(random, userId!);

		// remove user from ghlinks after 10 mins
		setTimeout(() => {
			if (ghLinks.has(random)) ghLinks.delete(random);
		}, 10 * 60 * 1000);

		let components: APIActionRowComponent<APIButtonComponent> = {
			type: ComponentType.ActionRow,
			components: [
				{
					type: ComponentType.Button,
					style: ButtonStyle.Primary,
					label: "Add Personal Token",
					custom_id: `keybtn-${userId}`,
				},
			],
		};

		if (
			env.GITHUB_CLIENT_NAME &&
			env.GITHUB_CLIENT_ID &&
			env.GITHUB_CLIENT_SECRET
		) {
			components.components.unshift({
				type: ComponentType.Button,
				style: ButtonStyle.Link,
				label: "Sign in",
				url: `${env.SITE_URL}/github/verify/${random}`,
			});
		}

		// send sign up link
		res.json({
			type: InteractionResponseType.ChannelMessageWithSource,
			data: {
				content:
					"Link your Github account to use the other commands! Expires after 10 Minutes\n\nNote: to use Gitbot with external repos you might need to use a classic token [(?)](https://github.com/orgs/community/discussions/106661#discussioncomment-10114091)",
				flags: MessageFlags.Ephemeral,
				components: [components],
			} as APIInteractionResponseCallbackData,
		});

		// handle private key modal interactions
		IntEmitter.on(`keybtn-${userId}`, async (...args) => {
			// send the modal
			await CreateKeyModal(userId, args[0]);
			// remove the listener
			IntEmitter.removeAllListeners(`keybtn-${userId}`);
			return;
		});

		// clear all listeners after 10 mins
		setTimeout(() => {
			IntEmitter.removeAllListeners(`keybtn-${userId}`);
		}, 10 * 60 * 1000);

		return;
	},
} as CommandData;

// create private key modal
async function CreateKeyModal(userId: string, res: any) {
	// send the modal
	res.json({
		type: InteractionResponseType.Modal,
		data: {
			title: "Add Your Own Private Key",
			custom_id: `keysubmit-${userId}`,
			components: [
				{
					type: ComponentType.ActionRow,
					components: [
						{
							type: ComponentType.TextInput,
							style: TextInputStyle.Paragraph,
							label: "Your Private Key",
							placeholder: "Enter your private key here",
							custom_id: "key",
						},
					],
				},
			],
		},
	});

	// handle the submit button
	IntEmitter.on(`keysubmit-${userId}`, async (res, int) => {
		// get the private key
		const key = int.data.components[0].components[0].value;

		const AuthRes = (
			await new Octokit({ auth: key }).users
				.getAuthenticated()
				.catch((e) => {
					res.json({
						type: InteractionResponseType.ChannelMessageWithSource,
						data: {
							content: `An error occured while verifying your private key.\n${OctoErrMsg(
								e
							)}`,
							flags: MessageFlags.Ephemeral,
						},
					});
					return;
				})
		)?.data;
		if (!AuthRes) return;

		// send the key to the user
		res.json({
			type: InteractionResponseType.ChannelMessageWithSource,
			data: {
				content: [
					`Are you sure you want to sign in with this key?`,
					`Username: [\`${AuthRes.login}\`](${AuthRes.html_url})`,
				].join("\n"),
				flags: MessageFlags.Ephemeral,
				// ACCEPT/REJECT BUTTONS
				components: [
					{
						type: ComponentType.ActionRow,
						components: [
							{
								type: ComponentType.Button,
								style: ButtonStyle.Success,
								label: "Yes",
								custom_id: `accept-${userId}`,
							},
							{
								type: ComponentType.Button,
								style: ButtonStyle.Danger,
								label: "No",
								custom_id: `reject-${userId}`,
							},
						],
					},
				],
			},
		});

		// handle the accept buttons
		IntEmitter.on(`accept-${userId}`, async (res) => {
			// add the key to the database
			// initialize the user
			const InitUserResult = await InitUser({
				discord: {
					id: userId,
				},
				github: {
					id: AuthRes.id.toString(),
					login: AuthRes.login,
					type: AuthRes.type,
					access_token: encryptToken(key),
				},
			});

			if (!InitUserResult)
				return res.json({
					type: InteractionResponseType.ChannelMessageWithSource,
					data: {
						content:
							"An error occured while adding your private key",
						flags: MessageFlags.Ephemeral,
					},
				});

			// send success message
			res.json({
				type: InteractionResponseType.UpdateMessage,
				data: {
					content: "Your private key has been added successfully!\nFor information on how to use gitbot please see [this guide](https://noro.cc/gitbot/guide?success)",
					components: [],
					flags: MessageFlags.Ephemeral,
				},
			});
			removeAcceptRejectBtns();
			return;
		});

		// handle reject
		IntEmitter.on(`reject-${userId}`, async (res) => {
			// send the rejection message
			res.json({
				type: InteractionResponseType.UpdateMessage,
				data: {
					content: "Beep boop, process terminated!",
					components: [],
					flags: MessageFlags.Ephemeral,
				},
			});
			removeAcceptRejectBtns();
			return;
		});

		// remove the listeners
		IntEmitter.removeAllListeners(`keysubmit-${userId}`);
		// remove button listeners after 10 mins
		setTimeout(() => {
			removeAcceptRejectBtns();
		}, 10 * 60 * 1000);
		return;
	});

	return;

	function removeAcceptRejectBtns() {
		IntEmitter.removeAllListeners(`accept-${userId}`);
		IntEmitter.removeAllListeners(`reject-${userId}`);
	}
}
