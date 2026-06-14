import { Schema, model, type Document } from "mongoose";

// ─── Announcement ─────────────────────────────────────────────────────────────

export type AnnouncementTarget = "all" | "new" | "returning";
export type AnnouncementStatus = "draft" | "active" | "archived";

export interface IAnnouncement extends Document {
  /** Short slug used as a stable reference, e.g. "v2-launch" */
  slug: string;
  /** Display title shown in the embed */
  title: string;
  /** Full markdown body (rendered as embed description, ≤4000 chars) */
  body: string;
  /** Optional URL for the embed title link */
  url?: string;
  /** Hex color integer for the embed (default: Gitbot blue) */
  color: number;
  /**
   * Who to show this announcement to on their next interaction:
   *   "all"       — every linked user
   *   "new"       — users who linked after `createdAt`
   *   "returning" — users who were linked before `createdAt`
   */
  target: AnnouncementTarget;
  status: AnnouncementStatus;
  /** Discord user ID of the admin who created this */
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  /** How many users have seen this announcement so far */
  seenCount: number;
}

const AnnouncementSchema = new Schema<IAnnouncement>(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    url: { type: String },
    color: { type: Number, default: 0x5865f2 },
    target: { type: String, enum: ["all", "new", "returning"], default: "all" },
    status: { type: String, enum: ["draft", "active", "archived"], default: "draft" },
    createdBy: { type: String, required: true },
    seenCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const AnnouncementModel = model<IAnnouncement>("Announcement", AnnouncementSchema);

// ─── Seen record ──────────────────────────────────────────────────────────────

/** Records which announcements a Discord user has already received. */
export interface IAnnouncementSeen extends Document {
  discordId: string;
  announcementId: string;
  seenAt: Date;
}

const AnnouncementSeenSchema = new Schema<IAnnouncementSeen>({
  discordId: { type: String, required: true },
  announcementId: { type: String, required: true },
  seenAt: { type: Date, default: Date.now },
});

AnnouncementSeenSchema.index({ discordId: 1, announcementId: 1 }, { unique: true });

export const AnnouncementSeenModel = model<IAnnouncementSeen>(
  "AnnouncementSeen",
  AnnouncementSeenSchema
);
