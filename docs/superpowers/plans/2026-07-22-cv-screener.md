# AI-Powered CV Screener Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Next.js app that generates 28 fake PDF CVs, indexes them with a hand-rolled RAG pipeline (local MiniLM embeddings), and answers questions about them via a streaming chat UI with source citations.

**Architecture:** Two offline scripts (`generate-cvs`, `ingest`) produce `data/cvs/*.pdf` and `data/index.json`. One API route embeds the query locally, retrieves top-k chunks by cosine similarity, and streams a grounded OpenRouter completion with source metadata. One page renders the chat with source chips.

**Tech Stack:** Next.js (App Router) + TypeScript strict, `ai` v6 + `@ai-sdk/react` + `@openrouter/ai-sdk-provider`, `@huggingface/transformers` (MiniLM embeddings), `unpdf` (PDF text extraction), Playwright (HTML→PDF), zod, vitest, tsx.

## Global Constraints

- TypeScript `strict: true`; no `any`; `npm run lint` and `npx tsc --noEmit` must pass before every commit.
- Spec: `docs/superpowers/specs/2026-07-22-cv-screener-design.md`. The RAG pipeline reads ONLY the PDFs — never the profile JSON.
- No RAG framework (no LangChain/LlamaIndex). Retrieval is hand-rolled.
- Single secret: `OPENROUTER_API_KEY` in `.env.local` (gitignored). Model IDs via env with defaults: `OPENROUTER_CHAT_MODEL` = `nvidia/nemotron-3-super-120b-a12b:free`, `OPENROUTER_IMAGE_MODEL` = `google/gemini-3.1-flash-image` (verified live on openrouter.ai 2026-07-22; both overridable).
- Generated artifacts (`data/cvs/*.pdf`, `data/index.json`) ARE committed so reviewers can run the app without generation keys.
- AI SDK v6 APIs only (verified against bundled docs): `streamText` + `convertToModelMessages` + `createUIMessageStream`/`createUIMessageStreamResponse`; `generateText` + `Output.object` (NOT `generateObject`); `generateImage`; `useChat` with `DefaultChatTransport` and manual input state; `cosineSimilarity` from `ai`.
- Commit after every task (conventional commits). Package manager: npm.

---

### Task 1: Scaffold Next.js app + tooling

**Files:**
- Create: Next.js scaffold (create-next-app), `vitest.config.ts`, `.env.local`, `.env.example`, `lib/`, `scripts/`, `data/cvs/.gitkeep`
- Modify: `package.json` (scripts), `.gitignore`

**Interfaces:**
- Produces: runnable `npm run dev`, `npm test` (vitest), `npm run generate-cvs`, `npm run ingest` script entries; path alias `@/*`.

- [ ] **Step 1: Scaffold in place**

```bash
npx create-next-app@latest . --typescript --eslint --tailwind --app --no-src-dir --import-alias "@/*" --turbopack --yes
```
(Repo already has `docs/`; create-next-app tolerates non-conflicting files. If it refuses, scaffold into `/tmp` and move contents except `.git`.)

- [ ] **Step 2: Install dependencies**

```bash
npm i ai @ai-sdk/react @openrouter/ai-sdk-provider @huggingface/transformers unpdf zod
npm i -D vitest tsx playwright
npx playwright install chromium
```

- [ ] **Step 3: Add npm scripts and env files**

In `package.json` `"scripts"` add:
```json
"test": "vitest run",
"generate-cvs": "tsx scripts/generate-cvs.ts",
"ingest": "tsx scripts/ingest.ts"
```

`.env.example` (committed):
```
OPENROUTER_API_KEY=sk-or-...
# Optional overrides:
# OPENROUTER_CHAT_MODEL=nvidia/nemotron-3-super-120b-a12b:free
# OPENROUTER_IMAGE_MODEL=google/gemini-3.1-flash-image
```
`.env.local`: same keys, real value (user provides). Append to `.gitignore`: nothing extra needed (`.env*` already ignored by scaffold; ensure `!.env.example` line added).

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { environment: "node", testTimeout: 30_000 },
  resolve: { alias: { "@": path.resolve(__dirname) } },
});
```

- [ ] **Step 4: Verify**

Run: `npm run lint && npx tsc --noEmit && npm test`
Expected: lint/tsc pass; vitest reports "no test files found" (exit 0 with `--passWithNoTests` — add that flag to the test script).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore: scaffold Next.js app with AI SDK, transformers.js, vitest tooling"
```

