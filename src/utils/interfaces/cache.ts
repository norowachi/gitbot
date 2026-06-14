/** Cached GitHub user entry stored in Redis */
export interface CachedUser {
  login: string;
  repos?: CachedRepo[];
  /** Unix timestamp of when this cache entry was written */
  cachedAt: number;
}

/** Cached repository data */
export interface CachedRepo {
  name: string;
  /** Open + closed pull request numbers */
  pulls: number[];
  /** Open + closed issue numbers */
  issues: number[];
  /** Label names */
  labels: string[];
}

// ── Legacy aliases (keeps old import names working during migration) ──────────
/** @deprecated Use CachedUser */
export type LevelUser = CachedUser;
/** @deprecated Use CachedRepo */
export type LevelRepo = CachedRepo;
