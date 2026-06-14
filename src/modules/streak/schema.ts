import { Schema, model, type Document } from "mongoose";

export interface IStreak extends Document {
  discordId: string;
  currentStreak: number;
  longestStreak: number;
  /** ISO date string of the last recorded activity day (YYYY-MM-DD) */
  lastActiveDay: string;
  totalActions: number;
}

const StreakSchema = new Schema<IStreak>({
  discordId: { type: String, required: true, unique: true },
  currentStreak: { type: Number, default: 0 },
  longestStreak: { type: Number, default: 0 },
  lastActiveDay: { type: String, default: "" },
  totalActions: { type: Number, default: 0 },
});

export const StreakModel = model<IStreak>("Streak", StreakSchema);