---

### Task 2: Embeddings module (`lib/embeddings.ts`)

**Files:**
- Create: `lib/embeddings.ts`
- Test: `lib/__tests__/embeddings.test.ts`

**Interfaces:**
- Produces: `type Embedder = { embed(texts: string[]): Promise<number[][]> }` and `getLocalEmbedder(): Embedder` (singleton, lazy model load; 384-dim L2-normalized vectors).

- [ ] **Step 1: Write the failing test**

```ts
// lib/__tests__/embeddings.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/__tests__/embeddings.test.ts`
Expected: FAIL — cannot resolve `@/lib/embeddings`.

- [ ] **Step 3: Implement**

```ts
// lib/embeddings.ts
import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";

export interface Embedder {
  embed(texts: string[]): Promise<number[][]>;
}

const MODEL_ID = "Xenova/all-MiniLM-L6-v2";

let pipelinePromise: Promise<FeatureExtractionPipeline> | null = null;

function getPipeline(): Promise<FeatureExtractionPipeline> {
  pipelinePromise ??= pipeline("feature-extraction", MODEL_ID);
  return pipelinePromise;
}

class LocalMiniLmEmbedder implements Embedder {
  async embed(texts: string[]): Promise<number[][]> {
    const extractor = await getPipeline();
    const output = await extractor(texts, { pooling: "mean", normalize: true });
    const [count, dim] = output.dims;
    const data = output.data as Float32Array;
    return Array.from({ length: count }, (_, i) =>
      Array.from(data.slice(i * dim, (i + 1) * dim)),
    );
  }
}

let embedder: Embedder | null = null;

/** Singleton: the ~25 MB model is loaded once per process. */
export function getLocalEmbedder(): Embedder {
  embedder ??= new LocalMiniLmEmbedder();
  return embedder;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/__tests__/embeddings.test.ts`
Expected: PASS (first run downloads the model, ~10 s).

- [ ] **Step 5: Commit**

```bash
git add lib && git commit -m "feat: local MiniLM embedder behind swappable Embedder interface"
```

---

### Task 3: Retrieval module (`lib/retrieval.ts`)

**Files:**
- Create: `lib/retrieval.ts`
- Test: `lib/__tests__/retrieval.test.ts`

**Interfaces:**
- Consumes: nothing (pure functions + fs read).
- Produces:
  ```ts
  type IndexedChunk = { id: string; candidate: string; section: string; file: string; text: string; vector: number[] };
  type RetrievedChunk = Omit<IndexedChunk, "vector"> & { score: number };
  function rankChunks(queryVector: number[], chunks: IndexedChunk[], topK: number): RetrievedChunk[];
  function loadIndex(): IndexedChunk[];   // reads data/index.json, caches in memory
  ```

- [ ] **Step 1: Write the failing test**

```ts
// lib/__tests__/retrieval.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/__tests__/retrieval.test.ts`
Expected: FAIL — cannot resolve `@/lib/retrieval`.

- [ ] **Step 3: Implement**

```ts
// lib/retrieval.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/__tests__/retrieval.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib && git commit -m "feat: cosine top-k retrieval over JSON vector index"
```

---

### Task 4: OpenRouter client config (`lib/openrouter.ts`)

**Files:**
- Create: `lib/openrouter.ts`

**Interfaces:**
- Produces: `openrouter` provider instance, `CHAT_MODEL: string`, `IMAGE_MODEL: string`.

- [ ] **Step 1: Implement** (config-only module; no unit test — exercised by every later task)

