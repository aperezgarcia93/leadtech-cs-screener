# Video outline (~5 minutes)

Three beats: process, demo, technical highlight. Rough timing in brackets — adjust live to
however the pipeline actually runs that day.

## 1. Process — the generation & ingestion pipeline [~90s]

- One-line framing: "28 fake CVs, generated end to end, indexed for retrieval, answered
  through a grounded chat UI. Two offline scripts build the dataset; everything else is
  runtime."
- Run `npm run generate-cvs` (or narrate over a pre-recorded run if the free-tier model is
  rate-limited that day) — call out:
  - Candidate profiles come from an OpenRouter chat model, validated against a zod schema,
    generated in small batches of 7 for reliability.
  - Each profile is rendered into one of a few HTML templates and printed to PDF with headless
    Chromium (Playwright) — no PDF library hand-rolling.
  - Each candidate gets an AI-generated headshot from an OpenRouter image model, with a
    graceful fallback to a styled initials avatar if that one call fails — one flaky image
    call never blocks the batch.
- Open two generated CVs side by side (`data/cvs/*.pdf`) to show the visual template variety
  and that they read like real CVs — different roles, different section layouts.
- Run `npm run ingest` — call out: extracts text per PDF, splits on the section headings the
  templates emit (Summary, Experience, Education, Skills, Languages, …), tags every chunk with
  `{candidate, section}` metadata, embeds all ~168 chunks locally with MiniLM, writes
  `data/index.json`. Runs in seconds, no API calls.

## 2. Demo — the four verification questions, live [~120s]

Ask each in the running chat UI (`npm run dev`, `http://localhost:3000`) and let it stream:

1. **"Who has experience with Python?"** — names only real Python-skilled candidates, each
   backed by a source chip (candidate + section) that opens the underlying PDF on click.
2. **"Which candidate graduated from UPC?"** — correctly identifies real UPC graduates from
   the corpus, grounded in their Education chunks, no invented names.
3. **"Summarize the profile of `<a real candidate name>`."** — a coherent, grounded summary
   pulled from that one candidate's Header/Summary/Education/Skills chunks.
4. **"Who has a pilot's license?"** (negative test) — the model plainly states the CVs don't
   mention it, instead of guessing. This is the moment to point at: retrieval found nothing
   above the relevance threshold, so the model was handed no excerpts to hallucinate from.

## 3. Technical highlight [~90s]

- Walk through `app/api/chat/route.ts` top to bottom, live in the editor:
  1. Pull the last user message out of the AI SDK's `UIMessage[]` payload.
  2. Embed it locally (`getLocalEmbedder().embed(...)`) — no network call.
  3. `rankChunks` (`lib/retrieval.ts`) does cosine similarity against every cached in-memory
     vector and returns the top-K.
  4. Filter by `MIN_SCORE` — this is the actual relevance gate, not `TOP_K`; it's what makes
     the negative test work.
  5. Join the surviving chunks into a grounded system prompt ("answer ONLY from these
     excerpts, say so if the answer isn't here, cite by name") and stream a completion with
     the AI SDK + OpenRouter, writing retrieved source metadata into the stream alongside the
     answer for the UI's source chips.
- Benchmark story: local MiniLM embeds a query in ~1–3 ms and cosine search over ~300 vectors
  takes under 2 ms — call it ~5 ms of retrieval work per question, in-process, for free. That's
  what makes "no vector DB, no RAG framework" a reasonable choice at this scale rather than a
  shortcut.
- Roads not taken, and why:
  - **A vector database** (LanceDB, pgvector, …) — the right call once the corpus is large
    enough that linear cosine scan over an in-memory array stops being "a few milliseconds."
    At ~300 vectors it would add an external dependency to solve a problem that doesn't exist
    yet.
  - **A RAG framework** (LangChain, LlamaIndex, …) — the entire retrieval-to-prompt path is
    about 40 lines of plain TypeScript. A framework would trade that transparency for
    abstraction the app doesn't need at this size, and would obscure exactly the mechanics
    this section is demonstrating.
