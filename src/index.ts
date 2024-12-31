import express, { Application } from "express";
import {
	verifyKeyMiddleware,
	IntEmitter,
	CommandData,
	env,
	commandsData,
	decryptToken,
	getOptionsValue,
	getSub,
	ChangeConsoleColor,
	DateInISO,
	runCommand,
	runCommandAutoComplete,
	getFocusedField,
	rest,
} from "@utils";
import {
	InteractionResponseType,
	InteractionType,
	MessageFlags,
	APIInteraction,
	APIChatInputApplicationCommandInteraction,
	Routes,
	RESTGetCurrentApplicationResult,
} from "discord-api-types/v10";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { connect } from "mongoose";
import { getUser } from "@database/functions/user.js";
import { Octokit } from "@octokit/rest";

// routers
import github from "@/routers/github.js";

const app: Application = express();

// cache the commands
cacheCommands(commandsData);

// update bot's "about me"
rest.req("PATCH", Routes.currentApplication(), {
	body: {
		description: [
			`**Version** \`${execSync("git rev-parse HEAD")
				.toString()
				.slice(0, 7)}\``,
			``,
			`Integration of the Discord and GitHub API, so you can submit your bugs (and memleaks!) without stopping your conversation :D`,
			`**Terms**: https://noro.cc/gitbot/terms`,
			`**Privacy Policy**: https://noro.cc/gitbot/privacy`,
			``,
			`Not affiliated with either Discord nor GitHub.`,
			`Disclaimer; avatar & banner belong to https://jasonlong.me`,
		].join("\n"),
	},
});

const PubKey = (
	(await rest.req(
		"GET",
		Routes.currentApplication()
	)) as RESTGetCurrentApplicationResult
).verify_key;

// using github router
app.use("/github", github);

// the interactions endpoint
app.post("/interactions", verifyKeyMiddleware(PubKey), async (req, res) => {
	let interaction: APIInteraction = req.body;

	// if its an autocomplete interaction
	if (interaction.type === InteractionType.ApplicationCommandAutocomplete) {
		// get DBUser
		const DBUser = await getUser({
			discordId: interaction.user?.id || interaction.member?.user.id,
		});

		// if user isnt auth'd then ignore
		if (!(DBUser && DBUser.github.access_token)) return;

		// get the focused field
		const focused = getFocusedField(interaction.data.options!);

		// if focused field is not found then ignore
		if (!focused) return;

		// run command's autocomplete
		await (
			await runCommandAutoComplete(interaction.data.name!)
		)(
			res,
			focused,
			[
				DBUser,
				new Octokit({
					auth: decryptToken(DBUser.github.access_token),
					userAgent: "gitbot.norowa.dev",
				}),
			],
			interaction.data?.options
				? getOptionsValue(interaction.data?.options)
				: undefined
		);
		return;
	}

	console.log(
		DateInISO(),
		ChangeConsoleColor(
			"FgRed",
			interaction.user?.username ||
				interaction.member?.user.username ||
				"Unknown"
		),
		"used",
		ChangeConsoleColor(
			"FgCyan",
			(interaction.data as any)?.name,
			interaction.type
		),
		"in",
		ChangeConsoleColor(
			"FgMagenta",
			interaction.channel?.name,
			"|",
			interaction.channel?.id
		)
	);

	// if its a message component or a modal submit emit an interaction with given custom id
	if (
		interaction.type === InteractionType.MessageComponent ||
		interaction.type === InteractionType.ModalSubmit
	) {
		IntEmitter.emit(interaction.data.custom_id, res, interaction);
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
		const DBUser = await getUser({
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
		let octokit: null | Octokit = null;

		// if db user and access token exists set octokit
		if (DBUser && DBUser.github.access_token) {
			octokit = new Octokit({
				auth: decryptToken(DBUser!.github.access_token),
				userAgent: "gitbot.norowa.dev",
			});
		}

		// run command
		await (
			await runCommand(interaction.data.name!)
		)(
			res,
			octokit ? [DBUser!, octokit] : [],
			getSub(interaction.data?.options?.at(0)),
			interaction.data?.options
				? getOptionsValue(interaction.data?.options)
				: undefined
		);
		return;
	} else return;
});

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

// handle unhandled rejections
process.on("unhandledRejection", (e) => {
	console.error("unhandledRejection", e);
});
