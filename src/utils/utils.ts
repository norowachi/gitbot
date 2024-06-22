import type { Request, Response, NextFunction } from "express";
import {
	APIInteraction,
	InteractionResponseType,
	InteractionType,
	RESTPatchAPIInteractionOriginalResponseJSONBody,
	Routes,
} from "discord-api-types/v10";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { config } from "dotenv";
import { CommandData, CustomIntEmitter } from "@utils";
import DiscordRestClient from "./rest.js";

// export the everything from here
export { default as DiscordRestClient } from "./rest.js";
export * from "./interfaces/index.js";
export * from "./functions/index.js";
export * from "./constants/index.js";

config();

export const env = {
	PORT: process.env.PORT || 5000,
	get SITE_URL() {
		return (
			process.env.SITE_URL?.replace(/\/$/, "") ||
			`http://localhost:${this.PORT}`
		);
	},
	MONGO_URI: process.env.MONGO_URI!,
	DISCORD_API_URL: process.env.DISCORD_API_URL || "https://discord.com/api/v10",
	DISCORD_APP_TOKEN: process.env.DISCORD_APP_TOKEN!,
	DISCORD_APP_ID: process.env.DISCORD_APP_ID!,
	DISCORD_APP_PUBLIC_KEY: process.env.DISCORD_APP_PUBLIC_KEY!,
	GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID!,
	GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET!,
	ENCRYPTION_KEY: process.env.ENCRYPTION_KEY!,
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
 * Emitter for interaction events, i.e. buttons, select menus or modals
 */
export const IntEmitter = new CustomIntEmitter();

/**
 * github links for verification
 */
export const ghLinks = new Map();

//! Start :)
//? Source https://github.com/discord/discord-interactions-js/blob/081656ec412ffc3e4ce7ac8c9ab48c67d9996bf5/src/index.ts#L88

/**
 * Based on environment, get a reference to the Web Crypto API's SubtleCrypto interface.
 * @returns An implementation of the Web Crypto API's SubtleCrypto interface.
 */
function getSubtleCrypto(): SubtleCrypto {
	if (typeof window !== "undefined" && window.crypto) {
		return window.crypto.subtle;
	}
	if (typeof globalThis !== "undefined" && globalThis.crypto) {
		return globalThis.crypto.subtle;
	}
	if (typeof crypto !== "undefined") {
		return crypto.subtle;
	}
	if (typeof require === "function") {
		// Cloudflare Workers are doing what appears to be a regex check to look and
		// warn for this pattern. We should never get here in a Cloudflare Worker, so
		// I am being coy to avoid detection and a warning.
		const cryptoPackage = "node:crypto";
		const crypto = require(cryptoPackage);
		return crypto.webcrypto.subtle;
	}
	throw new Error("No Web Crypto API implementation found");
}

export const subtleCrypto = getSubtleCrypto();

/**
 * Converts different types to Uint8Array.
 *
 * @param value - Value to convert. Strings are parsed as hex.
 * @param format - Format of value. Valid options: 'hex'. Defaults to utf-8.
 * @returns Value in Uint8Array form.
 */
export function valueToUint8Array(
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
			const hexVal = matches.map((byte: string) => Number.parseInt(byte, 16));
			return new Uint8Array(hexVal);
		}

		return new TextEncoder().encode(value);
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
export function concatUint8Arrays(
	arr1: Uint8Array,
	arr2: Uint8Array
): Uint8Array {
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
export async function verifyKey(
	rawBody: Uint8Array | ArrayBuffer | Buffer | string,
	signature: string,
	timestamp: string,
	clientPublicKey: string | CryptoKey
): Promise<boolean> {
	try {
		const timestampData = valueToUint8Array(timestamp);
		const bodyData = valueToUint8Array(rawBody);
		const message = concatUint8Arrays(timestampData, bodyData);
		const publicKey =
			typeof clientPublicKey === "string"
				? await subtleCrypto.importKey(
						"raw",
						valueToUint8Array(clientPublicKey, "hex"),
						{
							name: "ed25519",
							namedCurve: "ed25519",
						},
						false,
						["verify"]
				  )
				: clientPublicKey;
		const isValid = await subtleCrypto.verify(
			{
				name: "ed25519",
			},
			publicKey,
			valueToUint8Array(signature, "hex"),
			message
		);
		return isValid;
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

	return async (req: Request, res: Response, next: NextFunction) => {
		const timestamp = req.header("X-Signature-Timestamp") || "";
		const signature = req.header("X-Signature-Ed25519") || "";

		if (!timestamp || !signature) {
			res.statusCode = 401;
			res.end("[discord-interactions] Invalid signature");
			return;
		}

		async function onBodyComplete(rawBody: Buffer) {
			const isValid = await verifyKey(
				rawBody,
				signature,
				timestamp,
				clientPublicKey
			);
			if (!isValid) {
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
				await onBodyComplete(req.body);
			} else if (typeof req.body === "string") {
				await onBodyComplete(Buffer.from(req.body, "utf-8"));
			} else {
				console.warn(
					"[discord-interactions]: req.body was tampered with, probably by some other middleware. We recommend disabling middleware for interaction routes so that req.body is a raw buffer."
				);
				// Attempt to reconstruct the raw buffer. This works but is risky
				// because it depends on JSON.stringify matching the Discord backend's
				// JSON serialization.
				await onBodyComplete(Buffer.from(JSON.stringify(req.body), "utf-8"));
			}
		} else {
			const chunks: Array<Buffer> = [];
			req.on("data", (chunk) => {
				chunks.push(chunk);
			});
			req.on("end", async () => {
				const rawBody = Buffer.concat(chunks);
				await onBodyComplete(rawBody);
			});
		}
	};
}

//! End :(

// encrypt a token
export function encryptToken(token: string): string {
	// For AES, this is always 16
	const iv = randomBytes(16);
	const cipher = createCipheriv(
		"aes-256-cbc",
		Buffer.from(env.ENCRYPTION_KEY),
		iv
	);
	let encrypted = cipher.update(token);
	encrypted = Buffer.concat([encrypted, cipher.final()]);
	return iv.toString("hex") + ":" + encrypted.toString("hex");
}

// Function to decrypt a token
export function decryptToken(encryptedToken: string): string {
	const textParts = encryptedToken.split(":");
	const iv = Buffer.from(textParts.shift()!, "hex");
	const encryptedText = Buffer.from(textParts.join(":"), "hex");
	const decipher = createDecipheriv(
		"aes-256-cbc",
		Buffer.from(env.ENCRYPTION_KEY),
		iv
	);
	let decrypted = decipher.update(encryptedText);
	decrypted = Buffer.concat([decrypted, decipher.final()]);
	return decrypted.toString();
}

/**
 * Updates the @original interaction response to clears all the components
 * @param rest The Discord REST Client
 * @param interaction The interaction object
 * @returns {Promise<RESTPatchAPIInteractionOriginalResponseJSONBody>}
 */
export async function ClearComponents(
	rest: DiscordRestClient,
	interaction: APIInteraction
): Promise<RESTPatchAPIInteractionOriginalResponseJSONBody> {
	return await rest.req(
		"PATCH",
		Routes.webhookMessage(interaction.id, interaction.token, "@original"),
		{
			components: [],
		}
	);
}