```ts
// lib/openrouter.ts
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

if (!process.env.OPENROUTER_API_KEY) {
  throw new Error("OPENROUTER_API_KEY is not set. Copy .env.example to .env.local and add your key.");
}

export const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });

export const CHAT_MODEL =
  process.env.OPENROUTER_CHAT_MODEL ?? "nvidia/nemotron-3-super-120b-a12b:free";

export const IMAGE_MODEL =
  process.env.OPENROUTER_IMAGE_MODEL ?? "google/gemini-3.1-flash-image";
```

- [ ] **Step 2: Verify and commit**

Run: `npx tsc --noEmit`
Expected: PASS.

```bash
git add lib/openrouter.ts && git commit -m "feat: OpenRouter provider config with env-overridable model ids"
```

---

### Task 5: CV generation script (`scripts/generate-cvs.ts`)

**Files:**
- Create: `scripts/cv-schema.ts` (zod schema + prompt), `scripts/cv-template.ts` (HTML renderers), `scripts/generate-cvs.ts` (orchestrator)
- Test: `scripts/__tests__/cv-template.test.ts`

**Interfaces:**
- Consumes: `openrouter`, `CHAT_MODEL`, `IMAGE_MODEL` from `@/lib/openrouter`.
- Produces: `data/cvs/<kebab-name>.pdf` × 28. Templates emit UPPERCASE section headings (`SUMMARY`, `EXPERIENCE`, `EDUCATION`, `SKILLS`, `LANGUAGES`) that Task 6's chunker splits on — this coupling is the contract between generation and ingestion.

- [ ] **Step 1: Candidate schema + generation prompt**

```ts
// scripts/cv-schema.ts
import { z } from "zod";

export const candidateSchema = z.object({
  fullName: z.string(),
  headline: z.string(), // e.g. "Senior Data Engineer"
  email: z.string(),
  phone: z.string(),
  location: z.string(),
  summary: z.string(),
  experience: z.array(z.object({
    role: z.string(),
    company: z.string(),
    period: z.string(), // e.g. "2019 – 2023"
    achievements: z.array(z.string()).min(2).max(4),
  })).min(1).max(4),
  education: z.array(z.object({
    degree: z.string(),
    institution: z.string(),
    year: z.string(),
  })).min(1).max(2),
  skills: z.array(z.string()).min(5).max(14),
  languages: z.array(z.object({ language: z.string(), level: z.string() })).min(1).max(4),
  photoPrompt: z.string(), // headshot description for the image model
});

export type Candidate = z.infer<typeof candidateSchema>;

export const batchSchema = z.object({ candidates: z.array(candidateSchema) });

export function generationPrompt(count: number, existingNames: string[]): string {
  return `Generate ${count} realistic but entirely fictional CV profiles for a recruiting demo.

Diversity requirements across the batch:
- Mix of roles: software engineering, data, design, marketing, finance, operations.
- Mix of seniority (junior to principal), nationalities, and locations (mostly Europe).
- CV language: mostly English; make 2 of them in Spanish.
- At least one candidate educated at "Universitat Politècnica de Catalunya (UPC)".
- Several candidates with Python experience; several with none.
- Realistic fictional companies; emails as firstname.lastname@example.com.
- photoPrompt: one sentence describing a neutral professional headshot matching the person (age range, presentation), photorealistic, plain background.
${existingNames.length > 0 ? `- Do NOT reuse these names: ${existingNames.join(", ")}.` : ""}`;
}
```

- [ ] **Step 2: Failing template test**

