import { Schema, model, type Document } from "mongoose";

// ─── Event filter ─────────────────────────────────────────────────────────────

export type WatchEvent = "issues" | "pulls" | "both" | "releases" | "all";

// ─── Delivery mode ────────────────────────────────────────────────────────────

/**
 * "poll"    — timed fetch (always available, no admin rights needed)
 * "webhook" — GitHub sends events in real-time via HTTP POST to SITE_URL/watchdog/hook/:id
 *             Requires the linked token to have admin:repo_hook scope on the repo.
 * "hybrid"  — webhook as primary, polling as fallback / catch-up
 */
export type DeliveryMode = "poll" | "webhook" | "hybrid";

/** State of the GitHub-side webhook registration */
export type WebhookState = "active" | "inactive" | "pending" | "failed" | "none";

// ─── Main document ────────────────────────────────────────────────────────────

export interface IWatchedRepo extends Document {
  discordId: string;
  owner: string;
  repo: string;

  /** Discord channel webhook URL to post notifications to */
  discordWebhookUrl: string;

  events: WatchEvent;
  active: boolean;

  // ── Delivery ────────────────────────────────────────────────────────────────
  deliveryMode: DeliveryMode;

  /** Polling fallback — minutes between checks (min: 5, default: 15) */
  intervalMinutes: number;
  /** Highest issue number seen (polling) */
  lastSeenIssue: number;
  /** Highest PR number seen (polling) */
  lastSeenPull: number;
  /** Timestamp of the last successful poll */
  lastPolledAt?: Date;

  // ── GitHub webhook ──────────────────────────────────────────────────────────
  /** GitHub webhook ID (numeric, as returned by the API) */
  githubHookId?: number;
  /** HMAC-SHA256 secret used to verify incoming payloads */
  hookSecret?: string;
  /** Current state of the GitHub-side webhook */
  hookState: WebhookState;
  /** Last delivery error message, if any */
  hookError?: string;
  /** When the webhook was last successfully triggered */
  lastHookDeliveryAt?: Date;

  // ── Delivery log (ring buffer, last 50 entries) ───────────────────────────
  deliveryLog: DeliveryLogEntry[];
}

export interface DeliveryLogEntry {
  ts: Date;
  source: "poll" | "webhook";
  event: string;
  repoFullName: string;
  success: boolean;
  error?: string;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const DeliveryLogEntrySchema = new Schema<DeliveryLogEntry>(
  {
    ts: { type: Date, required: true },
    source: { type: String, required: true },
    event: { type: String, required: true },
    repoFullName: { type: String, required: true },
    success: { type: Boolean, required: true },
    error: { type: String },
  },
  { _id: false }
);

const WatchedRepoSchema = new Schema<IWatchedRepo>({
  discordId: { type: String, required: true },
  owner: { type: String, required: true },
  repo: { type: String, required: true },
  discordWebhookUrl: { type: String, required: true },
  events: { type: String, enum: ["issues", "pulls", "both", "releases", "all"], default: "both" },
  active: { type: Boolean, default: true },

  deliveryMode: { type: String, enum: ["poll", "webhook", "hybrid"], default: "poll" },
  intervalMinutes: { type: Number, default: 15 },
  lastSeenIssue: { type: Number, default: 0 },
  lastSeenPull: { type: Number, default: 0 },
  lastPolledAt: { type: Date },

  githubHookId: { type: Number },
  hookSecret: { type: String },
  hookState: {
    type: String,
    enum: ["active", "inactive", "pending", "failed", "none"],
    default: "none",
  },
  hookError: { type: String },
  lastHookDeliveryAt: { type: Date },

  deliveryLog: { type: [DeliveryLogEntrySchema], default: [] },
});

WatchedRepoSchema.index({ owner: 1, repo: 1, discordId: 1 }, { unique: true });
WatchedRepoSchema.index({ githubHookId: 1 }, { sparse: true });

export const WatchedRepoModel = model<IWatchedRepo>("WatchedRepo", WatchedRepoSchema);
