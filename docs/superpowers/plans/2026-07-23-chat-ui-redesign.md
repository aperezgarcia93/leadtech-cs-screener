# Chat UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the CV screener's chat UI into a responsive, DESIGN.md-adapted interface with four new UX features: a searchable candidate directory, a persistent shortlist, contextual follow-up suggestions, and a new-chat reset.

**Architecture:** `app/page.tsx` becomes a Server Component that reads the candidate directory once and hands it to a client-side `ChatApp` component tree. `ChatApp` owns all interactive state (chat, shortlist, sidebar) and composes focused, independently reviewable sub-components. No backend/API changes.

**Tech Stack:** Next.js App Router (Server + Client Components), Tailwind CSS v4 (CSS-first `@theme` config), `next/font/google` (JetBrains Mono), existing AI SDK v6 chat stack (unchanged).

## Global Constraints

- TypeScript `strict: true`; no `any`; `npm run lint` and `npx tsc --noEmit` must pass before every commit.
- Spec: `docs/superpowers/specs/2026-07-23-chat-ui-redesign-design.md`. Visual approach is "Option A" — DESIGN.md's palette/type/spacing/shape language applied to a conventional chat layout, NOT a terminal/TUI reinterpretation.
- No changes to `app/api/chat/route.ts`, `app/api/cvs/[file]/route.ts`, `lib/retrieval.ts`, `lib/embeddings.ts`, `lib/openrouter.ts`, or `lib/chat-types.ts` — this plan is UI-only.
- Dark mode via `prefers-color-scheme` (no manual toggle), following the existing pattern already in the codebase.
- Shortlist persists in `localStorage` under key `cv-screener:shortlist`; survives page refresh. Chat conversation does not persist (resets only via the explicit "New chat" button).
- Package manager: npm. Commit after every task (conventional commits).
- All touch targets ≥36px tall. No `box-shadow` anywhere (hairline borders instead, per DESIGN.md).

---

### Task 1: Design tokens, fonts, and theme wiring

**Files:**
- Modify: `app/globals.css` (full rewrite)
- Modify: `app/layout.tsx`

**Interfaces:**
- Produces: Tailwind color utilities `bg-canvas`/`text-canvas`, `bg-ink`/`text-ink`, `text-body`, `text-mute`, `bg-surface-soft`, `bg-surface-card`, `border-hairline`, `border-hairline-strong`, `bg-accent`/`text-accent`/`border-accent`, `text-success`, `text-danger`, `text-warning` — all theme-aware (light/dark via `prefers-color-scheme`). `font-mono` utility resolves to JetBrains Mono. Standard Tailwind `rounded` (4px) and Tailwind's default spacing scale (already 4px-based) are used as-is for the 4px-radius / 8px-spacing system — no new tokens needed for those.

- [ ] **Step 1: Rewrite the theme CSS**

```css
/* app/globals.css */
@import "tailwindcss";

:root {
  --canvas: #fdfcfc;
  --ink: #201d1d;
  --body-text: #424245;
  --mute: #646262;
  --surface-soft: #f8f7f7;
  --surface-card: #f1eeee;
  --hairline: rgba(15, 0, 0, 0.12);
  --hairline-strong: #646262;
  --accent: #007aff;
  --accent-hover: #0056b3;
  --success: #30d158;
  --danger: #ff3b30;
  --warning: #ff9f0a;
}

@media (prefers-color-scheme: dark) {
  :root {
    --canvas: #201d1d;
    --ink: #fdfcfc;
    --body-text: #d8d6d6;
    --mute: #9a9898;
    --surface-soft: #302c2c;
    --surface-card: #3a3535;
    --hairline: rgba(253, 252, 252, 0.12);
    --hairline-strong: #9a9898;
    /* Lightened from the light-mode #007aff for AA contrast against the
       near-black dark canvas; DESIGN.md defines no dark palette, so this
       is an adaptation in the same spirit, not a spec value. */
    --accent: #409cff;
    --accent-hover: #66b1ff;
    --success: #30d158;
    --danger: #ff453a;
    --warning: #ff9f0a;
  }
}

@theme inline {
  --color-canvas: var(--canvas);
  --color-ink: var(--ink);
  --color-body: var(--body-text);
  --color-mute: var(--mute);
  --color-surface-soft: var(--surface-soft);
  --color-surface-card: var(--surface-card);
  --color-hairline: var(--hairline);
  --color-hairline-strong: var(--hairline-strong);
  --color-accent: var(--accent);
  --color-accent-hover: var(--accent-hover);
  --color-success: var(--success);
  --color-danger: var(--danger);
  --color-warning: var(--warning);
  --font-mono:
    var(--font-jetbrains-mono), ui-monospace, SFMono-Regular, Menlo, Monaco,
    Consolas, "Liberation Mono", "Courier New", monospace;
}

body {
  background-color: var(--canvas);
  color: var(--ink);
}
```

- [ ] **Step 2: Wire JetBrains Mono and apply base theme classes in the layout**

```tsx
// app/layout.tsx
import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: "CV Screener",
  description: "RAG-powered chat over generated CVs",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full antialiased ${jetbrainsMono.variable}`}>
      <body className="flex min-h-full flex-col bg-canvas font-mono text-ink">
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Verify**

Run: `npm run lint && npx tsc --noEmit`
Expected: both clean.

