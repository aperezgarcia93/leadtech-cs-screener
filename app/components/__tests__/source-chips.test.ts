import { describe, expect, it } from "vitest";
import { groupSourcesByCandidate } from "@/app/components/source-chips";
import type { SourceRef } from "@/lib/chat-types";

const source = (candidate: string, section: string, score: number): SourceRef => ({
  candidate,
  section,
  file: `${candidate.toLowerCase().replace(/\s+/g, "-")}.pdf`,
  score,
});

describe("groupSourcesByCandidate", () => {
  it("returns one group per distinct file, sorted by best score descending", () => {
    const result = groupSourcesByCandidate([
      source("Low Score", "Skills", 0.3),
      source("High Score", "Experience", 0.9),
    ]);
    expect(result.map(g => g.candidate)).toEqual(["High Score", "Low Score"]);
  });

  it("collects every matched section for a candidate cited in multiple sections", () => {
    const result = groupSourcesByCandidate([
      source("Jane Doe", "Skills", 0.4),
      source("Jane Doe", "Experience", 0.6),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].sections).toEqual(["Skills", "Experience"]);
    expect(result[0].bestScore).toBe(0.6);
  });

  it("deduplicates a repeated (file, section) pair without duplicating the section in the list", () => {
    const result = groupSourcesByCandidate([
      source("Jane Doe", "Skills", 0.4),
      source("Jane Doe", "Skills", 0.5),
    ]);
    expect(result[0].sections).toEqual(["Skills"]);
    expect(result[0].bestScore).toBe(0.5);
  });

  it("returns an empty array for no sources", () => {
    expect(groupSourcesByCandidate([])).toEqual([]);
  });
});
