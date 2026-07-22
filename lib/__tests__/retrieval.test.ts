import { describe, expect, it } from "vitest";
import { rankChunks, type IndexedChunk } from "@/lib/retrieval";

const chunk = (id: string, vector: number[]): IndexedChunk => ({
  id, candidate: `c-${id}`, section: "Skills", file: `${id}.pdf`, text: `text ${id}`, vector,
});

describe("rankChunks", () => {
  it("returns topK chunks sorted by cosine similarity, without vectors", () => {
    const chunks = [chunk("far", [0, 1, 0]), chunk("near", [1, 0, 0]), chunk("mid", [0.7, 0.7, 0])];
    const result = rankChunks([1, 0, 0], chunks, 2);
    expect(result.map(r => r.id)).toEqual(["near", "mid"]);
    expect(result[0].score).toBeCloseTo(1);
    expect(result[0]).not.toHaveProperty("vector");
  });

  it("clamps topK to available chunks", () => {
    expect(rankChunks([1, 0], [chunk("a", [1, 0])], 5)).toHaveLength(1);
  });
});
