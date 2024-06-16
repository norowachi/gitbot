import nacl from "tweetnacl";
import type { Request, Response, NextFunction } from "express";
import {
	APIActionRowComponent,
	APIApplicationCommandInteraction,
	APIApplicationCommandInteractionDataOption,
	APIButtonComponent,
	APIEmbed,
	APIInteractionResponseCallbackData,
	APIMessageComponentInteraction,
	APIMessageComponentInteractionData,
	ApplicationCommandOptionType,
	ButtonStyle,
	ComponentType,
	InteractionResponseType,
	InteractionType,
	MessageFlags,
} from "discord-api-types/v10";
import path from "path";
import fs from "fs";
import { config } from "dotenv";
import { CommandData, CustomIntEmitter } from "./interfaces.js";
import { ConsoleColors, emojis } from "./constants.js";
import DiscordRestClient from "./rest.js";
import { RequestError } from "octokit";

// export misc interfaces from utils cuz why not
export * from "./interfaces.js";

config();

export const env = {
	SITE_URL: process.env.SITE_URL || "http://localhost:5000",
	MONGO_URI: process.env.MONGO_URI,
	PORT: process.env.PORT || 5000,
	DISCORD_API_URL: process.env.DISCORD_API_URL || "https://discord.com/api/v10",
	DISCORD_APP_TOKEN: process.env.DISCORD_APP_TOKEN,
	DISCORD_APP_ID: process.env.DISCORD_APP_ID,
	DISCORD_APP_PUBLIC_KEY: process.env.DISCORD_APP_PUBLIC_KEY,
	GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
	GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
};

const missing = Object.entries(env).find((key) => !key[1]);

if (missing) {
	throw new Error(`Value for "${missing[0]}" is missing`);
}

/**
 * Interaction Commands data
 */
export const commandsData: Map<string, CommandData> = new Map();

/**
 * Run a command
 */

export async function runCommand(name: string) {
	const Command = commandsData.get(name);
	if (Command) {
		return Command.run;
	}
	return function () {
		return false;
	};
}

/**
 * Emitter for interaction events, i.e. buttons, select menus or modals
 */
export const IntEmitter = new CustomIntEmitter();

/**
 * github links for verification
 */
export const ghLinks = new Map();

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

//! Start :)
//? Source https://github.com/discord/discord-interactions-js/blob/081656ec412ffc3e4ce7ac8c9ab48c67d9996bf5/src/index.ts#L88

/**
 * Converts different types to Uint8Array.
 *
 * @param value - Value to convert. Strings are parsed as hex.
 * @param format - Format of value. Valid options: 'hex'. Defaults to utf-8.
 * @returns Value in Uint8Array form.
 */
function valueToUint8Array(
	value: Uint8Array | ArrayBuffer | Buffer | string,
	format?: string
): Uint8Array {
	if (value == null) {
		return new Uint8Array();
	}
	if (typeof value === "string") {
		if (format === "hex") {
			const matches = value.match(/.{1,2}/g);
			if (matches == null) {
				throw new Error("Value is not a valid hex string");
			}
			const hexVal = matches.map((byte: string) => parseInt(byte, 16));
			return new Uint8Array(hexVal);
		} else {
			return new TextEncoder().encode(value);
		}
	}
	try {
		if (Buffer.isBuffer(value)) {
			return new Uint8Array(value);
		}
	} catch (ex) {
		// Runtime doesn't have Buffer
	}
	if (value instanceof ArrayBuffer) {
		return new Uint8Array(value);
	}
	if (value instanceof Uint8Array) {
		return value;
	}
	throw new Error(
		"Unrecognized value type, must be one of: string, Buffer, ArrayBuffer, Uint8Array"
	);
}

/**
 * Merge two arrays.
 *
 * @param arr1 - First array
 * @param arr2 - Second array
 * @returns Concatenated arrays
 */
function concatUint8Arrays(arr1: Uint8Array, arr2: Uint8Array): Uint8Array {
	const merged = new Uint8Array(arr1.length + arr2.length);
	merged.set(arr1);
	merged.set(arr2, arr1.length);
	return merged;
}

/**
 * Validates a payload from Discord against its signature and key.
 *
 * @param rawBody - The raw payload data
 * @param signature - The signature from the `X-Signature-Ed25519` header
 * @param timestamp - The timestamp from the `X-Signature-Timestamp` header
 * @param clientPublicKey - The public key from the Discord developer dashboard
 * @returns Whether or not validation was successful
 */
