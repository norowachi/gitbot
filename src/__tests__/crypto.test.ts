/**
 * Tests: encryptToken / decryptToken round-trip
 *
 * These run without any live services; the key is provided directly.
 */

import { describe, it, expect, beforeAll } from "vitest";

// Set required env vars before importing utils (validation runs at module load)
beforeAll(() => {
  process.env.DISCORD_APP_TOKEN = "fake.token.value";
  process.env.DISCORD_PUBLIC_KEY = "a".repeat(64);
  process.env.MONGO_URI = "mongodb://localhost:27017/test";
  process.env.REDIS_URL = "redis://localhost:6379";
  process.env.ENCRYPTION_KEY = "test-key-exactly-32-chars-here!!";
});

// Lazy import after env is set
async function getCrypto() {
  const { encryptToken, decryptToken } = await import("../utils/utils.js");
  return { encryptToken, decryptToken };
}

describe("encryptToken / decryptToken", () => {
  it("round-trips a plain PAT correctly", async () => {
    const { encryptToken, decryptToken } = await getCrypto();
    const original = "ghp_abc123XYZ";
    const encrypted = encryptToken(original);
    expect(decryptToken(encrypted)).toBe(original);
  });

  it("produces different ciphertext each call (random IV)", async () => {
    const { encryptToken } = await getCrypto();
    const token = "ghp_sametoken";
    const a = encryptToken(token);
    const b = encryptToken(token);
    expect(a).not.toBe(b);
  });

  it("stores IV as hex prefix separated by colon", async () => {
    const { encryptToken } = await getCrypto();
    const encrypted = encryptToken("ghp_test");
    const parts = encrypted.split(":");
    expect(parts.length).toBeGreaterThanOrEqual(2);
    expect(parts[0]).toMatch(/^[0-9a-f]{32}$/); // 16 bytes = 32 hex chars
  });

  it("round-trips a long OAuth token", async () => {
    const { encryptToken, decryptToken } = await getCrypto();
    const original = "gho_" + "z".repeat(36);
    expect(decryptToken(encryptToken(original))).toBe(original);
  });

  it("round-trips a token containing colons (URL-like)", async () => {
    const { encryptToken, decryptToken } = await getCrypto();
    const original = "token:with:colons:inside";
    expect(decryptToken(encryptToken(original))).toBe(original);
  });
});
