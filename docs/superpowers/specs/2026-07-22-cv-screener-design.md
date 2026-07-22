# AI-Powered CV Screener — Design

**Date:** 2026-07-22
**Context:** Interview business case (Full-Stack AI Engineer). Build an end-to-end prototype: generate 25–30 fake PDF CVs, index them with a RAG pipeline, and answer questions about them through a chat UI. Deliverables: working app, source code, <5-min video; optional workflow diagram.

## Decisions (settled during brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| Stack | Single Next.js (App Router) + TypeScript app | One repo, one `npm run dev`; AI SDK gives streaming chat; full-stack JS signal for the role |
| LLM provider | OpenRouter (one API key) | Free-tier models; chat and image generation through one key |
| Embeddings | Local MiniLM (`Xenova/all-MiniLM-L6-v2`) via transformers.js | Benchmarked on this machine: query embed 1–3 ms, search <2 ms over 300 vectors, index build <1 s. Zero cost, offline retrieval. Behind a swappable `Embedder` interface as a safety net |
| Vector store | Plain JSON file loaded in memory | ~300 vectors × 384 dims needs no database; mention LanceDB/pgvector in video as the at-scale answer |
| RAG framework | None (hand-rolled, ~100 lines) | Full understanding to demo in the video; frameworks addressed as roads-not-taken |
| CV photos | OpenRouter image model, data-URI embedded | Same key/pipeline as text generation; fallback to initials avatar on failure |

## Architecture

```
scripts/generate-cvs.ts   OpenRouter LLM → candidate JSON (zod-validated)
                          → HTML template (2–3 variants) + AI photo
                          → headless Chromium (Playwright) → data/cvs/*.pdf

scripts/ingest.ts         data/cvs/*.pdf → text extraction → section-aware
                          chunks ({candidate, section} metadata) → MiniLM
                          embeddings → data/index.json

app/api/chat/route.ts     query → local embed (~3 ms) → cosine top-k (k≈8)
                          → grounded prompt with excerpts → OpenRouter chat
                          model (AI SDK, streaming) → answer + source metadata

app/page.tsx              Chat UI: streaming markdown answers, source chips
                          (candidate + section, click → opens PDF), input box
```

### Repo structure

```
leadtech/
├── app/
│   ├── page.tsx              # Chat UI
│   └── api/chat/route.ts     # RAG endpoint
├── lib/
│   ├── embeddings.ts         # Embedder interface + MiniLM implementation
│   ├── retrieval.ts          # cosine top-k over the index
│   └── openrouter.ts         # model client configuration
├── scripts/
│   ├── generate-cvs.ts       # Script 1: CV generation
│   └── ingest.ts             # Script 2: indexing
├── data/
│   ├── cvs/*.pdf             # generated CVs (served to the UI)
│   └── index.json            # vector index
└── docs/                     # this spec, workflow diagram, video outline
```

Config: `OPENROUTER_API_KEY` in `.env.local`; chat/image model names via env vars with free-tier defaults.

## Component details

### CV generation (`scripts/generate-cvs.ts`)

- LLM generates structured candidate profiles as JSON: name, contact, summary, experience, education, skills, languages. Validated with zod; malformed generations retried.
- Diversity constraints in the prompt: varied roles, nationalities, languages, seniority. Seeded edge cases so demo questions land (e.g., at least one UPC graduate, several Python users).
- Rendering: profile JSON → HTML/CSS template (2–3 visual variants) → Playwright print-to-PDF.
- Photos: OpenRouter image model per candidate, embedded as data URI. On failure: retry, then styled initials avatar — one flaky call never blocks the batch.
- **Integrity rule: the RAG pipeline never reads the profile JSON. It reads only the PDFs**, as the brief requires ("the system must extract text from the provided PDF documents").

### Ingestion (`scripts/ingest.ts`)

- Extract text per PDF, split on the section headings the templates emit, attach `{candidate, section}` metadata to every chunk (~10 chunks/CV, ~300 total).
- Embed all chunks with local MiniLM; write `data/index.json` (id, candidate, section, text, vector).
- Idempotent and re-runnable; full run ~10 s.

### Chat API (`app/api/chat/route.ts`)

- Per message: embed query locally → cosine top-k (k≈8) → grounded system prompt: answer only from the excerpts, say so if not present, cite candidates as [Name].
- Stream completion via AI SDK + OpenRouter. Response carries retrieved-chunk metadata for the UI's source chips.
- Grounding (optional requirement, implemented): low top-similarity → honest "not found in the CVs" response.

### Chat UI (`app/page.tsx`)

- Single page: message list with streaming markdown answers, input box, source chips under each answer (candidate + section; click opens the PDF). Header notes corpus size. No component-library sprawl.

## Error handling

- OpenRouter failures surface as readable chat errors, including rate-limit hints (free models throttle).
- Generation script validates and retries malformed LLM JSON; photo failures degrade to avatars.

## Testing / verification

Run against the real app before declaring done:

1. "Who has experience with Python?" → names Python candidates with source chips.
2. "Which candidate graduated from UPC?" → the seeded UPC graduate.
3. "Summarize the profile of <candidate>." → coherent grounded summary.
4. Negative: "Who has a pilot's license?" → refuses / says not in the CVs.

## Deliverables support

- README: setup, architecture, mermaid workflow diagram (optional deliverable).
- `docs/video-outline.md`: suggested 5-minute walkthrough hitting the brief's three beats (process, demo, technical highlight).

## Out of scope

- Deployment/hosting (brief says local is fine), auth, persistence of chat history, vector database, RAG framework, multi-user support.