export function verifyKey(
	rawBody: Uint8Array | ArrayBuffer | Buffer | string,
	signature: Uint8Array | ArrayBuffer | Buffer | string,
	timestamp: Uint8Array | ArrayBuffer | Buffer | string,
	clientPublicKey: Uint8Array | ArrayBuffer | Buffer | string
): boolean {
	try {
		const timestampData = valueToUint8Array(timestamp);
		const bodyData = valueToUint8Array(rawBody);
		const message = concatUint8Arrays(timestampData, bodyData);

		const signatureData = valueToUint8Array(signature, "hex");
		const publicKeyData = valueToUint8Array(clientPublicKey, "hex");
		return nacl.sign.detached.verify(message, signatureData, publicKeyData);
	} catch (ex) {
		return false;
	}
}

/**
 * Creates a middleware function for use in Express-compatible web servers.
 *
 * @param clientPublicKey - The public key from the Discord developer dashboard
 * @returns The middleware function
 */
export function verifyKeyMiddleware(
	clientPublicKey: string
): (req: Request, res: Response, next: NextFunction) => void {
	if (!clientPublicKey) {
		throw new Error("You must specify a Discord client public key");
	}

	return function (req: Request, res: Response, next: NextFunction) {
		const timestamp = (req.header("X-Signature-Timestamp") || "") as string;
		const signature = (req.header("X-Signature-Ed25519") || "") as string;

		function onBodyComplete(rawBody: Buffer) {
			if (!verifyKey(rawBody, signature, timestamp, clientPublicKey)) {
				res.statusCode = 401;
				res.end("[discord-interactions] Invalid signature");
				return;
			}

			const body = JSON.parse(rawBody.toString("utf-8")) || {};
			if (body.type === InteractionType.Ping) {
				res.setHeader("Content-Type", "application/json");
				res.end(
					JSON.stringify({
						type: InteractionResponseType.Pong,
					})
				);
				return;
			}

			req.body = body;
			next();
		}

		if (req.body) {
			if (Buffer.isBuffer(req.body)) {
				onBodyComplete(req.body);
			} else if (typeof req.body === "string") {
				onBodyComplete(Buffer.from(req.body, "utf-8"));
			} else {
				console.warn(
					"[discord-interactions]: req.body was tampered with, probably by some other middleware. We recommend disabling middleware for interaction routes so that req.body is a raw buffer."
				);
				// Attempt to reconstruct the raw buffer. This works but is risky
				// because it depends on JSON.stringify matching the Discord backend's
				// JSON serialization.
				onBodyComplete(Buffer.from(JSON.stringify(req.body), "utf-8"));
			}
		} else {
			const chunks: Array<Buffer> = [];
			req.on("data", (chunk) => {
				chunks.push(chunk);
			});
			req.on("end", () => {
				const rawBody = Buffer.concat(chunks);
				onBodyComplete(rawBody);
			});
		}
	};
}

//! End :(

/**
 * returns all the commands in the commands folder
 * @param commands array to output commands into
 * @param dir where the commands at
 */
export async function getInteractionCommands(
	commands: any[],
	dir = "./commands"
) {
	try {
		const filePath = path.join(import.meta.dirname, dir);
		const files = fs.readdirSync(filePath);
		for (const file of files) {
			const stat = fs.lstatSync(path.join(filePath, file));
			if (stat.isDirectory()) {
				await getInteractionCommands(commands, path.join(dir, file));
			}
			if (file.startsWith("mod")) {
				let { default: Command } = await import(
					path.join(import.meta.url, "..", dir, file)
				);
				commands.push({
					default_member_permission: Command.default_member_permission,
					type: Command.type,
					name: Command.name,
					name_localizations: Command.name_localizations,
					description: Command.description,
					description_localizations: Command.description_localizations,
					dm_permissions: Command.dm_permissions,
					options: Command.options,
					contexts: Command.contexts,
					integration_types: Command.integration_types,
					nsfw: Command.nsfw,
				});
			}
		}
	} catch (e) {
		console.error(e);
	}
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
		ChangeConsoleColor("FgCyan", "[" + new Date().toISOString() + "] ") +
		(shard_id !== null ? ChangeConsoleColor("FgMagenta", `[${shard_id}] `) : "")
	);
}

/* change color of text in console */
export function ChangeConsoleColor(
	color: keyof typeof ConsoleColors,
	value: string
) {
	return `${ConsoleColors[color]}${value}${ConsoleColors.Reset}`;
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
			JSON.stringify({
				components: [navbtns],
			})
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

export function OctoErrMsg(req: RequestError) {
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
