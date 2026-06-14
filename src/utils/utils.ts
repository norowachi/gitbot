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
import type { CommandData } from "@utils";
import DiscordRestClient from "./rest.js";
import { CustomIntEmitter } from "./interfaces/main.js";

config();

// ─── Re-exports ───────────────────────────────────────────────────────────────

export { DiscordRestClient };
export * from "./interfaces/index.js";
export * from "./functions/index.js";
export * from "./constants/index.js";
export { log } from "./logger.js";
export { registry } from "./components.js";

// ─── Environment ──────────────────────────────────────────────────────────────

export const env = {
  PORT: process.env.PORT ?? "5000",
  get SITE_URL(): string | undefined {
    return process.env.SITE_URL?.replace(/\/$/, "");
  },
  MONGO_URI: process.env.MONGO_URI!,
  REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
  DISCORD_API_URL: process.env.DISCORD_API_URL ?? "https://discord.com/api/v10",
  DISCORD_APP_TOKEN: process.env.DISCORD_APP_TOKEN!,
  /** Ed25519 public key from the Discord Developer Portal → General Information */
  DISCORD_PUBLIC_KEY: process.env.DISCORD_PUBLIC_KEY!,
  GITHUB_CLIENT_NAME: process.env.GITHUB_CLIENT_NAME,
  GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY!,
  /** Secret header token for the /admin/* kernel API (optional; disables admin routes if unset). */
  ADMIN_TOKEN: process.env.ADMIN_TOKEN,
  /**
   * Comma-separated Discord user IDs permitted to use /announce and other admin commands.
   * e.g. "123456789,987654321"
   */
  ADMIN_DISCORD_IDS: process.env.ADMIN_DISCORD_IDS,
};

// Validate required env vars at startup
const required: (keyof typeof env)[] = [
  "MONGO_URI",
  "REDIS_URL",
  "DISCORD_APP_TOKEN",
  "DISCORD_PUBLIC_KEY",
  "ENCRYPTION_KEY",
];
for (const key of required) {
  if (!env[key]) throw new Error(`Missing required environment variable: ${key}`);
}
if (env.ENCRYPTION_KEY.length !== 32) {
  throw new Error("ENCRYPTION_KEY must be exactly 32 characters.");
}
if (!/^[0-9a-f]{64}$/i.test(env.DISCORD_PUBLIC_KEY)) {
  throw new Error("DISCORD_PUBLIC_KEY must be a 64-character hex string.");
}

// ─── Singletons ───────────────────────────────────────────────────────────────

export const rest = new DiscordRestClient(env.DISCORD_APP_TOKEN);
export const commandsData: Map<string, CommandData> = new Map();
/** In-process emitter used for short-lived modal/confirmation chains (link flow). */
export const IntEmitter = new CustomIntEmitter();
/** Pending OAuth state tokens: sha256 random → Discord user ID */
export const ghLinks = new Map<string, string>();

// ─── Crypto helpers ───────────────────────────────────────────────────────────

const KEY_BUFFER = Buffer.from(env.ENCRYPTION_KEY);

export function encryptToken(token: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", KEY_BUFFER, iv);
  const encrypted = Buffer.concat([cipher.update(token), cipher.final()]);
  return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptToken(encryptedToken: string): string {
  const [ivHex, ...rest] = encryptedToken.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const encrypted = Buffer.from(rest.join(":"), "hex");
  const decipher = createDecipheriv("aes-256-cbc", KEY_BUFFER, iv);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString();
}

// ─── Discord interaction verification ────────────────────────────────────────

function getSubtleCrypto(): SubtleCrypto {
  if (typeof globalThis !== "undefined" && globalThis.crypto) return globalThis.crypto.subtle;
  // Node 18 polyfill fallback
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { webcrypto } = require("node:crypto");
  return webcrypto.subtle;
}

const subtle = getSubtleCrypto();

async function verifyKey(
  rawBody: Buffer | string,
  signature: string,
  timestamp: string,
  publicKey: string
): Promise<boolean> {
  try {
    const enc = new TextEncoder();
    const key = await subtle.importKey(
      "raw",
      Buffer.from(publicKey, "hex"),
      { name: "ed25519", namedCurve: "ed25519" },
      false,
      ["verify"]
    );
    const body = typeof rawBody === "string" ? enc.encode(rawBody) : rawBody;
    const message = Buffer.concat([enc.encode(timestamp), body]);
    return await subtle.verify({ name: "ed25519" }, key, Buffer.from(signature, "hex"), message);
  } catch {
    return false;
  }
}

export function verifyKeyMiddleware(
  clientPublicKey: string
): (req: Request, res: Response, next: NextFunction) => void {
  return async (req, res, next) => {
    const timestamp = req.header("X-Signature-Timestamp") ?? "";
    const signature = req.header("X-Signature-Ed25519") ?? "";

    if (!timestamp || !signature) {
      res.status(401).end("Invalid signature");
      return;
    }

    const onBody = async (rawBody: Buffer) => {
      if (!(await verifyKey(rawBody, signature, timestamp, clientPublicKey))) {
        res.status(401).end("Invalid signature");
        return;
      }
      const body = JSON.parse(rawBody.toString("utf-8")) || {};
      if (body.type === InteractionType.Ping) {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ type: InteractionResponseType.Pong }));
        return;
      }
      req.body = body;
      next();
    };

    if (Buffer.isBuffer(req.body)) {
      await onBody(req.body);
    } else if (typeof req.body === "string") {
      await onBody(Buffer.from(req.body, "utf-8"));
    } else {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => onBody(Buffer.concat(chunks)));
    }
  };
}

// ─── Misc helpers ─────────────────────────────────────────────────────────────

/** Remove all action-row components from an interaction's original response. */
export async function ClearComponents(
  interaction: APIInteraction
): Promise<RESTPatchAPIInteractionOriginalResponseJSONBody> {
  return rest.req("PATCH", Routes.webhookMessage(rest.me.id, interaction.token, "@original"), {
    body: { components: [] },
  }) as Promise<RESTPatchAPIInteractionOriginalResponseJSONBody>;
}
