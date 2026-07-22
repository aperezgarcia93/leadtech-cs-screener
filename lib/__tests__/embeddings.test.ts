import { describe, expect, it } from "vitest";
import { getLocalEmbedder } from "@/lib/embeddings";

describe("getLocalEmbedder", () => {
  it("returns 384-dim normalized vectors, batch-aligned", async () => {
    const embedder = getLocalEmbedder();
    const vecs = await embedder.embed(["python developer", "accountant"]);
    expect(vecs).toHaveLength(2);
    expect(vecs[0]).toHaveLength(384);
    const norm = Math.hypot(...vecs[0]);
    expect(norm).toBeCloseTo(1, 2);
  });

  it("gives similar texts higher cosine similarity than dissimilar ones", async () => {
    const embedder = getLocalEmbedder();
    const [a, b, c] = await embedder.embed([
      "senior Python backend engineer",
      "experienced Python software developer",
      "pastry chef specialized in croissants",
    ]);
    const dot = (x: number[], y: number[]) => x.reduce((s, v, i) => s + v * y[i], 0);
    expect(dot(a, b)).toBeGreaterThan(dot(a, c));
  });
});