Run: `npm run dev`, open `http://localhost:3000` (the existing `page.tsx` still renders at this point — later tasks replace its content, this step only verifies the theme layer). If browser automation is available, load the page and confirm via computed styles: `body`'s `background-color` is `rgb(253, 252, 252)` in light mode (or the dark equivalent under a dark OS/browser theme), and `font-family` includes "JetBrains Mono". If browser automation is not available, confirm instead that `npm run dev` starts without CSS/Tailwind compilation errors and that `curl -s http://localhost:3000 | grep -o 'font-mono\|bg-canvas'` finds the utility classes applied to the `<body>` tag in the rendered HTML.

If the `@theme inline` custom-property mapping doesn't produce working `bg-canvas`/`text-ink`/etc. utilities as written (Tailwind v4's exact CSS-variable-theming syntax), adjust the CSS to whatever construction makes these utilities resolve correctly, and note the deviation in your report — the goal (theme-aware color/font utilities driven by CSS custom properties) is fixed; the exact `@theme` syntax is not.

- [ ] **Step 4: Commit**

```bash
git add app/globals.css app/layout.tsx
git commit -m "feat: add DESIGN.md-adapted theme tokens and JetBrains Mono font"
```

---

### Task 2: Candidate directory data (`lib/candidates.ts`)

**Files:**
- Create: `lib/candidates.ts`
- Test: `lib/__tests__/candidates.test.ts`

**Interfaces:**
- Consumes: `loadIndex()`, `IndexedChunk` from `@/lib/retrieval` (existing, unchanged).
- Produces: `interface CandidateSummary { name: string; file: string; teaser: string | undefined }`, `function getCandidateDirectory(): CandidateSummary[]` (sorted by name), `function parseHeaderTeaser(candidate: string, headerText: string): string | undefined` (exported for testing).

- [ ] **Step 1: Write the failing tests**

```ts
// lib/__tests__/candidates.test.ts
import { describe, expect, it } from "vitest";
import { parseHeaderTeaser } from "@/lib/candidates";

describe("parseHeaderTeaser", () => {
  it("extracts title and location from a well-formed header", () => {
    const text =
      "Aisha Karim — Header: Aisha Karim Software Engineer (Principal) aisha.karim@example.com · +31 6 12345678 · Amsterdam, Netherlands";
    expect(parseHeaderTeaser("Aisha Karim", text)).toBe(
      "Software Engineer (Principal) · Amsterdam, Netherlands",
    );
  });

  it("matches the name even when the header preserves diacritics the filename-derived candidate name doesn't have", () => {
    const text =
      "Carlos Mendez — Header: Carlos Méndez Senior Software Engineer carlos.mendez@example.com · +49 30 1234 5678 · Berlin, Germany";
    expect(parseHeaderTeaser("Carlos Mendez", text)).toBe(
      "Senior Software Engineer · Berlin, Germany",
    );
  });

  it("skips leading stray content (e.g. a mis-chunked date range) before the name", () => {
    const text =
      "Antoine Dubois — Header: Mar 2021 – Present Jun 2018 – Feb 2021 Antoine Dubois Senior UX/UI Designer antoine.dubois@example.com · +33 1 23 45 67 89 · Paris, France";
    expect(parseHeaderTeaser("Antoine Dubois", text)).toBe(
      "Senior UX/UI Designer · Paris, France",
    );
  });

  it("returns undefined when the header text doesn't match the expected format", () => {
    expect(
      parseHeaderTeaser("Jane Doe", "Jane Doe — Header: something unexpected"),
    ).toBeUndefined();
  });

  it("returns undefined when the candidate name can't be found in the body", () => {
    const text =
      "Jane Doe — Header: Someone Else Engineer jane@example.com · 555-1234 · Nowhere";
    expect(parseHeaderTeaser("Jane Doe", text)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- lib/__tests__/candidates.test.ts`
Expected: FAIL — cannot resolve `@/lib/candidates`.

- [ ] **Step 3: Implement**

```ts
// lib/candidates.ts
import { loadIndex, type IndexedChunk } from "@/lib/retrieval";

export interface CandidateSummary {
  name: string;
  file: string;
  teaser: string | undefined;
}

function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Extracts a "<Title> · <Location>" teaser from a candidate's raw Header
 * chunk text. Returns undefined rather than a garbled string whenever the
 * header doesn't match the expected shape (e.g. mis-chunked content
 * leaking in ahead of the name — a known, tested limitation of the
 * chunker's heading regex, see scripts/chunker.ts).
 */
export function parseHeaderTeaser(candidate: string, headerText: string): string | undefined {
  const prefix = `${candidate} — Header: `;
  if (!headerText.startsWith(prefix)) return undefined;
  const body = headerText.slice(prefix.length);

  const parts = body.split(" · ");
  if (parts.length < 2) return undefined;
  const location = parts[parts.length - 1].trim();
  if (!location) return undefined;

  const beforePhone = parts[0];
  const emailMatch = beforePhone.match(/\S+@\S+\.\S+/);
  if (!emailMatch || emailMatch.index === undefined) return undefined;
  const beforeEmail = beforePhone.slice(0, emailMatch.index).trim();

  const words = beforeEmail.split(/\s+/).filter(Boolean);
  const candWords = candidate.toLowerCase().split(/\s+/).filter(Boolean);
  const normWords = words.map(w => stripDiacritics(w).toLowerCase());

  let nameEnd = -1;
  for (let i = 0; i <= normWords.length - candWords.length; i++) {
    if (candWords.every((cw, j) => normWords[i + j] === cw)) {
      nameEnd = i + candWords.length;
      break;
    }
  }
  if (nameEnd === -1) return undefined;

  const title = words.slice(nameEnd).join(" ").trim();
  if (!title) return undefined;

  return `${title} · ${location}`;
}

export function getCandidateDirectory(): CandidateSummary[] {
  const chunks = loadIndex();
  const headerByFile = new Map<string, IndexedChunk>();
  for (const chunk of chunks) {
    if (chunk.section === "Header" && !headerByFile.has(chunk.file)) {
      headerByFile.set(chunk.file, chunk);
    }
  }
  return [...headerByFile.values()]
    .map(chunk => ({
      name: chunk.candidate,
      file: chunk.file,
      teaser: parseHeaderTeaser(chunk.candidate, chunk.text),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- lib/__tests__/candidates.test.ts`
