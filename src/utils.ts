import nacl from "tweetnacl";
import type { Request, Response, NextFunction } from "express";
import {
	RESTPostAPIApplicationCommandsJSONBody,
	APIApplicationCommandInteractionDataOption,
	ApplicationCommandOptionType,
	ButtonStyle,
	APIApplicationCommandInteraction,
	APIButtonComponent,
	InteractionResponseType,
	InteractionType,
	MessageFlags,
} from "discord-api-types/v10";
import { EventEmitter } from "events";
import path from "path";
import fs from "fs";
import { config } from "dotenv";

config();

export function EnvVar() {
	const envObj = {
		SITE_URL: process.env.SITE_URL || "http://localhost:5000",
		MONGO_URI: process.env.MONGO_URI,
		PORT: process.env.PORT || 5000,
		DISCORD_API_URL:
			process.env.DISCORD_API_URL || "https://discord.com/api/v10",
		DISCORD_APP_TOKEN: process.env.DISCORD_APP_TOKEN,
		DISCORD_APP_ID: process.env.DISCORD_APP_ID,
		DISCORD_APP_PUBLIC_KEY: process.env.DISCORD_APP_PUBLIC_KEY,
		GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
		GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
	};

	const missing = Object.entries(envObj).find((key) => !key[1]);
	if (missing) {
		throw new Error(`Value for "${missing[0]}" is missing`);
	}
	return envObj;
}

export const ghLinks = new Map();

class MyEmitter extends EventEmitter {
	emit(event: string | any, args: any[]): boolean {
		const response = args[0] as Response;

		// remove listener after 30mins
		setTimeout(() => {
			if (!event) return;
			super.removeAllListeners(event);
			response.json({
				type: InteractionResponseType.UpdateMessage,
				data: {
					components: [
						{
							label: "Interaction timed out!",
							custom_id: "timedoutbtn",
							disabled: true,
							style: ButtonStyle.Danger,
						} as APIButtonComponent,
					],
				},
			});
		}, 30 * 60 * 1000);

		// Call the original emit method to emit the event
		const result = super.emit(event, ...args);
		// check if response not sent then send
		if (!result && response.writable) {
			response.json({
				type: InteractionResponseType.ChannelMessageWithSource,
				data: {
					content: "An Unkown Error Has Occured!",
					flags: MessageFlags.Ephemeral,
				},
			});
			return false;
		}
		return result;
	}
}

export const IntEmitter = new MyEmitter();

/**
 * The data for a command.
 * @property name - The name of the command.
 * @property description - The description of the command.
 * @property category - The category of the command.
 * @property run - The function to run when the command is called.
 */
export interface CommandData
	extends Omit<
		RESTPostAPIApplicationCommandsJSONBody,
		"id" | "application_id"
	> {
	/**
	 * | NAME | TYPE | DESCRIPTION
	 * | --- | --- | --- |
	 * | `GUILD` | 0 | Interaction can be used within servers
	 * | `BOT_DM` | 1 | Interaction can be used within DMs with the app's bot user
	 * | `PRIVATE_CHANNEL` | 2 | Interaction can be used within Group DMs and DMs other than the app's bot user
	 */
	contexts: number[];
	/**
	 *
	 * | TYPE | ID | DESCRIPTION
	 * | --- | --- | --- |
	 * | `GUILD_INSTALL` | 0 |App is installable to servers
	 * | `USER_INSTALL` | 1 | App is installable to users
	 */
	integration_types: number[];
	/**
	 *
	 * @param res Response object
	 * @param interaction Interaction object
	 * @param sub subcommand group and subcommand if any in [subcommand group, subcommand] or [subcommand]
	 * @param options options object filteredas a Record of key option name
	 * @returns
	 */
	run: (
		res: Response,
		interaction: APIApplicationCommandInteraction,
		sub?: string[],
		options?: Map<string, any>
	) => boolean | void | Promise<boolean | void>;
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

export async function getInteractionCommands(
	commands: any[],
	dir = "./commands"
) {
	try {
		const filePath = path.join(__dirname, dir);
		const files = fs.readdirSync(filePath);
		for (const file of files) {
			const stat = fs.lstatSync(path.join(filePath, file));
			if (stat.isDirectory()) {
				await getInteractionCommands(commands, path.join(dir, file));
			}
			if (file.startsWith("mod")) {
				let { default: Command } = await import(
					path.join(__dirname, dir, file)
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

export function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export function DateInISO(shard_id: number | null = null) {
	return (
		ChangeConsoleColor("FgCyan", "[" + new Date().toISOString() + "] ") +
		(shard_id !== null ? ChangeConsoleColor("FgMagenta", `[${shard_id}] `) : "")
	);
}

export const ConsoleColors = {
	Reset: "\x1b[0m",
	Bright: "\x1b[1m",
	Dim: "\x1b[2m",
	Underscore: "\x1b[4m",
	Blink: "\x1b[5m",
	Reverse: "\x1b[7m",
	Hidden: "\x1b[8m",

	FgBlack: "\x1b[30m",
	FgRed: "\x1b[31m",
	FgGreen: "\x1b[32m",
	FgYellow: "\x1b[33m",
	FgBlue: "\x1b[34m",
	FgMagenta: "\x1b[35m",
	FgCyan: "\x1b[36m",
	FgWhite: "\x1b[37m",

	BgBlack: "\x1b[40m",
	BgRed: "\x1b[41m",
	BgGreen: "\x1b[42m",
	BgYellow: "\x1b[43m",
	BgBlue: "\x1b[44m",
	BgMagenta: "\x1b[45m",
	BgCyan: "\x1b[46m",
	BgWhite: "\x1b[47m",
};

export function ChangeConsoleColor(
	color: keyof typeof ConsoleColors,
	value: string
) {
	return `${ConsoleColors[color]}${value}${ConsoleColors.Reset}`;
}
