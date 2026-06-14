import { Octokit } from "@octokit/rest";
import { getCachedUser, getCachedUserNames } from "./cache.js";
import type { APIApplicationCommandOptionChoice } from "discord-api-types/v10";
import Fuse from "fuse.js";

// ─── Owners / users ───────────────────────────────────────────────────────────

export async function handleUserAutocomplete(login: string, partial?: string): Promise<string[]> {
  const known = [...new Set([...(await getCachedUserNames()), login])];
  if (!partial) return known.slice(0, 25);

  return new Fuse(known, { includeScore: true, sortFn: (a, b) => a.score - b.score })
    .search(partial)
    .map((r) => r.item)
    .slice(0, 25);
}

// ─── Repositories ─────────────────────────────────────────────────────────────

export async function handleRepoAutocomplete(
  octo: Octokit,
  owner: string,
  isAuthed = false,
  partial?: string
): Promise<string[]> {
  const user = await getCachedUser(octo, owner, isAuthed);
  if (!user?.repos) return [];

  const names = [...new Set(user.repos.map((r) => r.name))];
  if (!partial) return names.slice(0, 25);

  return new Fuse(names, { includeScore: true, sortFn: (a, b) => a.score - b.score })
    .search(partial)
    .map((r) => r.item)
    .slice(0, 25);
}

// ─── Pull request numbers ─────────────────────────────────────────────────────

export async function handlePullNumberAutocomplete(
  octo: Octokit,
  owner: string,
  repo: string,
  isAuthed = false,
  partial?: string
): Promise<number[]> {
  const user = await getCachedUser(octo, owner, isAuthed);
  const cached = user?.repos?.find((r) => r.name.toLowerCase() === repo.toLowerCase());

  const pulls =
    cached?.pulls ??
    (
      await octo.pulls.list({ owner, repo, state: "all", per_page: 100 }).catch(() => null)
    )?.data.map((p) => p.number) ??
    [];

  if (!partial) return pulls.slice(0, 25);
  return pulls.filter((n) => n.toString().includes(partial)).slice(0, 25);
}

// ─── Issue numbers ────────────────────────────────────────────────────────────

export async function handleIssueNumberAutocomplete(
  octo: Octokit,
  owner: string,
  repo: string,
  isAuthed = false,
  partial?: string
): Promise<number[]> {
  const user = await getCachedUser(octo, owner, isAuthed);
  const cached = user?.repos?.find((r) => r.name.toLowerCase() === repo.toLowerCase());

  const issues =
    cached?.issues ??
    (
      await octo.issues.listForRepo({ owner, repo, state: "all", per_page: 100 }).catch(() => null)
    )?.data
      .filter((i) => !i.pull_request)
      .map((i) => i.number) ??
    [];

  if (!partial) return issues.slice(0, 25);
  return issues.filter((n) => n.toString().includes(partial)).slice(0, 25);
}

// ─── Labels ───────────────────────────────────────────────────────────────────

/**
 * Supports multi-label autocomplete: comma-separated values.
 * Already-selected labels are prepended to each new suggestion.
 */
export async function handleLabelAutocomplete(
  octo: Octokit,
  owner: string,
  repo: string,
  isAuthed = false,
  partial?: string
): Promise<APIApplicationCommandOptionChoice[]> {
  const user = await getCachedUser(octo, owner, isAuthed);
  const cached = user?.repos?.find((r) => r.name.toLowerCase() === repo.toLowerCase());

  let allLabels: string[];
  if (cached) {
    allLabels = cached.labels;
  } else {
    const res = await octo.issues
      .listLabelsForRepo({ owner, repo, per_page: 100 })
      .catch(() => null);
    allLabels = res?.data.map((l) => l.name) ?? [];
  }

  // The partial may be "bug, enhancement, " — we work on the last segment
  const segments = partial?.split(/,\s*/g).map((s) => s.trim().toLowerCase()) ?? [""];
  const prefix = segments.slice(0, -1); // already-committed labels
  const lastSegment = segments.at(-1) ?? "";

  const prefixStr = prefix.join(", ");
  const joinWithPrefix = (label: string) => (prefixStr ? `${prefixStr}, ${label}` : label);

  // Filter out already-selected labels
  const available = allLabels.filter((l) => !prefix.includes(l.toLowerCase()));

  // Filter by last segment
  const filtered = lastSegment
    ? available.filter((l) => l.toLowerCase().includes(lastSegment))
    : available;

  return filtered.slice(0, 25).map((l) => ({
    name: joinWithPrefix(l),
    value: joinWithPrefix(l),
  }));
}

// ─── Branches ────────────────────────────────────────────────────────────────

export async function handleBranchAutocomplete(
  octo: Octokit,
  owner: string,
  repo: string,
  partial?: string
): Promise<string[]> {
  const res = await octo.repos.listBranches({ owner, repo, per_page: 100 }).catch(() => null);
  if (!res) return [];
  const names = res.data.map((b) => b.name);
  if (!partial) return names.slice(0, 25);
  return names.filter((n) => n.toLowerCase().includes(partial.toLowerCase())).slice(0, 25);
}
