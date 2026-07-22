# CV Screener — Task Tracker

Plan: `docs/superpowers/plans/2026-07-22-cv-screener.md` (spec: `docs/superpowers/specs/2026-07-22-cv-screener-design.md`)

## Tasks

- [x] Task 1: Scaffold Next.js app + tooling (deps, vitest, env, npm scripts)
- [x] Task 2: Embeddings module — local MiniLM behind `Embedder` interface (TDD)
- [x] Task 3: Retrieval module — cosine top-k over JSON index (TDD)
- [x] Task 4: OpenRouter client config with env-overridable model IDs
- [x] Task 5: CV generation script — LLM profiles → HTML templates → PDFs + AI photos
- [x] Task 6: Ingestion script — PDF text → section chunks → vectors → index.json (TDD chunker)
- [x] Task 7: Chat API route — RAG with grounding + streamed source metadata
- [x] Task 8: Chat UI — streaming answers, source chips, PDF viewer route
- [x] Task 9: E2E verification (4 demo questions), README + mermaid diagram, video outline

## Review / results

### Task 9 — E2E verification

Ran live against `npm run dev` via `curl` against `POST /api/chat` using the same
`UIMessage[]` shape `DefaultChatTransport` sends (Chrome browser automation was available but
required an interactive account-selection prompt not appropriate mid-task; curl exercises the
identical backend/request format, treated as equivalent evidence).

**First pass surfaced a real retrieval gap:** Q2 (UPC) initially returned only 1 of 4 real UPC
graduates in the corpus. Root cause: `TOP_K=8` truncated the ranked list right before Carlos
Mendez's Education chunk (score 0.2699, rank 8 — above `MIN_SCORE=0.25` but past the K cutoff).
Verified `MIN_SCORE=0.25` itself was a safe, well-separated gate (the negative "pilot's
license" query never exceeds 0.2337 across the full 168-chunk index) before touching anything,
then raised `TOP_K` from 8 to 15 (unchanged `MIN_SCORE`) — the minimal fix that only lets more
already-above-threshold chunks through, verified via a full-index rank dump before applying.
Re-ran all 4 questions after the fix; results below are post-fix.

1. **"Who has experience with Python?"** → *"All of the candidates listed have Python
   experience: **Hannah Schmidt**, **Elena Rossi**, **Marc Serra**, **Ana Garcia**, **Ingrid
   Nilsson**, **Edward Whitaker**, **Lucia Navarro**, **Jens Van Der Meer**, and **Carlos
   Mendez**."* — 9 source chips returned, all real Python-mentioning candidates per the
   corpus, zero false positives. **PASS**
2. **"Which candidate graduated from UPC?"** → *"**Luis Martinez** and **Carlos Mendez** both
   graduated from UPC."* — both are real UPC graduates (verified directly against
   `data/index.json`: 4 of 28 CVs mention UPC in their Education section — Carlos Mendez,
   Lucia Navarro, Luis Martinez, Marc Serra). No hallucination; 2 of 4 surfaced. Marc Serra
   (score 0.2493) and Lucia Navarro (score 0.1879, rank 47) remain below/outside the
   retrieval window — a semantic-embedding recall limit on a short acronym query, not a
   grounding failure. **PASS** (correct and grounded; recall is partial and documented).
3. **"Summarize the profile of Marta Lopez."** → *"**Marta Lopez** is a Marketing Manager
   with over 6 years of experience in digital strategy, campaign management, and performance
   analysis, focused on driving growth for B2C and B2B brands. She holds an MBA from IE
   Business School (2017) and a Bachelor's in Business Administration from Universidad
   Complutense de Madrid (2015). Her skill set includes SEO, SEM, Google Ads, Meta Ads, Google
   Analytics, Mailchimp, Hootsuite, advanced Excel, basic Python (pandas for data analysis),
   project management, and team leadership. She is a native Spanish speaker, has advanced
   English, and intermediate French proficiency."* — coherent, fully grounded in Marta Lopez's
   own Header/Languages/Education/Summary/Skills chunks. **PASS**
4. **"Who has a pilot's license?"** → *"The CV excerpts do not mention any candidate having a
   pilot's license. No relevant information was found in the provided excerpts."* — zero
   sources returned (nothing cleared `MIN_SCORE`); no hallucination. **PASS**

**Deviation from brief:** `TOP_K` in `app/api/chat/route.ts` changed from 8 to 15 (`MIN_SCORE`
unchanged at 0.25) to fix the UPC recall gap above. Documented inline in `route.ts` and in the
README's design-decisions section.

Full details, streamed responses, and command output: `.superpowers/sdd/task-9-report.md`.
