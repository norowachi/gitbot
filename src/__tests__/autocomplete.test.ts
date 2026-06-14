/**
 * Tests: handleLabelAutocomplete — multi-label comma-separated logic
 *
 * We mock getCachedUser to avoid touching Redis.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Octokit } from "@octokit/rest";

// Mock the Redis cache module so no connection is attempted
vi.mock("../utils/functions/cache.js", () => ({
  getCachedUser: vi.fn(),
  getCachedUserNames: vi.fn().mockResolvedValue([]),
  upsertCachedUser: vi.fn(),
  deleteCachedUser: vi.fn(),
  getRedis: vi.fn(),
}));

import { handleLabelAutocomplete } from "../utils/functions/autocomplete.js";
import { getCachedUser } from "../utils/functions/cache.js";

const mockOcto = {} as Octokit;

const cachedUserWithLabels = (labels: string[]) => ({
  login: "testuser",
  repos: [
    {
      name: "myrepo",
      labels,
      pulls: [],
      issues: [],
    },
  ],
  cachedAt: Date.now(),
});

describe("handleLabelAutocomplete", () => {
  beforeEach(() => {
    vi.mocked(getCachedUser).mockResolvedValue(
      cachedUserWithLabels(["bug", "enhancement", "documentation", "wontfix", "duplicate"])
    );
  });

  it("returns all labels when no partial is given", async () => {
    const result = await handleLabelAutocomplete(mockOcto, "testuser", "myrepo");
    expect(result.map((r) => r.value)).toEqual([
      "bug",
      "enhancement",
      "documentation",
      "wontfix",
      "duplicate",
    ]);
  });

  it("filters by partial match on the last segment", async () => {
    const result = await handleLabelAutocomplete(mockOcto, "testuser", "myrepo", false, "bug");
    expect(result.map((r) => r.value)).toEqual(["bug"]);
  });

  it("preserves already-selected labels as prefix", async () => {
    const result = await handleLabelAutocomplete(
      mockOcto,
      "testuser",
      "myrepo",
      false,
      "bug, enhanc"
    );
    // Should suggest "bug, enhancement" (prefix "bug" + match "enhancement")
    expect(result.some((r) => r.value === "bug, enhancement")).toBe(true);
    // Should NOT suggest "bug" again (already selected)
    expect(result.some((r) => r.value === "bug, bug")).toBe(false);
  });

  it("does not include already-selected labels in suggestions", async () => {
    const result = await handleLabelAutocomplete(mockOcto, "testuser", "myrepo", false, "bug, ");
    const values = result.map((r) => r.value);
    // 'bug' is already selected — must not appear again
    expect(values.some((v) => v === "bug, bug")).toBe(false);
    // Other labels should still appear prefixed
    expect(values.some((v) => v.startsWith("bug, "))).toBe(true);
  });

  it("handles three already-selected labels", async () => {
    const result = await handleLabelAutocomplete(
      mockOcto,
      "testuser",
      "myrepo",
      false,
      "bug, enhancement, doc"
    );
    expect(result.some((r) => r.value === "bug, enhancement, documentation")).toBe(true);
  });

  it("returns empty array when no labels match", async () => {
    const result = await handleLabelAutocomplete(
      mockOcto,
      "testuser",
      "myrepo",
      false,
      "zzznomatch"
    );
    expect(result).toHaveLength(0);
  });

  it("caps results at 25", async () => {
    vi.mocked(getCachedUser).mockResolvedValue(
      cachedUserWithLabels(Array.from({ length: 50 }, (_, i) => `label-${i}`))
    );
    const result = await handleLabelAutocomplete(mockOcto, "testuser", "myrepo");
    expect(result.length).toBeLessThanOrEqual(25);
  });
});