Expected: PASS (5/5).

- [ ] **Step 5: Sanity-check against the real corpus**

Run: `npx tsx -e "import { getCandidateDirectory } from './lib/candidates'; const d = getCandidateDirectory(); console.log(d.length, d.filter(c => c.teaser === undefined).length); console.log(d.slice(0,3));"`
Expected: `28 0` (all 28 real candidates get a parsed teaser — confirmed against the real corpus during design) followed by three sample `{ name, file, teaser }` objects with sensible-looking teasers.

- [ ] **Step 6: Lint, typecheck, commit**

```bash
npm run lint && npx tsc --noEmit
git add lib/candidates.ts lib/__tests__/candidates.test.ts
git commit -m "feat: candidate directory data with header-teaser parsing"
```

---

### Task 3: Shortlist hook (`app/hooks/use-shortlist.ts`)

**Files:**
- Create: `app/hooks/use-shortlist.ts`
- Test: `app/hooks/__tests__/use-shortlist.test.ts`

**Interfaces:**
- Produces: `interface UseShortlistResult { shortlisted: Set<string>; isShortlisted: (file: string) => boolean; toggle: (file: string) => void }`, `function useShortlist(): UseShortlistResult`, plus exported pure functions `readStoredShortlist(): string[]` and `writeStoredShortlist(files: string[]): void` (for testing).

- [ ] **Step 1: Write the failing tests**

```ts
// app/hooks/__tests__/use-shortlist.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { readStoredShortlist, writeStoredShortlist } from "@/app/hooks/use-shortlist";

function mockLocalStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readStoredShortlist", () => {
  it("returns an empty array when window is undefined (SSR)", () => {
    expect(readStoredShortlist()).toEqual([]);
  });

  it("reads a previously stored array of files", () => {
    vi.stubGlobal("window", {
      localStorage: mockLocalStorage({
        "cv-screener:shortlist": JSON.stringify(["a.pdf", "b.pdf"]),
      }),
    });
    expect(readStoredShortlist()).toEqual(["a.pdf", "b.pdf"]);
  });

  it("returns an empty array for malformed JSON instead of throwing", () => {
    vi.stubGlobal("window", {
      localStorage: mockLocalStorage({ "cv-screener:shortlist": "{not json" }),
    });
    expect(readStoredShortlist()).toEqual([]);
  });

  it("returns an empty array when the stored value isn't an array of strings", () => {
    vi.stubGlobal("window", {
      localStorage: mockLocalStorage({
        "cv-screener:shortlist": JSON.stringify({ not: "an array" }),
      }),
    });
    expect(readStoredShortlist()).toEqual([]);
  });
});

describe("writeStoredShortlist", () => {
  it("persists the given file list under the storage key", () => {
    const storage = mockLocalStorage();
    vi.stubGlobal("window", { localStorage: storage });
    writeStoredShortlist(["x.pdf"]);
    expect(storage.getItem("cv-screener:shortlist")).toBe(JSON.stringify(["x.pdf"]));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- app/hooks/__tests__/use-shortlist.test.ts`
Expected: FAIL — cannot resolve `@/app/hooks/use-shortlist`.

- [ ] **Step 3: Implement**

```ts
// app/hooks/use-shortlist.ts
"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "cv-screener:shortlist";

export function readStoredShortlist(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string")
      : [];
  } catch {
    return [];
  }
}

export function writeStoredShortlist(files: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(files));
  } catch {
    // localStorage unavailable (private mode, quota exceeded, etc.) — no-op
  }
}

export interface UseShortlistResult {
  shortlisted: Set<string>;
  isShortlisted: (file: string) => boolean;
  toggle: (file: string) => void;
}

export function useShortlist(): UseShortlistResult {
  const [shortlisted, setShortlisted] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setShortlisted(new Set(readStoredShortlist()));
  }, []);

  const toggle = useCallback((file: string) => {
    setShortlisted(prev => {
      const next = new Set(prev);
      if (next.has(file)) {
        next.delete(file);
      } else {
        next.add(file);
      }
      writeStoredShortlist([...next]);
      return next;
    });
  }, []);

  const isShortlisted = useCallback((file: string) => shortlisted.has(file), [shortlisted]);

  return { shortlisted, isShortlisted, toggle };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- app/hooks/__tests__/use-shortlist.test.ts`
Expected: PASS (5/5).

- [ ] **Step 5: Lint, typecheck, commit**

```bash
npm run lint && npx tsc --noEmit
git add app/hooks/use-shortlist.ts app/hooks/__tests__/use-shortlist.test.ts
git commit -m "feat: localStorage-backed shortlist hook"
```

