/**
 * Discord embed builders for every GitHub event type the watchdog handles.
 * Each function returns a Discord-API-compatible embed object.
 */

export interface WatchdogEmbed {
  title: string;
  url?: string;
  description?: string;
  color: number;
  fields: { name: string; value: string; inline?: boolean }[];
  timestamp: string;
  footer?: { text: string };
  author?: { name: string; icon_url?: string; url?: string };
}

function truncate(s: string | null | undefined, max = 200): string | undefined {
  if (!s) return undefined;
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function authorField(login: string | undefined, avatarUrl?: string, profileUrl?: string) {
  if (!login) return undefined;
  return { name: login, icon_url: avatarUrl, url: profileUrl };
}

// ─── Issues ───────────────────────────────────────────────────────────────────

export function issueOpenedEmbed(payload: any): WatchdogEmbed {
  const { issue, repository } = payload;
  const labels = issue.labels?.map((l: any) => `\`${l.name}\``).join(", ") || "None";
  return {
    title: `🐛 Issue #${issue.number} opened: ${issue.title}`,
    url: issue.html_url,
    description: truncate(issue.body),
    color: 0x2da44e,
    author: authorField(issue.user?.login, issue.user?.avatar_url, issue.user?.html_url),
    fields: [
      { name: "Repo", value: repository.full_name, inline: true },
      { name: "Labels", value: labels, inline: true },
      { name: "Milestone", value: issue.milestone?.title ?? "None", inline: true },
    ],
    timestamp: issue.created_at,
  };
}

export function issueClosedEmbed(payload: any): WatchdogEmbed {
  const { issue, repository } = payload;
  const reason = issue.state_reason ?? "completed";
  return {
    title: `✅ Issue #${issue.number} closed (${reason}): ${issue.title}`,
    url: issue.html_url,
    color: 0x8250df,
    author: authorField(
      payload.sender?.login,
      payload.sender?.avatar_url,
      payload.sender?.html_url
    ),
    fields: [
      { name: "Repo", value: repository.full_name, inline: true },
      { name: "Opened by", value: issue.user?.login ?? "unknown", inline: true },
    ],
    timestamp: issue.closed_at ?? new Date().toISOString(),
  };
}

export function issueReopenedEmbed(payload: any): WatchdogEmbed {
  const { issue, repository } = payload;
  return {
    title: `🔄 Issue #${issue.number} reopened: ${issue.title}`,
    url: issue.html_url,
    color: 0xe3b341,
    author: authorField(payload.sender?.login, payload.sender?.avatar_url),
    fields: [{ name: "Repo", value: repository.full_name, inline: true }],
    timestamp: new Date().toISOString(),
  };
}

export function issueCommentEmbed(payload: any): WatchdogEmbed {
  const { issue, comment, repository } = payload;
  return {
    title: `💬 Comment on Issue #${issue.number}: ${issue.title}`,
    url: comment.html_url,
    description: truncate(comment.body),
    color: 0x57a0d3,
    author: authorField(comment.user?.login, comment.user?.avatar_url, comment.user?.html_url),
    fields: [{ name: "Repo", value: repository.full_name, inline: true }],
    timestamp: comment.created_at,
  };
}

export function issueLabeledEmbed(payload: any): WatchdogEmbed {
  const { issue, label, repository } = payload;
  const action = payload.action; // "labeled" | "unlabeled"
  return {
    title: `🏷️ Issue #${issue.number} ${action}: \`${label?.name}\``,
    url: issue.html_url,
    color: action === "labeled" ? 0x2da44e : 0xcf222e,
    author: authorField(payload.sender?.login, payload.sender?.avatar_url),
    fields: [{ name: "Repo", value: repository.full_name, inline: true }],
    timestamp: new Date().toISOString(),
  };
}

export function issueAssignedEmbed(payload: any): WatchdogEmbed {
  const { issue, assignee, repository } = payload;
  const action = payload.action; // "assigned" | "unassigned"
  return {
    title: `👤 Issue #${issue.number} ${action} to ${assignee?.login ?? "unknown"}`,
    url: issue.html_url,
    color: 0x57a0d3,
    author: authorField(payload.sender?.login, payload.sender?.avatar_url),
    fields: [{ name: "Repo", value: repository.full_name, inline: true }],
    timestamp: new Date().toISOString(),
  };
}

// ─── Pull Requests ────────────────────────────────────────────────────────────

export function prOpenedEmbed(payload: any): WatchdogEmbed {
  const { pull_request: pr, repository } = payload;
  return {
    title: `🔀 PR #${pr.number} opened: ${pr.title}`,
    url: pr.html_url,
    description: truncate(pr.body),
    color: 0x2da44e,
    author: authorField(pr.user?.login, pr.user?.avatar_url, pr.user?.html_url),
    fields: [
      { name: "Repo", value: repository.full_name, inline: true },
      { name: "Branch", value: `\`${pr.head.ref}\` → \`${pr.base.ref}\``, inline: true },
      { name: "Draft", value: pr.draft ? "Yes" : "No", inline: true },
    ],
    timestamp: pr.created_at,
  };
}

export function prMergedEmbed(payload: any): WatchdogEmbed {
  const { pull_request: pr, repository } = payload;
  return {
    title: `🎉 PR #${pr.number} merged: ${pr.title}`,
    url: pr.html_url,
    color: 0x8250df,
    author: authorField(pr.merged_by?.login, pr.merged_by?.avatar_url, pr.merged_by?.html_url),
    fields: [
      { name: "Repo", value: repository.full_name, inline: true },
      { name: "Branch", value: `\`${pr.head.ref}\` → \`${pr.base.ref}\``, inline: true },
      { name: "Commits", value: String(pr.commits), inline: true },
    ],
    timestamp: pr.merged_at ?? new Date().toISOString(),
  };
}

export function prClosedEmbed(payload: any): WatchdogEmbed {
  const { pull_request: pr, repository } = payload;
  return {
    title: `❌ PR #${pr.number} closed without merging: ${pr.title}`,
    url: pr.html_url,
    color: 0xcf222e,
    author: authorField(payload.sender?.login, payload.sender?.avatar_url),
    fields: [{ name: "Repo", value: repository.full_name, inline: true }],
    timestamp: new Date().toISOString(),
  };
}

export function prReviewEmbed(payload: any): WatchdogEmbed {
  const { review, pull_request: pr, repository } = payload;
  const stateEmoji: Record<string, string> = {
    approved: "✅",
    changes_requested: "🔁",
    commented: "💬",
    dismissed: "🚫",
  };
  const emoji = stateEmoji[review.state?.toLowerCase()] ?? "👀";
  return {
    title: `${emoji} Review on PR #${pr.number}: ${review.state?.toUpperCase()}`,
    url: review.html_url,
    description: truncate(review.body),
    color:
      review.state === "approved"
        ? 0x2da44e
        : review.state === "changes_requested"
          ? 0xcf222e
          : 0x57a0d3,
    author: authorField(review.user?.login, review.user?.avatar_url, review.user?.html_url),
    fields: [
      { name: "PR", value: `#${pr.number} ${pr.title}`, inline: true },
      { name: "Repo", value: repository.full_name, inline: true },
    ],
    timestamp: review.submitted_at ?? new Date().toISOString(),
  };
}

export function prReadyEmbed(payload: any): WatchdogEmbed {
  const { pull_request: pr, repository } = payload;
  return {
    title: `🚀 PR #${pr.number} ready for review: ${pr.title}`,
    url: pr.html_url,
    color: 0xe3b341,
    author: authorField(pr.user?.login, pr.user?.avatar_url),
    fields: [{ name: "Repo", value: repository.full_name, inline: true }],
    timestamp: new Date().toISOString(),
  };
}

// ─── Push ─────────────────────────────────────────────────────────────────────

export function pushEmbed(payload: any): WatchdogEmbed {
  const { commits = [], repository, ref, pusher } = payload;
  const branch = ref?.replace("refs/heads/", "") ?? ref;
  const commitLines = commits
    .slice(0, 5)
    .map((c: any) => `[\`${c.id?.slice(0, 7)}\`](${c.url}) ${c.message?.split("\n")[0]}`)
    .join("\n");

  return {
    title: `📦 ${commits.length} commit(s) pushed to \`${branch}\``,
    url: `${repository.html_url}/tree/${branch}`,
    description: commitLines || undefined,
    color: 0x2da44e,
    author: { name: pusher?.name ?? "unknown" },
    fields: [
      { name: "Repo", value: repository.full_name, inline: true },
      { name: "Branch", value: `\`${branch}\``, inline: true },
      { name: "Commits", value: String(commits.length), inline: true },
    ],
    timestamp: payload.head_commit?.timestamp ?? new Date().toISOString(),
    footer: commits.length > 5 ? { text: `+${commits.length - 5} more commits` } : undefined,
  };
}

// ─── Releases ─────────────────────────────────────────────────────────────────

export function releaseEmbed(payload: any): WatchdogEmbed {
  const { release, repository } = payload;
  const action = payload.action; // "published" | "created" | "edited" | "deleted" | "prereleased"
  const emoji: Record<string, string> = {
    published: "🎉",
    created: "📝",
    edited: "✏️",
    deleted: "🗑️",
    prereleased: "🧪",
  };
  return {
    title: `${emoji[action] ?? "📦"} Release ${action}: ${release.name ?? release.tag_name}`,
    url: release.html_url,
    description: truncate(release.body, 300),
    color: 0x2da44e,
    author: authorField(
      release.author?.login,
      release.author?.avatar_url,
      release.author?.html_url
    ),
    fields: [
      { name: "Repo", value: repository.full_name, inline: true },
      { name: "Tag", value: `\`${release.tag_name}\``, inline: true },
      { name: "Prerelease", value: release.prerelease ? "Yes" : "No", inline: true },
    ],
    timestamp: release.published_at ?? release.created_at ?? new Date().toISOString(),
  };
}

// ─── Branch / Tag ─────────────────────────────────────────────────────────────

export function createDeleteEmbed(payload: any, action: "created" | "deleted"): WatchdogEmbed {
  const { ref_type, ref, repository } = payload;
  const emoji = action === "created" ? "🌿" : "🗑️";
  const color = action === "created" ? 0x2da44e : 0xcf222e;
  return {
    title: `${emoji} ${ref_type} ${action}: \`${ref}\``,
    url: repository.html_url,
    color,
    author: authorField(payload.sender?.login, payload.sender?.avatar_url),
    fields: [{ name: "Repo", value: repository.full_name, inline: true }],
    timestamp: new Date().toISOString(),
  };
}

// ─── Stars / Forks / Watches ──────────────────────────────────────────────────

export function starEmbed(payload: any): WatchdogEmbed {
  const { repository, sender, action } = payload;
  return {
    title: `${action === "created" ? "⭐ New star" : "💔 Star removed"} on ${repository.full_name}`,
    url: repository.html_url,
    color: action === "created" ? 0xe3b341 : 0x8b949e,
    author: authorField(sender?.login, sender?.avatar_url, sender?.html_url),
    fields: [{ name: "Total Stars", value: String(repository.stargazers_count), inline: true }],
    timestamp: new Date().toISOString(),
  };
}

export function forkEmbed(payload: any): WatchdogEmbed {
  const { forkee, repository, sender } = payload;
  return {
    title: `🍴 ${sender?.login ?? "Someone"} forked ${repository.full_name}`,
    url: forkee?.html_url ?? repository.html_url,
    color: 0x57a0d3,
    author: authorField(sender?.login, sender?.avatar_url, sender?.html_url),
    fields: [
      { name: "Fork", value: forkee?.full_name ?? "unknown", inline: true },
      { name: "Total Forks", value: String(repository.forks_count), inline: true },
    ],
    timestamp: new Date().toISOString(),
  };
}

// ─── Discussions ──────────────────────────────────────────────────────────────

export function discussionEmbed(payload: any): WatchdogEmbed {
  const { discussion, repository } = payload;
  const action = payload.action; // "created" | "answered" | "closed" etc.
  const emoji: Record<string, string> = {
    created: "💬",
    answered: "✅",
    closed: "🔒",
    reopened: "🔓",
  };
  return {
    title: `${emoji[action] ?? "💬"} Discussion ${action}: ${discussion.title}`,
    url: discussion.html_url,
    description: truncate(discussion.body),
    color: 0x8250df,
    author: authorField(payload.sender?.login, payload.sender?.avatar_url),
    fields: [
      { name: "Repo", value: repository.full_name, inline: true },
      { name: "Category", value: discussion.category?.name ?? "N/A", inline: true },
    ],
    timestamp: discussion.created_at ?? new Date().toISOString(),
  };
}
