import { describe, expect, it } from "vitest";
import { formatRelativeTime } from "@/app/components/candidate-panel";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("formatRelativeTime", () => {
  it("returns 'just now' for under a minute", () => {
    const now = 1_000_000;
    expect(formatRelativeTime(now - 30_000, now)).toBe("just now");
  });

  it("returns minutes for under an hour", () => {
    const now = 1_000_000;
    expect(formatRelativeTime(now - 5 * MINUTE, now)).toBe("5m ago");
  });

  it("returns hours for under a day", () => {
    const now = 1_000_000;
    expect(formatRelativeTime(now - 3 * HOUR, now)).toBe("3h ago");
  });

  it("returns days for under a week", () => {
    const now = 1_000_000;
    expect(formatRelativeTime(now - 2 * DAY, now)).toBe("2d ago");
  });

  it("falls back to a locale date string past a week", () => {
    const now = Date.now();
    const eightDaysAgo = now - 8 * DAY;
    expect(formatRelativeTime(eightDaysAgo, now)).toBe(new Date(eightDaysAgo).toLocaleDateString());
  });
});
