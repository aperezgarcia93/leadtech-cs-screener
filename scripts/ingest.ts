import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { extractText, getDocumentProxy } from "unpdf";
import { getLocalEmbedder } from "@/lib/embeddings";
import { INDEX_PATH, type IndexedChunk } from "@/lib/retrieval";
import { chunkCvText } from "./chunker";

const CV_DIR = path.join(process.cwd(), "data", "cvs");

const candidateFromFile = (file: string) =>
  file.replace(/\.pdf$/, "").split("-").map(w => w[0]?.toUpperCase() + w.slice(1)).join(" ");

async function main() {
  const files = (await readdir(CV_DIR)).filter(f => f.endsWith(".pdf")).sort();
  if (files.length === 0) throw new Error(`No PDFs in ${CV_DIR}. Run: npm run generate-cvs`);

  const allChunks: Omit<IndexedChunk, "vector">[] = [];
  for (const file of files) {
    const buffer = await readFile(path.join(CV_DIR, file));
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    const chunks = chunkCvText(text, candidateFromFile(file), file);
    console.log(`${file}: ${chunks.length} chunks`);
    allChunks.push(...chunks);
  }

  const embedder = getLocalEmbedder();
  const vectors = await embedder.embed(allChunks.map(c => c.text));
  const index: IndexedChunk[] = allChunks.map((c, i) => ({ ...c, vector: vectors[i] }));
  await writeFile(INDEX_PATH, JSON.stringify(index));
  console.log(`Wrote ${index.length} chunks from ${files.length} CVs to ${INDEX_PATH}`);
}

main().catch(error => { console.error(error); process.exit(1); });
