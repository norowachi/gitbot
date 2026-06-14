import { Octokit } from "@octokit/rest";
import { createClient, RedisClientType } from "redis";
import type { CachedUser, CachedRepo } from "@utils";
import { Endpoints } from "@octokit/types";
import { env, log } from "@utils";

/** Cache TTL in seconds (15 minutes) */
const CACHE_TTL_S = 15 * 60;

/** Key prefix for all gitbot cache entries */
const PREFIX = "gitbot:user:";

// ─── Redis client (singleton) ─────────────────────────────────────────────────

let _redis: RedisClientType | null = null;

export async function getRedis(): Promise<RedisClientType> {
  if (_redis) return _redis;

  _redis = createClient({ url: env.REDIS_URL }) as RedisClientType;

  _redis.on("error", (err) => log.error({ err }, "[Redis] Client error"));
  _redis.on("ready", () => log.info("[Redis] Connected"));

  await _redis.connect();
  return _redis;
}

// ─── Repo helpers ─────────────────────────────────────────────────────────────

async function fetchRepoData(
  octo: Octokit,
  d: Endpoints["GET /repos/{owner}/{repo}"]["response"]["data"]
): Promise<CachedRepo> {
  const owner = d.owner.login;
  const repo = d.name;

  const [pulls, issues, labels] = await Promise.all([
    octo.pulls.list({ owner, repo, state: "all", per_page: 100 }).catch(() => null),
    octo.issues.listForRepo({ owner, repo, state: "all", per_page: 100 }).catch(() => null),
    octo.issues.listLabelsForRepo({ owner, repo, per_page: 100 }).catch(() => null),
  ]);

  return {
    name: d.name,
    pulls: pulls ? [...new Set(pulls.data.map((p) => p.number))] : [],
    // GitHub's issues endpoint returns PRs too — filter them out
    issues: issues
      ? [...new Set(issues.data.filter((i) => !i.pull_request).map((i) => i.number))]
      : [],
    labels: labels ? labels.data.map((l) => l.name) : [],
  };
}

// ─── Cache helpers ────────────────────────────────────────────────────────────

function userKey(login: string): string {
  return `${PREFIX}${login.toLowerCase()}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetches a GitHub user's repos (and their issues/pulls/labels) from the API,
 * writes the result to Redis with a TTL, and returns the fresh data.
 */
export async function upsertCachedUser(
  octo: Octokit,
  login?: string
): Promise<CachedUser | undefined> {
  const userRes = await (
    login ? octo.users.getByUsername({ username: login }) : octo.users.getAuthenticated()
  ).catch(() => null);

  if (!userRes) return undefined;

  const repoRes = await (
    login
      ? octo.repos.listForUser({ username: login, per_page: 100 })
      : octo.repos.listForAuthenticatedUser({ per_page: 100 })
  ).catch(() => null);

  const repos = repoRes
    ? await Promise.all(repoRes.data.map((r) => fetchRepoData(octo, r as any)))
    : [];

  const data: CachedUser = {
    login: userRes.data.login,
    repos,
    cachedAt: Date.now(),
  };

  const redis = await getRedis();
  await redis.set(userKey(data.login), JSON.stringify(data), { EX: CACHE_TTL_S }).catch(() => {});

  return data;
}

/**
 * Returns a cached user (if still fresh) or fetches + caches fresh data.
 * Redis native TTL handles expiry; `cachedAt` is kept for informational use only.
 */
export async function getCachedUser(
  octo: Octokit,
  login: string,
  isAuthed = false
): Promise<CachedUser | undefined> {
  const redis = await getRedis();

  const raw = await redis.get(userKey(login)).catch(() => null);
  if (raw) {
    try {
      return JSON.parse(raw) as CachedUser;
    } catch {
      // Corrupt entry — fall through to re-fetch
    }
  }

  return upsertCachedUser(octo, isAuthed ? undefined : login);
}

/**
 * Returns all cached GitHub login names stored in Redis.
 * Uses SCAN to avoid blocking the server on large keyspaces.
 */
export async function getCachedUserNames(): Promise<string[]> {
  const redis = await getRedis();
  const logins: string[] = [];

  for await (const key of redis.scanIterator({ MATCH: `${PREFIX}*`, COUNT: 100 })) {
    logins.push(key.slice(PREFIX.length));
  }

  return logins;
}

/**
 * Removes a user entry from the cache (e.g. after /unlink).
 */
export async function deleteCachedUser(login: string): Promise<void> {
  const redis = await getRedis();
  await redis.del(userKey(login)).catch(() => {});
}