```ts
// scripts/__tests__/cv-template.test.ts
import { describe, expect, it } from "vitest";
import { renderCvHtml, TEMPLATE_COUNT } from "@/scripts/cv-template";
import type { Candidate } from "@/scripts/cv-schema";

const candidate: Candidate = {
  fullName: "Test Person", headline: "Engineer", email: "t@example.com",
  phone: "+34 600 000 000", location: "Barcelona, Spain", summary: "A summary.",
  experience: [{ role: "Dev", company: "Acme", period: "2020 – 2024", achievements: ["Did X", "Did Y"] }],
  education: [{ degree: "BSc CS", institution: "UPC", year: "2019" }],
  skills: ["Python", "SQL", "Docker", "AWS", "Git"],
  languages: [{ language: "English", level: "C1" }],
  photoPrompt: "headshot",
};

describe("renderCvHtml", () => {
  it("renders every template variant with all sections and heading markers", () => {
    for (let variant = 0; variant < TEMPLATE_COUNT; variant++) {
      const html = renderCvHtml(candidate, "data:image/svg+xml;base64,x", variant);
      for (const heading of ["SUMMARY", "EXPERIENCE", "EDUCATION", "SKILLS", "LANGUAGES"]) {
        expect(html).toContain(heading);
      }
      expect(html).toContain("Test Person");
      expect(html).toContain("UPC");
    }
  });

  it("escapes HTML in candidate data", () => {
    const html = renderCvHtml({ ...candidate, fullName: "<script>x</script>" }, "", 0);
    expect(html).not.toContain("<script>x</script>");
  });
});
```

Run: `npm test -- scripts/__tests__/cv-template.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement templates**

`scripts/cv-template.ts` — export `TEMPLATE_COUNT = 3` and `renderCvHtml(candidate, photoDataUri, variant): string`. One shared `esc()` HTML-escaper applied to every field. Three visual variants sharing one section-body builder: (0) classic serif single-column, (1) modern sans with colored sidebar for contact/skills, (2) minimal two-column. Full self-contained HTML with inline CSS, A4-friendly (`@page { size: A4; margin: 0 }`), photo top-right/circle, headings rendered EXACTLY as `SUMMARY`, `EXPERIENCE`, `EDUCATION`, `SKILLS`, `LANGUAGES` (uppercase text in the DOM, not CSS `text-transform` — extraction must see them). ~150 lines; implementer writes the CSS.

Run: `npm test -- scripts/__tests__/cv-template.test.ts` → PASS.

- [ ] **Step 4: Implement orchestrator**

```ts
// scripts/generate-cvs.ts
import "dotenv/config"; // tsx does not auto-load .env.local
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { generateText, generateImage, Output } from "ai";
import { openrouter, CHAT_MODEL, IMAGE_MODEL } from "@/lib/openrouter";
import { batchSchema, generationPrompt, type Candidate } from "./cv-schema";
import { renderCvHtml, TEMPLATE_COUNT } from "./cv-template";

const TOTAL = 28;
const BATCH_SIZE = 7; // small batches keep JSON generation reliable
const OUT_DIR = path.join(process.cwd(), "data", "cvs");

const kebab = (name: string) =>
  name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-");

async function generateBatch(count: number, existingNames: string[], attempt = 1): Promise<Candidate[]> {
  try {
    const result = await generateText({
      model: openrouter(CHAT_MODEL),
      output: Output.object({ schema: batchSchema }),
      prompt: generationPrompt(count, existingNames),
    });
    return result.output.candidates;
  } catch (error) {
    if (attempt >= 3) throw error;
    console.warn(`Batch attempt ${attempt} failed (${String(error)}); retrying...`);
    return generateBatch(count, existingNames, attempt + 1);
  }
}

