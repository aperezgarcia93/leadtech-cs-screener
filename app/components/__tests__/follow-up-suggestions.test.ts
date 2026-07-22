import { describe, expect, it } from "vitest";
import { getFollowUpSuggestions } from "@/app/components/follow-up-suggestions";
import type { SourceRef } from "@/lib/chat-types";

const source = (candidate: string, score: number, section = "Skills"): SourceRef => ({
  candidate,
  section,
  file: `${candidate.toLowerCase().replace(/\s+/g, "-")}.pdf`,
  score,
});

describe("getFollowUpSuggestions", () => {
  it("suggests browsing the directory when there are no sources", () => {
    expect(getFollowUpSuggestions([])).toEqual([
      { label: "Browse all candidates", action: "open-directory" },
    ]);
  });

  it("suggests asking more about the single cited candidate", () => {
    const result = getFollowUpSuggestions([source("Jane Doe", 0.4)]);
    expect(result).toEqual([
      { label: "Tell me more about Jane Doe", action: "ask", prompt: "Tell me more about Jane Doe." },
    ]);
  });

  it("suggests comparing the two highest-scoring distinct candidates when multiple are cited", () => {
    const result = getFollowUpSuggestions([
      source("Low Score", 0.3),
      source("High Score", 0.9),
      source("Mid Score", 0.5),
    ]);
    expect(result).toEqual([
      {
        label: "Compare High Score and Mid Score",
        action: "ask",
        prompt: "Compare High Score and Mid Score.",
      },
    ]);
  });

  it("deduplicates repeated citations of the same candidate across sections", () => {
    const result = getFollowUpSuggestions([
      source("Jane Doe", 0.4),
      source("Jane Doe", 0.6, "Experience"),
    ]);
    expect(result).toEqual([
      { label: "Tell me more about Jane Doe", action: "ask", prompt: "Tell me more about Jane Doe." },
    ]);
  });
});
