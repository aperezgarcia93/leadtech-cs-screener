import { describe, expect, it } from "vitest";
import { chunkCvText } from "@/scripts/chunker";

const sample = `Maria Santos
Senior Data Engineer · Barcelona
SUMMARY
Data engineer with 8 years of experience.
EXPERIENCE
Data Engineer at Acme (2019 – 2024): built pipelines.
EDUCATION
MSc, Universitat Politècnica de Catalunya (UPC), 2016
SKILLS
Python, SQL, Spark
LANGUAGES
Spanish (native), English (C1)`;

describe("chunkCvText", () => {
  it("splits on section headings with candidate metadata", () => {
    const chunks = chunkCvText(sample, "Maria Santos", "maria-santos.pdf");
    const sections = chunks.map(c => c.section);
    expect(sections).toEqual(["Header", "Summary", "Experience", "Education", "Skills", "Languages"]);
    expect(chunks.every(c => c.candidate === "Maria Santos")).toBe(true);
    expect(chunks.find(c => c.section === "Education")?.text).toContain("UPC");
    // Every chunk's text is prefixed with the candidate name so embeddings carry identity
    expect(chunks.find(c => c.section === "Skills")?.text).toContain("Maria Santos");
  });

  it("drops empty sections and handles missing headings gracefully", () => {
    const chunks = chunkCvText("Just a name\nno headings here", "X Y", "x-y.pdf");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].section).toBe("Header");
  });
});
