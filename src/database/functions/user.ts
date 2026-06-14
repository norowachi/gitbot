import type { DBUser, DBUserDoc, InitUserOptions } from "@database/interfaces/user.js";
import { UserEnums } from "@database/interfaces/user.js";
import UserModel from "@database/schemas/user.js";

// ─── Create / Upsert ──────────────────────────────────────────────────────────

/**
 * Creates or updates a user document.
 *
 * Conflict rules:
 * - If the **same Discord ID is already linked to a different GitHub account**, reject.
 * - If the **same GitHub ID is already linked to a different Discord account**, reject.
 * - If the **same Discord ID + same GitHub ID** are re-linking (e.g. rotating a PAT),
 *   the `access_token` is updated in place and the existing document is returned.
 *   This is the token-rotation path.
 *
 * Returns a string error message on unresolvable conflict, the document on success.
 */
export async function InitUser(options: InitUserOptions): Promise<string | DBUserDoc> {
  const byDiscord = await getUser({ discordId: options.discord.id });
  const byGithub = await getUser({ githubId: options.github.id });

  // Same user re-linking → rotate token
  if (byDiscord && byDiscord.github.id === options.github.id) {
    byDiscord.github.access_token = options.github.access_token;
    byDiscord.github.login = options.github.login; // login may have changed
    await byDiscord.save().catch(() => {});
    return byDiscord;
  }

  // Discord ID already linked to a *different* GitHub account
  if (byDiscord) return UserEnums.DiscordLinked;

  // GitHub ID already linked to a *different* Discord account
  if (byGithub) return UserEnums.GithubLinked;

  // Fresh link
  const doc = await UserModel.create({
    discord: options.discord,
    github: options.github,
  } as DBUser).catch(() => null);

  return doc ?? "An unexpected error occurred while creating your account.";
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getUser({
  discordId,
  githubId,
}: {
  discordId?: string;
  githubId?: string;
}): Promise<DBUserDoc | null> {
  return UserModel.findOne<DBUserDoc>({
    $or: [{ "discord.id": discordId }, { "github.id": githubId }],
  });
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function DeleteUser({
  discordId,
  githubId,
}: {
  discordId?: string;
  githubId?: string;
}): Promise<DBUserDoc | null> {
  return UserModel.findOneAndDelete({
    $or: [{ "discord.id": discordId }, { "github.id": githubId }],
  });
}

// ─── Update ───────────────────────────────────────────────────────────────────

/**
 * Merges partial settings into the user document and persists.
 * For `issues` arrays, existing per-repo entries are updated in-place;
 * new repo entries are appended.
 */
export async function editUserSettings(
  discordId: string,
  settings: Partial<DBUser["settings"]>
): Promise<void> {
  const doc = await getUser({ discordId });
  if (!doc) return;

  if (settings.misc) {
    Object.assign(doc.settings.misc, settings.misc);
  }

  if (settings.issues) {
    for (const incoming of settings.issues) {
      const existing = doc.settings.issues.find(
        (i) =>
          i.owner.toLowerCase() === incoming.owner.toLowerCase() &&
          i.repo.toLowerCase() === incoming.repo.toLowerCase()
      );
      if (existing) {
        Object.assign(existing, incoming);
      } else {
        doc.settings.issues.push(incoming);
      }
    }
  }

  await doc.save().catch(() => {});
}
