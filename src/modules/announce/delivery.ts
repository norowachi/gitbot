import type { APIEmbed } from "discord-api-types/v10";
import { AnnouncementModel, AnnouncementSeenModel, type IAnnouncement } from "./schema.js";
import { rest, log, truncate, LIMITS } from "@utils";

// ─── Embed builder ────────────────────────────────────────────────────────────

export function buildAnnouncementEmbed(ann: IAnnouncement): APIEmbed {
  return {
    title: truncate(ann.title, LIMITS.EMBED_TITLE),
    url: ann.url,
    description: truncate(ann.body, LIMITS.EMBED_DESCRIPTION).replace(/\n/g, "\n"),
    color: ann.color,
    footer: {
      text: `Gitbot Announcement · ${ann.slug}`,
    },
    timestamp: ann.createdAt.toISOString(),
  };
}

// ─── Eligibility ──────────────────────────────────────────────────────────────

/**
 * Returns every active announcement that this user hasn't seen yet,
 * filtered by the announcement's `target` audience.
 *
 * @param discordId     The user's Discord ID
 * @param userLinkedAt  When the user first linked their GitHub account
 */
export async function getPendingAnnouncements(
  discordId: string,
  userLinkedAt: Date
): Promise<IAnnouncement[]> {
  const active = await AnnouncementModel.find({ status: "active" }).lean();
  if (!active.length) return [];

  // Which ones has this user already seen?
  const seenDocs = await AnnouncementSeenModel.find({
    discordId,
    announcementId: { $in: active.map((a) => String(a._id)) },
  }).lean();

  const seenIds = new Set(seenDocs.map((s) => s.announcementId));

  return (
    active
      .filter((ann) => {
        if (seenIds.has(String(ann._id))) return false;

        const linkedAfterCreation = userLinkedAt > ann.createdAt;

        switch (ann.target) {
          case "all":
            return true;
          case "new":
            return linkedAfterCreation;
          case "returning":
            return !linkedAfterCreation;
        }
      })
      // Cast back to full document type (lean() strips methods but type is still fine here)
      .map((a) => a as unknown as IAnnouncement)
  );
}

// ─── Mark as seen ─────────────────────────────────────────────────────────────

export async function markSeen(discordId: string, announcementId: string): Promise<void> {
  await AnnouncementSeenModel.updateOne(
    { discordId, announcementId },
    { $setOnInsert: { discordId, announcementId, seenAt: new Date() } },
    { upsert: true }
  ).catch(() => {});

  await AnnouncementModel.updateOne({ _id: announcementId }, { $inc: { seenCount: 1 } }).catch(
    () => {}
  );
}

// ─── DM delivery ─────────────────────────────────────────────────────────────

/**
 * Attempt to send an announcement to a user via Discord DM.
 * Returns true if the DM was successfully opened and the message sent.
 * Silent on failure (user may have DMs disabled).
 */
export async function deliverViaDM(discordId: string, ann: IAnnouncement): Promise<boolean> {
  try {
    // Open (or fetch existing) DM channel
    const dmChannel = (await rest.req("POST", "/users/@me/channels", {
      body: { recipient_id: discordId },
    })) as { id?: string } | null;

    if (!dmChannel?.id) return false;

    await rest.req("POST", `/channels/${dmChannel.id}/messages`, {
      body: {
        embeds: [buildAnnouncementEmbed(ann)],
      },
    });

    await markSeen(discordId, String(ann._id));
    log.debug({ discordId, slug: ann.slug }, "[Announce] DM delivered");
    return true;
  } catch (err) {
    log.debug({ err, discordId, slug: ann.slug }, "[Announce] DM delivery failed (silent)");
    return false;
  }
}
