import express, { Application } from "express";
import {
	verifyKeyMiddleware,
	CommandData,
	getOptionsValue,
	getSub,
	IntEmitter,
	EnvVar,
} from "./utils";
import {
	InteractionResponseType,
	InteractionType,
	MessageFlags,
	APIMessageComponentInteractionData as MessageComponentData,
	APIModalSubmission,
	APIInteraction,
	APIChatInputApplicationCommandInteraction,
} from "discord-api-types/v10";
import fs from "fs";
import path from "path";
import { connect } from "mongoose";

// routers
import github from "./routers/github";

const env = EnvVar();

const app: Application = express();

const commands: Map<string, CommandData> = new Map();
cacheCommands();

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

			// run command
			const result = await (
				await runCommand(interaction.data?.name!)
			)(
				res,
				interaction,
				getSub(interaction.data?.options?.at(0)),
				interaction.data?.options
					? getOptionsValue(interaction.data?.options)
					: undefined
			);
			// if command not found or an error happened
			if (result) {
				res.json({
					type: InteractionResponseType.ChannelMessageWithSource,
					data: {
						content: "An error has occurred while executing the command.",
						flags: MessageFlags.Ephemeral,
					},
				});
			}
			return;
		} else return;
	}
);

app.listen(env.PORT, async () => {
	if (!env.MONGO_URI) throw Error("Mongo URI is not specified.");
	connect(env.MONGO_URI!).then((c) =>
		console.log(`Connected to "${c.connection.name}" on "${c.connection.host}"`)
	);
	console.log(`Started and running on port ${env.PORT}`);
});

async function cacheCommands(dir: string = "./commands") {
	const filePath = path.join(__dirname, dir);
	const files = fs.readdirSync(filePath);
	for (const file of files) {
		const stat = fs.lstatSync(path.join(filePath, file));
		if (stat.isDirectory()) {
			await cacheCommands(path.join(dir, file));
		}
		if (file.startsWith("mod.")) {
			const { default: Command } = await import(
				path.join(__dirname, dir, file)
			);
			commands.set(Command.name, Command);
		}
	}
}

async function runCommand(name: string) {
	const Command = commands.get(name);
	if (Command) {
		return Command.run;
	}
	return function () {
		return false;
	};
}