---

### Task 4: Follow-up suggestions (`app/components/follow-up-suggestions.tsx`)

**Files:**
- Create: `app/components/follow-up-suggestions.tsx`
- Test: `app/components/__tests__/follow-up-suggestions.test.ts`

**Interfaces:**
- Consumes: `SourceRef` from `@/lib/chat-types` (existing, unchanged).
- Produces: `interface FollowUpSuggestion { label: string; action: "ask" | "open-directory"; prompt?: string }`, `function getFollowUpSuggestions(sources: SourceRef[]): FollowUpSuggestion[]` (exported for testing), `function FollowUpSuggestions(props: { sources: SourceRef[]; onAsk: (prompt: string) => void; onOpenDirectory: () => void }): JSX.Element`.

- [ ] **Step 1: Write the failing tests**

```ts
// app/components/__tests__/follow-up-suggestions.test.ts
import { describe, expect, it } from "vitest";
import { getFollowUpSuggestions } from "@/app/components/follow-up-suggestions";
import type { SourceRef } from "@/lib/chat-types";

const source = (candidate: string, score: number, section = "Skills"): SourceRef => ({
  candidate,
  section,
  file: `${candidate.toLowerCase().replace(/\s+/g, "-")}.pdf`,
  score,
});

describe("getFollowUpSuggestions", () => {
  it("suggests browsing the directory when there are no sources", () => {
    expect(getFollowUpSuggestions([])).toEqual([
      { label: "Browse all candidates", action: "open-directory" },
    ]);
  });

  it("suggests asking more about the single cited candidate", () => {
    const result = getFollowUpSuggestions([source("Jane Doe", 0.4)]);
    expect(result).toEqual([
      { label: "Tell me more about Jane Doe", action: "ask", prompt: "Tell me more about Jane Doe." },
    ]);
  });

  it("suggests comparing the two highest-scoring distinct candidates when multiple are cited", () => {
    const result = getFollowUpSuggestions([
      source("Low Score", 0.3),
      source("High Score", 0.9),
      source("Mid Score", 0.5),
    ]);
    expect(result).toEqual([
      {
        label: "Compare High Score and Mid Score",
        action: "ask",
        prompt: "Compare High Score and Mid Score.",
      },
    ]);
  });

  it("deduplicates repeated citations of the same candidate across sections", () => {
    const result = getFollowUpSuggestions([
      source("Jane Doe", 0.4),
      source("Jane Doe", 0.6, "Experience"),
    ]);
    expect(result).toEqual([
      { label: "Tell me more about Jane Doe", action: "ask", prompt: "Tell me more about Jane Doe." },
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- app/components/__tests__/follow-up-suggestions.test.ts`
Expected: FAIL — cannot resolve the module.

- [ ] **Step 3: Implement**

```tsx
// app/components/follow-up-suggestions.tsx
import type { SourceRef } from "@/lib/chat-types";

export interface FollowUpSuggestion {
  label: string;
  action: "ask" | "open-directory";
  prompt?: string;
}

export function getFollowUpSuggestions(sources: SourceRef[]): FollowUpSuggestion[] {
  const bestScoreByCandidate = new Map<string, number>();
  for (const s of sources) {
    const prev = bestScoreByCandidate.get(s.candidate);
    if (prev === undefined || s.score > prev) {
      bestScoreByCandidate.set(s.candidate, s.score);
    }
  }
  const distinctNames = [...bestScoreByCandidate.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);

  if (distinctNames.length === 0) {
    return [{ label: "Browse all candidates", action: "open-directory" }];
  }
  if (distinctNames.length === 1) {
    const name = distinctNames[0];
    return [
      { label: `Tell me more about ${name}`, action: "ask", prompt: `Tell me more about ${name}.` },
    ];
  }
  const [first, second] = distinctNames;
  return [
    {
      label: `Compare ${first} and ${second}`,
      action: "ask",
      prompt: `Compare ${first} and ${second}.`,
    },
  ];
}

interface FollowUpSuggestionsProps {
  sources: SourceRef[];
  onAsk: (prompt: string) => void;
  onOpenDirectory: () => void;
}

export function FollowUpSuggestions({ sources, onAsk, onOpenDirectory }: FollowUpSuggestionsProps) {
  const suggestions = getFollowUpSuggestions(sources);
  return (
    <div className="flex flex-wrap gap-2">
      {suggestions.map(s => (
        <button
          key={s.label}
          type="button"
          onClick={() => (s.action === "ask" ? onAsk(s.prompt ?? s.label) : onOpenDirectory())}
          className="rounded border border-accent/40 bg-accent/5 px-3 py-1.5 text-sm text-accent hover:bg-accent/10"
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- app/components/__tests__/follow-up-suggestions.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Lint, typecheck, commit**

```bash
npm run lint && npx tsc --noEmit
git add app/components/follow-up-suggestions.tsx app/components/__tests__/follow-up-suggestions.test.ts
git commit -m "feat: contextual follow-up suggestions from cited sources"
```

---

### Task 5: Source chips with shortlist toggle (`app/components/source-chips.tsx`)

**Files:**
- Modify: `app/components/source-chips.tsx` (full rewrite)

**Interfaces:**
- Consumes: `SourceRef` from `@/lib/chat-types`; `isShortlisted`/`toggle` shape from Task 3's `UseShortlistResult`.
- Produces: `function SourceChips(props: { sources: SourceRef[]; isShortlisted: (file: string) => boolean; onToggleShortlist: (file: string) => void }): JSX.Element | null` — signature changes from the current `{ sources }`-only prop shape; Task 6 depends on this new shape.

- [ ] **Step 1: Rewrite the component**

```tsx
// app/components/source-chips.tsx
import type { SourceRef } from "@/lib/chat-types";