function initialsAvatar(name: string): string {
  const initials = name.split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="240" height="240" fill="#334155"/><text x="120" y="150" font-family="sans-serif" font-size="88" fill="#fff" text-anchor="middle">${initials}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

async function generatePhoto(candidate: Candidate): Promise<string> {
  try {
    const { image } = await generateImage({
      model: openrouter.imageModel(IMAGE_MODEL),
      prompt: `Professional CV headshot photo: ${candidate.photoPrompt}. Photorealistic, plain light background, business attire.`,
    });
    return `data:${image.mediaType};base64,${image.base64}`;
  } catch (error) {
    console.warn(`Photo failed for ${candidate.fullName}, using avatar: ${String(error)}`);
    return initialsAvatar(candidate.fullName);
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const candidates: Candidate[] = [];
  while (candidates.length < TOTAL) {
    const batch = await generateBatch(
      Math.min(BATCH_SIZE, TOTAL - candidates.length),
      candidates.map(c => c.fullName),
    );
    candidates.push(...batch);
    console.log(`Generated ${candidates.length}/${TOTAL} profiles`);
  }

  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const [i, candidate] of candidates.slice(0, TOTAL).entries()) {
    const photo = await generatePhoto(candidate);
    const html = renderCvHtml(candidate, photo, i % TEMPLATE_COUNT);
    await page.setContent(html, { waitUntil: "networkidle" });
    const file = path.join(OUT_DIR, `${kebab(candidate.fullName)}.pdf`);
    await page.pdf({ path: file, format: "A4", printBackground: true });
    console.log(`  [${i + 1}/${TOTAL}] ${file}`);
  }
  await browser.close();
  await writeFile(path.join(OUT_DIR, ".gitkeep"), "");
  console.log("Done.");
}

main().catch(error => { console.error(error); process.exit(1); });
```
Also: `npm i dotenv`. Note `Output`/`generateImage` imports and `openrouter.imageModel()` are the verified v6 APIs.

- [ ] **Step 5: Run for real and inspect**

Run: `npm run generate-cvs` (requires `OPENROUTER_API_KEY`; image model costs ~$1 for 28 photos — script degrades to avatars if the key can't pay).
Expected: 28 PDFs in `data/cvs/`. Verify: `ls data/cvs/*.pdf | wc -l` → 28. Open 2–3 PDFs (one per template variant) and visually confirm: photo present, sections legible, one Spanish CV, one UPC graduate (`grep`-able in Task 6).

- [ ] **Step 6: Lint, typecheck, commit**

```bash
npm run lint && npx tsc --noEmit
git add scripts data/cvs package*.json && git commit -m "feat: CV generation pipeline (LLM profiles -> HTML templates -> PDF, AI photos)"
```

---

### Task 6: Ingestion script (`scripts/ingest.ts`)

**Files:**
- Create: `scripts/chunker.ts`, `scripts/ingest.ts`
- Test: `scripts/__tests__/chunker.test.ts`

**Interfaces:**
- Consumes: `getLocalEmbedder()` from `@/lib/embeddings`; `IndexedChunk` type from `@/lib/retrieval`; PDFs from Task 5.
- Produces: `data/index.json` = `IndexedChunk[]`; `chunkCvText(text: string, candidate: string, file: string): Omit<IndexedChunk, "vector">[]`.

- [ ] **Step 1: Failing chunker test**

```ts
// scripts/__tests__/chunker.test.ts
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
```

Run: `npm test -- scripts/__tests__/chunker.test.ts` → FAIL.

- [ ] **Step 2: Implement chunker**

```ts
// scripts/chunker.ts
import type { IndexedChunk } from "@/lib/retrieval";

const HEADINGS = ["SUMMARY", "EXPERIENCE", "EDUCATION", "SKILLS", "LANGUAGES"] as const;

const titleCase = (s: string) => s[0] + s.slice(1).toLowerCase();

/**
 * Splits extracted CV text on the uppercase section headings emitted by the
 * PDF templates. Each chunk's text is prefixed with "<candidate> — <section>:"
 * so its embedding carries the candidate's identity.
 */
export function chunkCvText(
  text: string,
  candidate: string,
  file: string,
): Omit<IndexedChunk, "vector">[] {
  const pattern = new RegExp(`^\\s*(${HEADINGS.join("|")})\\s*$`, "m");
  const chunks: Omit<IndexedChunk, "vector">[] = [];
  let remaining = text;
  let currentSection = "Header";
  let index = 0;

  while (remaining.length > 0) {
    const match = pattern.exec(remaining);
    const body = (match ? remaining.slice(0, match.index) : remaining).trim();
    if (body.length > 0) {
      chunks.push({
        id: `${file}#${index++}`,
        candidate,
        section: currentSection,
        file,
        text: `${candidate} — ${currentSection}: ${body}`,
      });
    }
    if (!match) break;
    currentSection = titleCase(match[1]);
    remaining = remaining.slice(match.index + match[0].length);
  }
  return chunks;
}
```

Run: `npm test -- scripts/__tests__/chunker.test.ts` → PASS.

- [ ] **Step 3: Implement ingest orchestrator**

```ts
// scripts/ingest.ts
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
```
NOTE: verify `extractText`'s exact signature against `node_modules/unpdf` before running; adjust if the API differs.

- [ ] **Step 4: Run for real**

Run: `npm run ingest`
Expected: one line per PDF (5–6 chunks each), final "Wrote ~160 chunks from 28 CVs". Sanity: `python3 -c "import json;d=json.load(open('data/index.json'));print(len(d), len(d[0]['vector']))"` → `~160 384`. Spot-check: `grep -c UPC data/index.json` ≥ 1.

- [ ] **Step 5: Lint, typecheck, commit**

```bash
npm run lint && npx tsc --noEmit
git add scripts data/index.json && git commit -m "feat: ingestion pipeline (PDF text -> section chunks -> MiniLM vectors -> JSON index)"
```

---

### Task 7: Chat API route (`app/api/chat/route.ts`)

**Files:**
- Create: `app/api/chat/route.ts`, `lib/chat-types.ts`

**Interfaces:**
- Consumes: `getLocalEmbedder`, `loadIndex`, `rankChunks`, `openrouter`, `CHAT_MODEL`.
- Produces: `POST /api/chat` streaming UI-message response; `ChatMessage` type with `data-sources` part = `{ sources: Array<{ candidate: string; section: string; file: string; score: number }> }` — the UI (Task 8) renders these as chips.

- [ ] **Step 1: Shared message type**

```ts
// lib/chat-types.ts
import type { UIMessage } from "ai";

export type SourceRef = { candidate: string; section: string; file: string; score: number };

export type ChatMessage = UIMessage<never, { sources: { sources: SourceRef[] } }>;
```

- [ ] **Step 2: Implement route**

```ts
// app/api/chat/route.ts
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
} from "ai";
import { getLocalEmbedder } from "@/lib/embeddings";
import { loadIndex, rankChunks } from "@/lib/retrieval";
import { openrouter, CHAT_MODEL } from "@/lib/openrouter";
import type { ChatMessage, SourceRef } from "@/lib/chat-types";

