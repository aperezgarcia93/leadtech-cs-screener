import { readFileSync } from "node:fs";
import path from "node:path";
import { cosineSimilarity } from "ai";

export interface IndexedChunk {
  id: string;
  candidate: string;
  section: string;
  file: string; // PDF filename, e.g. "maria-santos.pdf"
  text: string;
  vector: number[];
}

export type RetrievedChunk = Omit<IndexedChunk, "vector"> & { score: number };

export const INDEX_PATH = path.join(process.cwd(), "data", "index.json");

export function rankChunks(
  queryVector: number[],
  chunks: IndexedChunk[],
  topK: number,
): RetrievedChunk[] {
  return chunks
    .map(({ vector, ...rest }) => ({ ...rest, score: cosineSimilarity(queryVector, vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

let cachedIndex: IndexedChunk[] | null = null;

export function loadIndex(): IndexedChunk[] {
  cachedIndex ??= JSON.parse(readFileSync(INDEX_PATH, "utf8")) as IndexedChunk[];
  return cachedIndex;
}
