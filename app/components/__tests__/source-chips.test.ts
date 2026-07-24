import { describe, expect, it } from "vitest";
import { filterCitedSources, groupSourcesByCandidate } from "@/app/components/source-chips";
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

describe("filterCitedSources", () => {
  const upcSources = [
    source("Luis Martinez", "Education", 0.3),
    source("Carlos Mendez", "Education", 0.32),
    source("Marc Serra", "Header", 0.27),
  ];

  it("keeps only sources whose candidate name is bolded in the answer text", () => {
    const text = "**Luis Martinez** and **Carlos Mendez** both graduated from UPC.";
    const result = filterCitedSources(upcSources, text);
    expect(result.map(s => s.candidate)).toEqual(["Luis Martinez", "Carlos Mendez"]);
  });

  it("matches case-insensitively", () => {
    const text = "**luis martinez** graduated from UPC.";
    expect(filterCitedSources(upcSources, text).map(s => s.candidate)).toEqual([
      "Luis Martinez",
    ]);
  });

  it("excludes a candidate merely mentioned in passing, not bolded", () => {
    const text = "Unlike Marc Serra, **Luis Martinez** graduated from UPC.";
    expect(filterCitedSources(upcSources, text).map(s => s.candidate)).toEqual([
      "Luis Martinez",
    ]);
  });

  it("falls back to returning every source when the answer has no bolded names", () => {
    const text = "Nobody in the CVs has a pilot's license.";
    expect(filterCitedSources(upcSources, text)).toEqual(upcSources);
  });

  it("returns an empty array when there are no sources to begin with", () => {
    expect(filterCitedSources([], "**Anyone** mentioned.")).toEqual([]);
  });
});
