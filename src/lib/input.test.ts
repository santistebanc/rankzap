import { describe, expect, it } from "vitest";
import { isPollId, POLL_ID_LENGTH } from "./protocol";
import {
  clampName,
  clampOption,
  clampTitle,
  DEFAULT_POLL_COLOUR,
  NAME_MAX,
  OPTION_MAX,
  pollColourOf,
  TITLE_MAX,
} from "./types";

describe("isPollId", () => {
  it("accepts four upper-case letters or digits", () => {
    expect(POLL_ID_LENGTH).toBe(4);
    expect(isPollId("AB12")).toBe(true);
    expect(isPollId("ZZZZ")).toBe(true);
  });

  it("rejects other lengths, lower case and symbols", () => {
    for (const id of ["", "ABC", "ABCDE", "ab12", "AB-1", "AB 1", "ÄB12"]) {
      expect(isPollId(id), id).toBe(false);
    }
  });
});

describe("text limits", () => {
  it("trims and cuts titles, options and names to their maximum length", () => {
    expect(clampTitle("  Lunch?  ")).toBe("Lunch?");
    expect(clampTitle("x".repeat(TITLE_MAX + 5))).toHaveLength(TITLE_MAX);
    expect(clampOption("y".repeat(OPTION_MAX + 1))).toHaveLength(OPTION_MAX);
    expect(clampName(` ${"z".repeat(NAME_MAX + 3)} `)).toHaveLength(NAME_MAX);
  });
});

describe("pollColourOf", () => {
  it("keeps a known colour and falls back to the default for anything else", () => {
    expect(pollColourOf(DEFAULT_POLL_COLOUR)).toBe(DEFAULT_POLL_COLOUR);
    for (const value of [undefined, null, 3, "not-a-colour", "toString"]) {
      expect(pollColourOf(value)).toBe(DEFAULT_POLL_COLOUR);
    }
  });
});