interface SourceChipsProps {
  sources: SourceRef[];
  isShortlisted: (file: string) => boolean;
  onToggleShortlist: (file: string) => void;
}

export function SourceChips({ sources, isShortlisted, onToggleShortlist }: SourceChipsProps) {
  if (sources.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {sources.map(s => {
        const shortlisted = isShortlisted(s.file);
        return (
          <span
            key={`${s.file}#${s.section}`}
            className="inline-flex items-center gap-1 rounded-full border border-hairline-strong bg-surface-soft py-0.5 pl-2.5 pr-1 text-xs text-mute"
          >
            <a
              href={`/api/cvs/${s.file}`}
              target="_blank"
              rel="noreferrer"
              title={`similarity ${s.score.toFixed(2)} — open PDF`}
              className="hover:text-ink"
            >
              {s.candidate} · {s.section}
            </a>
            <button
              type="button"
              onClick={() => onToggleShortlist(s.file)}
              title={shortlisted ? "Remove from shortlist" : "Add to shortlist"}
              className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${
                shortlisted ? "bg-accent text-white" : "bg-canvas text-mute hover:text-ink"
              }`}
            >
              {shortlisted ? "✓" : "+"}
            </button>
          </span>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm run lint && npx tsc --noEmit`
Expected: `app/page.tsx` (the current consumer) will now fail to typecheck since it still calls `<SourceChips sources={...} />` without the two new required props — this is expected at this point in the plan; Task 8/9 will update the only remaining call site. Confirm the tsc error is specifically about the missing props on `SourceChips` in `app/page.tsx` (not an unrelated error) before proceeding.

- [ ] **Step 3: Commit**

```bash
git add app/components/source-chips.tsx
git commit -m "feat: add shortlist toggle to source chips"
```

Note in your report that `npx tsc --noEmit` has one expected failing reference in `app/page.tsx` until Task 9 replaces that file — this is a deliberate, temporary, plan-tracked state, not a regression to fix now.

---

### Task 6: Chat message bubble (`app/components/chat-message.tsx`)

**Files:**
- Create: `app/components/chat-message.tsx`

**Interfaces:**
- Consumes: `ChatMessage` from `@/lib/chat-types`; `SourceChips` from Task 5 (`{ sources, isShortlisted, onToggleShortlist }`).
- Produces: `function ChatMessageBubble(props: { message: ChatMessage; isShortlisted: (file: string) => boolean; onToggleShortlist: (file: string) => void }): JSX.Element`.

- [ ] **Step 1: Implement**

```tsx
// app/components/chat-message.tsx
"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import type { ChatMessage } from "@/lib/chat-types";
import { SourceChips } from "./source-chips";

interface ChatMessageBubbleProps {
  message: ChatMessage;
  isShortlisted: (file: string) => boolean;
  onToggleShortlist: (file: string) => void;
}

export function ChatMessageBubble({
  message,
  isShortlisted,
  onToggleShortlist,
}: ChatMessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";

  const text = message.parts
    .filter(p => p.type === "text")
    .map(p => p.text)
    .join("");

  const sourcesPart = message.parts.find(p => p.type === "data-sources");
  const sources = sourcesPart?.data.sources ?? [];

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — no confirmation shown, non-fatal
    }
  };

  return (
    <div className={isUser ? "text-right" : ""}>
      <div
        className={`relative inline-block max-w-[85%] rounded px-3.5 py-2 text-sm ${
          isUser ? "bg-ink text-canvas" : "border border-hairline bg-surface-soft text-ink"
        }`}
      >
        {isUser ? (
          <span className="whitespace-pre-wrap">{text}</span>
        ) : (
          <div className="[&_ol]:my-1 [&_ol]:pl-5 [&_p+p]:mt-2 [&_p]:m-0 [&_strong]:font-semibold [&_ul]:my-1 [&_ul]:pl-5">
            <ReactMarkdown>{text}</ReactMarkdown>
          </div>
        )}

        {!isUser && text.length > 0 && (
          <button
            type="button"
            onClick={handleCopy}
            className="absolute -top-2.5 right-2 rounded border border-hairline-strong bg-canvas px-1.5 py-0.5 text-[10px] text-mute hover:text-ink"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        )}

        {!isUser && (
          <SourceChips
            sources={sources}
            isShortlisted={isShortlisted}
            onToggleShortlist={onToggleShortlist}
          />
        )}
      </div>
    </div>
  );
}
```

The copy button is always visible (not hover-gated) deliberately — an `opacity-0 group-hover:opacity-100` pattern would make it unreachable on touch devices, which this task's responsive requirement rules out.

- [ ] **Step 2: Verify**

Run: `npm run lint && npx tsc --noEmit`
Expected: no new errors from this file (the pre-existing `app/page.tsx` error from Task 5 persists until Task 9, as noted).

- [ ] **Step 3: Commit**

```bash
git add app/components/chat-message.tsx
git commit -m "feat: extract chat message bubble with copy button"
```

---

### Task 7: Candidate panel (`app/components/candidate-panel.tsx`)

**Files:**
- Create: `app/components/candidate-panel.tsx`

**Interfaces:**
- Consumes: `CandidateSummary` from `@/lib/candidates` (Task 2); `UseShortlistResult` from `@/app/hooks/use-shortlist` (Task 3).
- Produces: `function CandidatePanel(props: { candidates: CandidateSummary[]; shortlist: UseShortlistResult; activeTab: "candidates" | "shortlist"; onTabChange: (tab: "candidates" | "shortlist") => void; isOpen: boolean; onClose: () => void; onAsk: (prompt: string) => void }): JSX.Element`. Renders as a persistent sidebar at `lg` breakpoint (1024px) and up, a backdrop + slide-in drawer below it.

- [ ] **Step 1: Implement**

```tsx
// app/components/candidate-panel.tsx
"use client";

import { useState } from "react";
import type { CandidateSummary } from "@/lib/candidates";
import type { UseShortlistResult } from "@/app/hooks/use-shortlist";

interface CandidatePanelProps {
  candidates: CandidateSummary[];
  shortlist: UseShortlistResult;
  activeTab: "candidates" | "shortlist";
  onTabChange: (tab: "candidates" | "shortlist") => void;
  isOpen: boolean;
  onClose: () => void;
  onAsk: (prompt: string) => void;
}

export function CandidatePanel({
  candidates,
  shortlist,
  activeTab,
  onTabChange,
  isOpen,
  onClose,
  onAsk,
}: CandidatePanelProps) {
  const [query, setQuery] = useState("");

  const filtered = candidates.filter(c => c.name.toLowerCase().includes(query.toLowerCase()));
  const shortlistedCandidates = candidates.filter(c => shortlist.shortlisted.has(c.file));
  const rows = activeTab === "candidates" ? filtered : shortlistedCandidates;

  const handleAsk = (name: string) => {
    onAsk(`Tell me about ${name}.`);
    onClose();
  };

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-ink/30 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-[85vw] max-w-sm flex-col border-l border-hairline bg-canvas transition-transform lg:static lg:z-auto lg:w-80 lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-hairline p-3 lg:hidden">
          <span className="text-sm font-bold">Candidates</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-sm hover:bg-surface-soft"
          >
            Close
          </button>
        </div>

        <div className="flex border-b border-hairline-strong">
          <button
            type="button"
            onClick={() => onTabChange("candidates")}
            className={`flex-1 border-b-2 px-4 py-2 text-sm font-medium ${
              activeTab === "candidates"
                ? "border-ink text-ink"
                : "border-transparent text-mute hover:text-ink"
            }`}
          >
            Candidates ({candidates.length})
          </button>
          <button
            type="button"
            onClick={() => onTabChange("shortlist")}
            className={`flex-1 border-b-2 px-4 py-2 text-sm font-medium ${
              activeTab === "shortlist"
                ? "border-ink text-ink"
                : "border-transparent text-mute hover:text-ink"
            }`}
          >
            Shortlist ({shortlist.shortlisted.size})
          </button>
        </div>

        {activeTab === "candidates" && (
          <div className="border-b border-hairline p-3">
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search candidates…"
              className="h-9 w-full rounded border border-hairline-strong bg-surface-soft px-3 text-sm outline-none focus:border-accent focus:bg-canvas"
            />
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {rows.length === 0 && (
            <p className="p-4 text-sm text-mute">
              {activeTab === "candidates"
                ? "No candidates match your search."
                : "No candidates shortlisted yet. Use the + next to a source citation or a candidate row to add one."}
            </p>
          )}
          {rows.map(c => (
            <div key={c.file} className="flex items-start gap-2 border-b border-hairline p-3">
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => handleAsk(c.name)}
                  className="block truncate text-left text-sm font-medium hover:text-accent"
                >
                  {c.name}
                </button>
                {c.teaser && <p className="truncate text-xs text-mute">{c.teaser}</p>}
                <a
                  href={`/api/cvs/${c.file}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-accent hover:underline"
                >
                  View PDF
                </a>
              </div>
              <button
                type="button"
                onClick={() => shortlist.toggle(c.file)}
                title={shortlist.isShortlisted(c.file) ? "Remove from shortlist" : "Add to shortlist"}
                className={`shrink-0 rounded border px-2 py-1 text-xs ${
                  shortlist.isShortlisted(c.file)
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-hairline-strong text-mute hover:text-ink"
                }`}
              >
                {shortlist.isShortlisted(c.file) ? "✓" : "+"}
              </button>
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm run lint && npx tsc --noEmit`
Expected: no new errors from this file.

- [ ] **Step 3: Commit**

```bash
git add app/components/candidate-panel.tsx
git commit -m "feat: tabbed candidate directory / shortlist sidebar panel"
```

---

### Task 8: Chat app integration (`app/components/chat-app.tsx`)

**Files:**
- Create: `app/components/chat-app.tsx`

**Interfaces:**
- Consumes: `CandidateSummary` (Task 2), `useShortlist`/`UseShortlistResult` (Task 3), `FollowUpSuggestions` (Task 4), `ChatMessageBubble` (Task 6), `CandidatePanel` (Task 7), `ChatMessage` from `@/lib/chat-types`.
- Produces: `function ChatApp(props: { candidates: CandidateSummary[] }): JSX.Element` — the component Task 9's `app/page.tsx` renders.

- [ ] **Step 1: Implement**

```tsx
// app/components/chat-app.tsx
"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useRef, useState } from "react";
import type { CandidateSummary } from "@/lib/candidates";
import type { ChatMessage } from "@/lib/chat-types";
import { useShortlist } from "@/app/hooks/use-shortlist";
import { CandidatePanel } from "./candidate-panel";
import { ChatMessageBubble } from "./chat-message";
import { FollowUpSuggestions } from "./follow-up-suggestions";

const SUGGESTIONS = [
  "Who has experience with Python?",
  "Which candidate graduated from UPC?",
  "Compare the two strongest data engineers.",
];

export function ChatApp({ candidates }: { candidates: CandidateSummary[] }) {
  const [input, setInput] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelTab, setPanelTab] = useState<"candidates" | "shortlist">("candidates");
  const scrollRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

  const { messages, sendMessage, status, error, clearError, setMessages } = useChat<ChatMessage>({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });
  const shortlist = useShortlist();

  const submit = (text: string) => {
    if (text.trim() && status !== "submitted" && status !== "streaming") {
      if (status === "error") clearError();
      sendMessage({ text });
      setInput("");
      setPanelOpen(false);
    }
  };

  const openDirectory = () => {
    setPanelTab("candidates");
    setPanelOpen(true);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (el && isNearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const lastAssistantMessage = [...messages].reverse().find(m => m.role === "assistant");
  const lastSourcesPart = lastAssistantMessage?.parts.find(p => p.type === "data-sources");
  const lastSources = lastSourcesPart?.data.sources ?? [];
  const showSuggestions =
    messages.length > 0 &&
    (status === "ready" || status === "error") &&
    lastAssistantMessage !== undefined;

  return (
    <div className="flex h-dvh flex-col bg-canvas text-ink">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-hairline px-4">
        <div>
          <h1 className="text-xl font-bold">CV Screener</h1>
          <p className="text-xs text-mute">28 candidates indexed</p>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => setMessages([])}
              className="rounded border border-hairline-strong px-3 py-1.5 text-sm hover:bg-surface-soft"
            >
              New chat
            </button>
          )}
          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            className="relative rounded border border-hairline-strong px-3 py-1.5 text-sm hover:bg-surface-soft lg:hidden"
          >
            Candidates
            {shortlist.shortlisted.size > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[10px] text-white">
                {shortlist.shortlisted.size}
              </span>
            )}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex-1 space-y-4 overflow-y-auto p-4"
          >
            {messages.length === 0 && (
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => submit(s)}
                    className="rounded border border-hairline-strong px-3 py-1.5 text-sm text-mute hover:bg-surface-soft hover:text-ink"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            {messages.map(message => (
              <ChatMessageBubble
                key={message.id}
                message={message}
                isShortlisted={shortlist.isShortlisted}
                onToggleShortlist={shortlist.toggle}
              />
            ))}
            {status === "submitted" && <p className="text-sm text-mute">Searching CVs…</p>}
            {error && <p className="text-sm text-danger">{error.message}</p>}
            {showSuggestions && (
              <FollowUpSuggestions
                sources={lastSources}
                onAsk={submit}
                onOpenDirectory={openDirectory}
              />
            )}
          </div>

          <form
            onSubmit={e => {
              e.preventDefault();
              submit(input);
            }}
            className="flex shrink-0 gap-2 border-t border-hairline p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
          >
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="e.g. Who has worked in fintech?"
              className="h-10 flex-1 rounded border border-hairline-strong bg-surface-soft px-3 text-sm outline-none focus:border-accent focus:bg-canvas"
            />
            <button
              type="submit"
              disabled={status === "submitted" || status === "streaming"}
              className="h-10 rounded bg-ink px-4 text-sm text-canvas disabled:opacity-50"
            >
              Ask
            </button>
          </form>
        </div>

        <CandidatePanel
          candidates={candidates}
          shortlist={shortlist}
          activeTab={panelTab}
          onTabChange={setPanelTab}
          isOpen={panelOpen}
          onClose={() => setPanelOpen(false)}
          onAsk={submit}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm run lint && npx tsc --noEmit`
Expected: no new errors from this file (the `app/page.tsx` error persists until Task 9).

- [ ] **Step 3: Commit**

```bash
git add app/components/chat-app.tsx
git commit -m "feat: integrate chat, shortlist, and candidate panel into ChatApp"
```

---

### Task 9: Wire `app/page.tsx` as a Server Component

**Files:**
- Modify: `app/page.tsx` (full rewrite)

**Interfaces:**
- Consumes: `getCandidateDirectory()` from `@/lib/candidates` (Task 2); `ChatApp` from `@/app/components/chat-app` (Task 8).

- [ ] **Step 1: Rewrite**

```tsx
// app/page.tsx
import { getCandidateDirectory } from "@/lib/candidates";
import { ChatApp } from "./components/chat-app";

export default function Page() {
  const candidates = getCandidateDirectory();
  return <ChatApp candidates={candidates} />;
}
```

- [ ] **Step 2: Verify — this is the first point all pieces are wired together**

Run: `npm run lint && npx tsc --noEmit && npm test`
Expected: all clean, all tests passing (the `app/page.tsx` error from Task 5 is now resolved).

Run: `npm run dev`, then either:
- **With browser automation available:** load `http://localhost:3000` at a desktop viewport width (e.g. 1280px). Confirm: header renders with title + "New chat" (hidden until a message exists) + no "Candidates" button (sidebar is persistent at this width); sidebar shows "Candidates (28)" / "Shortlist (0)" tabs with a search box and 28 rows. Click a suggestion chip, confirm a real streamed answer with source chips appears, and that each chip has a `+`/`✓` shortlist toggle. Click a chip's toggle, confirm it moves into the Shortlist tab. Ask a question that returns 2+ sources, confirm a "Compare X and Y" suggestion chip appears below the answer; click it and confirm it sends that exact question. Click "New chat", confirm messages clear but the shortlist you built survives. Resize (or use a separate mobile-viewport check) to <1024px width: confirm the sidebar disappears, a "Candidates" header button appears (with a badge showing your shortlist count), and clicking it opens a slide-in drawer with a backdrop; clicking a candidate name closes the drawer and sends the question.
- **Without browser automation:** verify via curl that the page renders without server errors (`curl -s http://localhost:3000 | head -20`), and verify each piece's logic through the already-passing unit tests plus a curl smoke test against `/api/chat` (same pattern as prior tasks in this project) to confirm the backend integration is unaffected. Clearly state in your report that full responsive/interactive verification was not possible in this environment and should be spot-checked before considering the feature demo-ready.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat: wire candidate directory into the chat page"
```

---

### Task 10: Dark mode, responsive edge cases, and cleanup pass

**Files:**
- Modify: any file from Tasks 1–9 as needed to fix issues found during this pass (expected to be small, targeted fixes — not a rewrite)

**Interfaces:**
- Consumes: the fully wired app from Task 9.

- [ ] **Step 1: Dark mode check**

If browser automation is available: switch the OS/browser to dark mode (or use devtools' rendering emulation for `prefers-color-scheme: dark`), reload, and confirm: canvas/surfaces/text all use the dark token values from Task 1 (no white flashes, no illegible low-contrast text — particularly check the accent-colored follow-up chips and the shortlist `✓` badge against the dark canvas). Fix any contrast issue by adjusting the dark-mode CSS custom properties in `app/globals.css` from Task 1.

If browser automation is unavailable: read through `app/globals.css`'s dark block and every component's className strings for hardcoded light-only colors (anything not using the `canvas`/`ink`/`body`/`mute`/`surface-soft`/`surface-card`/`hairline`/`hairline-strong`/`accent`/`success`/`danger`/`warning` tokens) — flag and fix any found, and state in your report that visual dark-mode contrast should be spot-checked before the video walkthrough.

- [ ] **Step 2: Responsive edge cases**

Check at minimum: a very narrow mobile width (375px) — confirm the header doesn't overflow/wrap awkwardly, message bubbles respect `max-w-[85%]` without horizontal scroll, the input row's `Ask` button stays reachable above any virtual keyboard area, and the drawer covers the full viewport height. Check at a mid tablet width (768px) — confirm the sidebar is still in drawer mode (below the 1024px breakpoint) and doesn't look cramped. Fix any overflow/wrapping issue found with minimal, targeted className changes.

- [ ] **Step 3: Remove the old `SUGGESTIONS` duplication risk and confirm no dead code**

Grep for any remaining reference to the old prop shape or removed exports: `grep -rn "sources={" app/` should show only the new 3-prop `SourceChips` usage inside `chat-message.tsx`; confirm no other file still imports or calls `SourceChips` with the old single-prop shape. Confirm `app/page.tsx` no longer contains any of the original inline JSX (it should be the 6-line Server Component from Task 9).

- [ ] **Step 4: Full regression pass**

Run: `npm run lint && npx tsc --noEmit && npm test`
Expected: all clean.

Run: `npm run build`
Expected: succeeds (this project's dev server runs on `--webpack` per a prior Turbopack workaround for the embeddings model loader — confirm `build` still succeeds under its default bundler as it did before this redesign; if it now fails, diagnose whether this redesign introduced the regression before considering this task done).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix: dark mode contrast and responsive edge cases from the redesign pass"
```

If Step 1–2 found nothing to fix, state that explicitly in your report and skip the commit (no empty commits).

---

## Self-review notes

- Spec coverage: visual tokens/fonts (T1), candidate directory (T2, T7, T9), shortlist (T3, T5, T7, T8), follow-up suggestions (T4, T8), new chat (T8), copy button (T6), responsive layout + drawer (T7, T8, T10), dark mode (T1, T10), auto-scroll (T8), mobile drawer auto-close on ask (T7's `handleAsk` calls `onClose()`; T8's `submit()` also calls `setPanelOpen(false)` for the header-button/suggestion-chip path) but NOT on shortlist toggle (toggle handlers never call `onClose`/`setPanelOpen`) — matches the spec's explicit rule. ✔
- Placeholder scan: no TBD/TODO; every step has complete code or an exact command. ✔
- Type consistency checked across tasks: `CandidateSummary` (T2) used identically in T7/T9; `UseShortlistResult` (T3) used identically in T7/T8; `FollowUpSuggestion`/`getFollowUpSuggestions` (T4) used identically in T8; `SourceChips`' new 3-prop shape (T5) used identically in T6; `ChatMessageBubble` (T6) used identically in T8; `CandidatePanel` (T7) used identically in T8; `ChatApp` (T8) used identically in T9. ✔
- Known, deliberately-sequenced intermediate state: Task 5 leaves `app/page.tsx` failing `tsc` until Task 9 replaces it — flagged explicitly in both tasks so it isn't mistaken for a regression during review.
