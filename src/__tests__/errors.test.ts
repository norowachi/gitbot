/**
 * Tests: OctoErrMsg — GitHub API error formatter
 */

import { describe, it, expect } from "vitest";
import { OctoErrMsg } from "../utils/functions/main.js";

describe("OctoErrMsg", () => {
  it("returns fallback for null/undefined error", () => {
    expect(OctoErrMsg(null)).toBe("The operation did not complete successfully.");
    expect(OctoErrMsg(undefined)).toBe("The operation did not complete successfully.");
    expect(OctoErrMsg({})).toBe("The operation did not complete successfully.");
  });

  it("returns message-only string when no errors array", () => {
    const err = { response: { data: { message: "Not Found" } } };
    expect(OctoErrMsg(err)).toBe("**Not Found**");
  });

  it("includes errors array when present", () => {
    const err = {
      response: {
        data: {
          message: "Validation Failed",
          status: 422,
          errors: [{ resource: "Issue", field: "title", code: "missing_field" }],
        },
      },
    };
    const result = OctoErrMsg(err);
    expect(result).toContain("**Validation Failed**");
    expect(result).toContain("Resource");
    expect(result).toContain("Issue");
    expect(result).toContain("missing_field");
    expect(result).toContain("422");
  });

  it("handles multiple errors in the array", () => {
    const err = {
      response: {
        data: {
          message: "Multiple errors",
          status: 422,
          errors: [
            { field: "title", code: "missing" },
            { field: "body", code: "too_long" },
          ],
        },
      },
    };
    const result = OctoErrMsg(err);
    expect(result).toContain("title");
    expect(result).toContain("body");
  });

  it("falls back to top-level status when data.status is absent", () => {
    const err = {
      status: 403,
      response: {
        data: {
          message: "Forbidden",
          errors: [{ code: "forbidden" }],
        },
      },
    };
    const result = OctoErrMsg(err);
    expect(result).toContain("403");
  });

  it("uses 'GitHub Error' when message field is missing", () => {
    const err = {
      response: {
        data: {
          errors: [{ code: "some_code" }],
          status: 500,
        },
      },
    };
    const result = OctoErrMsg(err);
    expect(result).toContain("**GitHub Error**");
  });
});
