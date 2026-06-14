import { StreakModel } from "./schema.js";

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function yesterdayUTC(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Record a GitHub action for a Discord user.
 * Call this whenever the user successfully completes an issue/PR action.
 */
export async function recordAction(discordId: string): Promise<void> {
  const today = todayUTC();
  const yesterday = yesterdayUTC();

  const doc = (await StreakModel.findOne({ discordId })) ?? new StreakModel({ discordId });

  const last = doc.lastActiveDay;

  if (last === today) {
    // Already logged today — just bump total
    doc.totalActions += 1;
  } else if (last === yesterday) {
    // Consecutive day
    doc.currentStreak += 1;
    doc.totalActions += 1;
    doc.lastActiveDay = today;
  } else {
    // Gap or first action
    doc.currentStreak = 1;
    doc.totalActions += 1;
    doc.lastActiveDay = today;
  }

  if (doc.currentStreak > doc.longestStreak) {
    doc.longestStreak = doc.currentStreak;
  }

  await doc.save();
}

export async function getStreak(discordId: string) {
  return StreakModel.findOne({ discordId });
}
