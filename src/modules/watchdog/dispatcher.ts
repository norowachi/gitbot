/**
 * Event dispatcher — maps GitHub event type + action to the correct embed
 * builder and decides whether a given watch config cares about this event.
 */

import type { WatchEvent } from "./schema.js";
import type { WatchdogEmbed } from "./embeds.js";
import * as E from "./embeds.js";

// ─── Event routing table ──────────────────────────────────────────────────────

export type GitHubEventType =
  | "issues"
  | "issue_comment"
  | "pull_request"
  | "pull_request_review"
  | "push"
  | "release"
  | "create"
  | "delete"
  | "star"
  | "fork"
  | "discussion"
  | "watch";

/**
 * Route a raw GitHub webhook payload to zero or more Discord embeds.
 * Returns an empty array if the event/action is not handled or if the
 * watch config doesn't subscribe to it.
 */
export function dispatchEvent(
  githubEvent: string,
  payload: any,
  watchFilter: WatchEvent
): WatchdogEmbed[] {
  const action: string = payload?.action ?? "";
  const embeds: WatchdogEmbed[] = [];

  switch (githubEvent as GitHubEventType) {
    // ── Issues ──────────────────────────────────────────────────────────────
    case "issues":
      if (!["issues", "both", "all"].includes(watchFilter)) break;
      if (action === "opened") embeds.push(E.issueOpenedEmbed(payload));
      if (action === "closed") embeds.push(E.issueClosedEmbed(payload));
      if (action === "reopened") embeds.push(E.issueReopenedEmbed(payload));
      if (action === "labeled" || action === "unlabeled") embeds.push(E.issueLabeledEmbed(payload));
      if (action === "assigned" || action === "unassigned")
        embeds.push(E.issueAssignedEmbed(payload));
      break;

    case "issue_comment":
      if (!["issues", "both", "all"].includes(watchFilter)) break;
      if (action === "created") embeds.push(E.issueCommentEmbed(payload));
      break;

    // ── Pull Requests ───────────────────────────────────────────────────────
    case "pull_request":
      if (!["pulls", "both", "all"].includes(watchFilter)) break;
      if (action === "opened") embeds.push(E.prOpenedEmbed(payload));
      if (action === "closed") {
        if (payload.pull_request?.merged) embeds.push(E.prMergedEmbed(payload));
        else embeds.push(E.prClosedEmbed(payload));
      }
      if (action === "ready_for_review") embeds.push(E.prReadyEmbed(payload));
      break;

    case "pull_request_review":
      if (!["pulls", "both", "all"].includes(watchFilter)) break;
      if (action === "submitted") embeds.push(E.prReviewEmbed(payload));
      break;

    // ── Push ────────────────────────────────────────────────────────────────
    case "push":
      if (watchFilter !== "all") break;
      // Ignore branch deletions (those come through the delete event)
      if (payload.commits?.length > 0) embeds.push(E.pushEmbed(payload));
      break;

    // ── Releases ────────────────────────────────────────────────────────────
    case "release":
      if (!["releases", "all"].includes(watchFilter)) break;
      embeds.push(E.releaseEmbed(payload));
      break;

    // ── Branches / Tags ─────────────────────────────────────────────────────
    case "create":
      if (watchFilter !== "all") break;
      embeds.push(E.createDeleteEmbed(payload, "created"));
      break;

    case "delete":
      if (watchFilter !== "all") break;
      embeds.push(E.createDeleteEmbed(payload, "deleted"));
      break;

    // ── Stars / Forks ────────────────────────────────────────────────────────
    case "star":
      if (watchFilter !== "all") break;
      embeds.push(E.starEmbed(payload));
      break;

    case "fork":
      if (watchFilter !== "all") break;
      embeds.push(E.forkEmbed(payload));
      break;

    // ── Discussions ──────────────────────────────────────────────────────────
    case "discussion":
      if (watchFilter !== "all") break;
      embeds.push(E.discussionEmbed(payload));
      break;

    default:
      break;
  }

  return embeds;
}

/**
 * Build the list of GitHub event names to subscribe to for a given WatchEvent filter.
 * This is passed to the GitHub webhook API when registering/updating the hook.
 */
export function githubEventNames(filter: WatchEvent): string[] {
  switch (filter) {
    case "issues":
      return ["issues", "issue_comment"];
    case "pulls":
      return ["pull_request", "pull_request_review"];
    case "releases":
      return ["release"];
    case "both":
      return ["issues", "issue_comment", "pull_request", "pull_request_review"];
    case "all":
      return [
        "issues",
        "issue_comment",
        "pull_request",
        "pull_request_review",
        "push",
        "release",
        "create",
        "delete",
        "star",
        "fork",
        "discussion",
      ];
  }
}
