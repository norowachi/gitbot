import {
	APIInteraction,
	ApplicationCommandType,
	ButtonStyle,
	ComponentType,
	InteractionResponseType,
	MessageFlags,
} from "discord-api-types/v10";
import { CommandData, IntEmitter } from "@utils";
import { DeleteUser } from "@/database/functions/user.js";

export default {
	name: "unlink",
	description:
		"Unlink your Github Account from Gitbot and remove your saved data",
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
		// send confirmation message
		res.json({
			type: InteractionResponseType.ChannelMessageWithSource,
			data: {
				content: `Are you sure you want to unlink your account and delete saved info?`,
				flags: MessageFlags.Ephemeral,
				components: [
					{
						type: ComponentType.ActionRow,
						components: [
							{
								type: ComponentType.Button,
								style: ButtonStyle.Danger,
								custom_id: `confirm-${userId}`,
								label: "Yes",
							},
							{
								type: ComponentType.Button,
								style: ButtonStyle.Success,
								custom_id: `cancel-${userId}`,
								label: "No",
							},
						],
					},
				],
			},
		});
		// handle button click
		// handle confirmation
		IntEmitter.on(`confirm-${userId}`, async (...[res]) => {
			// remove user from db
			await DeleteUser(userId);
			// send confirmation message
			res.json({
				type: InteractionResponseType.UpdateMessage,
				data: {
					content: "Account unlinked and data deleted",
					flags: MessageFlags.Ephemeral,
					components: [],
				},
			});
			// remove listener
			IntEmitter.removeAllListeners(`confirm-${userId}`);
			return;
		});
		// handle cancel
		IntEmitter.on(`cancel-${userId}`, (...[res]) => {
			res.json({
				type: InteractionResponseType.UpdateMessage,
				data: {
					content: "Unlink cancelled.\nEnjoy your remaining time with us 😈",
					flags: MessageFlags.Ephemeral,
					components: [],
				},
			});
			// remove listener
			IntEmitter.removeAllListeners(`cancel-${userId}`);
			return;
		});
	},
} as CommandData<true>;
