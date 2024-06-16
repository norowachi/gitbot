import express, { Application } from "express";
import {
	verifyKeyMiddleware,
	CommandData,
	getOptionsValue,
	getSub,
	IntEmitter,
	env,
	commandsData,
	runCommand,
} from "./utils.js";
import {
	InteractionResponseType,
	InteractionType,
	MessageFlags,
	APIMessageComponentInteractionData as MessageComponentData,
	APIModalSubmission,
	APIInteraction,
	APIChatInputApplicationCommandInteraction,
} from "discord-api-types/v10";
import fs from "node:fs";
import path from "node:path";
import { connect } from "mongoose";
import { FindUser } from "./database/functions/user.js";
import { Octokit } from "@octokit/rest";
import StatusMonitor from "express-status-monitor";

// routers
import github from "./routers/github.js";

const app: Application = express();

app.use(StatusMonitor());

cacheCommands(commandsData);

app.use("/github", github);

app.post(
	"/interactions",
	verifyKeyMiddleware(env.DISCORD_APP_PUBLIC_KEY!),
	async (req, res) => {
		let interaction: APIInteraction = req.body;

		// if its a button emit a button event
		if (interaction.type === InteractionType.MessageComponent) {
			const intComponent = interaction.data as unknown as MessageComponentData;
			IntEmitter.emit(intComponent.custom_id, [res, interaction]);
			return;
		}

		if (interaction.type === InteractionType.ModalSubmit) {
			const intComponent = interaction.data as unknown as APIModalSubmission;
			IntEmitter.emit(intComponent.custom_id, [res, interaction]);
			return;
		}

		// respond to a ping from discord
		if (interaction.type === InteractionType.Ping) {
			return res.json({
				type: InteractionResponseType.Pong,
			});
		}

		// if its an application command
		if (interaction.type === InteractionType.ApplicationCommand) {
			interaction = interaction as APIChatInputApplicationCommandInteraction;

			// get DBUser
			const DBUser = await FindUser({
				discordId: interaction.user?.id || interaction.member?.user.id,
			});
			// if command is not `link` and user is not in db, say nuh uh
			if (interaction.data.name !== "link" && !DBUser) {
				return res.json({
					type: InteractionResponseType.ChannelMessageWithSource,
					data: {
						content:
							"You have to link your github account first, please use the `/link` command.",
						flags: MessageFlags.Ephemeral,
					},
				});
			}

			// initialize octokit
			const octokit = new Octokit({
				auth: DBUser?.github.access_token,
				userAgent: "GitBot@norowa.dev",
			});

			// run command
			await (
				await runCommand(interaction.data.name!)
			)(
				res,
				interaction,
				interaction.data.name !== "link" ? [DBUser!, octokit] : [],
				getSub(interaction.data?.options?.at(0)),
				interaction.data?.options
					? getOptionsValue(interaction.data?.options)
					: undefined
			);
			return;
		} else return;
	}
);

app.listen(env.PORT, async () => {
	connect(env.MONGO_URI!)
		.then((c) =>
			console.log(
				`Connected to "${c.connection.name}" on "${c.connection.host}"`
			)
		)
		.catch((e) =>
			console.log(`Couldn't connect to the database, Error:\n${e}`)
		);
	console.log(`Started and running on port ${env.PORT}`);
});

async function cacheCommands(
	commands: Map<string, CommandData>,
	dir: string = "./commands"
) {
	const filePath = path.join(import.meta.dirname, dir);
	const files = fs.readdirSync(filePath);
	for (const file of files) {
		const stat = fs.lstatSync(path.join(filePath, file));
		if (stat.isDirectory()) {
			await cacheCommands(commands, path.join(dir, file));
		}
		if (file.startsWith("mod.")) {
			const { default: Command } = await import(
				path.join(import.meta.url, "..", dir, file)
			);
			commands.set(Command.name, Command);
		}
	}
}