export const maxDuration = 60;

const TOP_K = 8;
const MIN_SCORE = 0.25; // below this, retrieval found nothing relevant

const systemPrompt = (context: string) => `You are a CV screening assistant. Answer the recruiter's question using ONLY the CV excerpts below.
Rules:
- If the excerpts do not contain the answer, say plainly that the CVs don't mention it. Never invent facts.
- Cite candidates inline by name in **bold** when you use their CV.
- Be concise and recruiter-friendly; use short lists when comparing candidates.

CV excerpts:
${context}`;

export async function POST(req: Request) {
  const { messages }: { messages: ChatMessage[] } = await req.json();

  const lastUser = messages.findLast(m => m.role === "user");
  const query = lastUser?.parts.filter(p => p.type === "text").map(p => p.text).join("\n") ?? "";

  const [queryVector] = await getLocalEmbedder().embed([query]);
  const retrieved = rankChunks(queryVector, loadIndex(), TOP_K);
  const relevant = retrieved.filter(c => c.score >= MIN_SCORE);

  // Deduplicate sources per candidate+section for the UI
  const sources: SourceRef[] = [...new Map(
    relevant.map(c => [`${c.file}#${c.section}`, {
      candidate: c.candidate, section: c.section, file: c.file, score: c.score,
    }]),
  ).values()];

  const context = relevant.map(c => c.text).join("\n\n---\n\n")
    || "No relevant CV excerpts were found for this question.";

  const stream = createUIMessageStream<ChatMessage>({
    execute: ({ writer }) => {
      writer.write({ type: "data-sources", id: "sources", data: { sources } });
      const result = streamText({
        model: openrouter(CHAT_MODEL),
        system: systemPrompt(context),
        messages: convertToModelMessages(messages),
      });
      writer.merge(result.toUIMessageStream());
    },
    onError: error =>
      error instanceof Error && error.message.includes("429")
        ? "The free model is rate-limited right now — wait a few seconds and try again."
        : `Something went wrong talking to the model: ${error instanceof Error ? error.message : "unknown error"}`,
  });

  return createUIMessageStreamResponse({ stream });
}
```
(`convertToModelMessages` strips unknown data parts; if it rejects `data-sources` parts on history replay, pass `messages.map(m => ({ ...m, parts: m.parts.filter(p => p.type !== "data-sources") }))` — decide by testing in Task 8.)

- [ ] **Step 3: Verify with curl**

Run dev server (`npm run dev`), then:
```bash
curl -sN -X POST localhost:3000/api/chat -H 'content-type: application/json' \
  -d '{"messages":[{"id":"1","role":"user","parts":[{"type":"text","text":"Who has experience with Python?"}]}]}' | head -30
