/**
 * Tests: getOptionsValue — Discord interaction option parsing
 */

import { describe, it, expect } from "vitest";
import { ApplicationCommandOptionType } from "discord-api-types/v10";

// Import the pure function directly (no env dependency)
import { getOptionsValue } from "../utils/functions/main.js";

const makeOption = (name: string, value: unknown, type = ApplicationCommandOptionType.String) => ({
  name,
  value,
  type,
});

const makeSubcommand = (name: string, options: any[]) => ({
  name,
  type: ApplicationCommandOptionType.Subcommand,
  options,
});

const makeSubcommandGroup = (name: string, subcommandName: string, options: any[]) => ({
  name,
  type: ApplicationCommandOptionType.SubcommandGroup,
  options: [makeSubcommand(subcommandName, options)],
});

describe("getOptionsValue", () => {
  it("returns a flat map of option values", () => {
    const opts = [
      makeOption("owner", "myorg"),
      makeOption("repo", "myrepo"),
      makeOption("issue_number", 42, ApplicationCommandOptionType.Integer),
    ];
    const result = getOptionsValue(opts as any);
    expect(result.get("owner")).toBe("myorg");
    expect(result.get("repo")).toBe("myrepo");
    expect(result.get("issue_number")).toBe(42);
  });

  it("unwraps a single subcommand layer", () => {
    const opts = [makeSubcommand("create", [makeOption("title", "My Issue")])];
    const result = getOptionsValue(opts as any);
    expect(result.get("title")).toBe("My Issue");
  });

  it("unwraps a subcommand group → subcommand → options", () => {
    const opts = [makeSubcommandGroup("issues", "create", [makeOption("title", "Nested Issue")])];
    const result = getOptionsValue(opts as any);
    expect(result.get("title")).toBe("Nested Issue");
  });

  it("returns empty map for empty options array", () => {
    const result = getOptionsValue([]);
    expect(result.size).toBe(0);
  });

  it("handles boolean values", () => {
    const opts = [makeOption("draft", true, ApplicationCommandOptionType.Boolean)];
    const result = getOptionsValue(opts as any);
    expect(result.get("draft")).toBe(true);
  });

  it("handles integer values", () => {
    const opts = [makeOption("pull_number", 7, ApplicationCommandOptionType.Integer)];
    const result = getOptionsValue(opts as any);
    expect(result.get("pull_number")).toBe(7);
  });

  it("preserves undefined-valued options (not set)", () => {
    // Discord omits options not provided; ensure absent keys return undefined
    const opts = [makeOption("title", "Hello")];
    const result = getOptionsValue(opts as any);
    expect(result.get("body")).toBeUndefined();
  });
});