```
Expected: SSE stream containing a `data-sources` part and text deltas naming real candidates.

- [ ] **Step 4: Lint, typecheck, commit**

```bash
npm run lint && npx tsc --noEmit
git add app lib && git commit -m "feat: RAG chat endpoint with grounding and streamed source metadata"
```

---

### Task 8: Chat UI (`app/page.tsx`)

**Files:**
- Modify: `app/page.tsx` (replace scaffold), `app/layout.tsx` (title/metadata), `app/globals.css` (only if needed)
- Create: `app/components/source-chips.tsx`, `app/api/cvs/[file]/route.ts`

**Interfaces:**
- Consumes: `ChatMessage`, `SourceRef` from `@/lib/chat-types`; `POST /api/chat`.
- Produces: chat page at `/`; `GET /api/cvs/<file>` serves a PDF from `data/cvs`.

- [ ] **Step 1: PDF serving route**

```ts
// app/api/cvs/[file]/route.ts
import { readFile } from "node:fs/promises";
import path from "node:path";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const { file } = await params;
  const safe = path.basename(file); // no traversal
  if (!safe.endsWith(".pdf")) return new Response("Not found", { status: 404 });
  try {
    const buffer = await readFile(path.join(process.cwd(), "data", "cvs", safe));
    return new Response(new Uint8Array(buffer), {
      headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${safe}"` },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
```

- [ ] **Step 2: Source chips component**

```tsx
// app/components/source-chips.tsx
import type { SourceRef } from "@/lib/chat-types";

export function SourceChips({ sources }: { sources: SourceRef[] }) {
  if (sources.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {sources.map(s => (
        <a
          key={`${s.file}#${s.section}`}
          href={`/api/cvs/${s.file}`}
          target="_blank"
          rel="noreferrer"
          title={`similarity ${s.score.toFixed(2)} — open PDF`}
          className="rounded-full border border-slate-300 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
        >
          {s.candidate} · {s.section}
        </a>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Chat page**

```tsx
// app/page.tsx
"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState } from "react";
import type { ChatMessage } from "@/lib/chat-types";
import { SourceChips } from "./components/source-chips";

const SUGGESTIONS = [
  "Who has experience with Python?",
  "Which candidate graduated from UPC?",
  "Compare the two strongest data engineers.",
];

export default function Page() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, error } = useChat<ChatMessage>({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });

  const submit = (text: string) => {
    if (text.trim() && status === "ready") {
      sendMessage({ text });
      setInput("");
    }
  };

  return (
    <main className="mx-auto flex h-dvh max-w-2xl flex-col p-4">
      <header className="border-b border-slate-200 pb-3 dark:border-slate-700">
        <h1 className="text-lg font-semibold">CV Screener</h1>
        <p className="text-sm text-slate-500">Ask questions about the 28 indexed CVs.</p>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto py-4">
        {messages.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map(s => (
              <button key={s} onClick={() => submit(s)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map(message => (
          <div key={message.id} className={message.role === "user" ? "text-right" : ""}>
            <div className={`inline-block max-w-[85%] whitespace-pre-wrap rounded-xl px-3.5 py-2 text-sm ${
              message.role === "user"
                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                : "bg-slate-100 dark:bg-slate-800"
            }`}>
              {message.parts.map((part, i) =>
                part.type === "text" ? <span key={i}>{part.text}</span> : null,
              )}
              {message.role === "assistant" &&
                message.parts.map((part, i) =>
                  part.type === "data-sources"
                    ? <SourceChips key={i} sources={part.data.sources} />
                    : null,
                )}
            </div>
          </div>
        ))}
        {status === "submitted" && <p className="text-sm text-slate-400">Searching CVs…</p>}
        {error && <p className="text-sm text-red-500">{error.message}</p>}
      </div>

      <form onSubmit={e => { e.preventDefault(); submit(input); }} className="flex gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="e.g. Who has worked in fintech?"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 dark:border-slate-600 dark:bg-slate-900"
        />
        <button type="submit" disabled={status !== "ready"}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900">
          Ask
        </button>
      </form>
    </main>
  );
}
```
Also update `app/layout.tsx` metadata: title "CV Screener", description "RAG-powered chat over generated CVs". Keep markdown rendering plain (whitespace-pre-wrap) — YAGNI unless answers look bad, in which case `npm i react-markdown` and wrap text parts.

- [ ] **Step 4: Manual verification in browser**

Run `npm run dev`, open `localhost:3000`, click "Who has experience with Python?".
Expected: streaming answer with bold candidate names + source chips; chip click opens the PDF in a new tab.

- [ ] **Step 5: Lint, typecheck, commit**

```bash
npm run lint && npx tsc --noEmit
git add app && git commit -m "feat: streaming chat UI with source chips and PDF viewer"
```

---

### Task 9: End-to-end verification + docs + deliverables

**Files:**
- Create: `README.md` (replace scaffold), `docs/video-outline.md`
- Modify: `tasks/todo.md` (results review)

**Interfaces:**
- Consumes: the finished app.

- [ ] **Step 1: Run the spec's verification checklist against the real app**

With `npm run dev` running, ask in the browser and record results in `tasks/todo.md`:
1. "Who has experience with Python?" → names only actual Python candidates, chips shown.
2. "Which candidate graduated from UPC?" → the seeded UPC graduate.
3. "Summarize the profile of <a real generated name>." → grounded summary.
4. "Who has a pilot's license?" → states the CVs don't mention it (no hallucination).

Any failure → fix (likely retrieval K, MIN_SCORE, or system prompt) before proceeding.

- [ ] **Step 2: README with architecture + mermaid workflow diagram**

Sections: What it is · Quickstart (`cp .env.example .env.local`, add key, `npm i`, `npx playwright install chromium`, `npm run dev` — note that generated PDFs/index are committed so generation is optional) · Regenerating the dataset (`npm run generate-cvs`, `npm run ingest`, costs note) · Architecture (mermaid flowchart: generation script → PDFs → ingest → index.json → chat route → UI; annotate "local MiniLM" and "OpenRouter") · Design decisions (local embeddings + benchmark numbers, no vector DB at 300 vectors, no RAG framework, grounding rule) · Project structure.

- [ ] **Step 3: Video outline (`docs/video-outline.md`)**

5-minute script hitting the brief's three beats: (1) Process — generation pipeline + show 2 CVs + ingest run; (2) Demo — the 4 verification questions live; (3) Technical highlight — walk through `route.ts` retrieval-to-prompt flow, the benchmark story (local embeddings, ~5 ms retrieval), and the roads-not-taken (vector DB, LangChain).

- [ ] **Step 4: Final check + commit**

```bash
npm run lint && npx tsc --noEmit && npm test
git add -A && git commit -m "docs: README with architecture diagram, video outline, verification results"
```

---

## Self-review notes

- Spec coverage: generation (T5), ingestion (T6), chat API + grounding + sources (T7), UI + chips + PDF links (T8), error handling (T5 retries/avatar fallback, T7 onError), verification checklist + README/diagram/video outline (T9). ✔
- Heading contract between templates (T5) and chunker (T6) stated in both tasks' Interfaces. ✔
- Types consistent: `IndexedChunk`/`RetrievedChunk` (T3) used by T6/T7; `ChatMessage`/`SourceRef` (T7) used by T8. ✔
- Known uncertainty flagged inline: `unpdf` extract signature (T6 note), `convertToModelMessages` with data parts (T7 note).
