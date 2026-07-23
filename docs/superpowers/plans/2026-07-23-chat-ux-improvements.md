# Chat UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a typing-indicator loading state, gate/dedup source chips, and add multi-conversation chat history to the CV screener chat UI.

**Architecture:** Three independent, small changes (typing indicator, chip grouping, chip-timing gate) land first. Then a new `use-conversations` hook (localStorage-backed, mirroring the existing `use-shortlist` hook) is built standalone. The chat surface is then split: the current `ChatApp` becomes a thin outer shell owning cross-conversation state (shortlist, panel, active conversation), and a new `ChatThread` component — keyed by conversation id so switching conversations cleanly remounts it — owns the live `useChat` instance. Finally the sidebar gets a third "History" tab.

**Tech Stack:** Next.js App Router, React 19, TypeScript strict, Tailwind CSS v4, AI SDK v6 (`@ai-sdk/react`'s `useChat`), vitest.

## Global Constraints

- TypeScript `strict: true`; no `any`; `npm run lint` and `npx tsc --noEmit` must pass before every commit.
- Spec: `docs/superpowers/specs/2026-07-23-chat-ux-improvements-design.md`.
- No changes to `app/api/chat/route.ts`, `lib/chat-types.ts`, `lib/retrieval.ts`, `lib/embeddings.ts`, or `lib/openrouter.ts` — this plan is frontend-only.
- Shortlist stays global (unchanged `useShortlist` hook, untouched by this plan except being threaded through one more component layer).
- Conversation history persists in `localStorage` under key `cv-screener:conversations`, capped at the 50 most-recently-updated conversations. Same read/write robustness pattern as the existing `app/hooks/use-shortlist.ts`: guarded `typeof window` checks, try/catch around `JSON.parse`/storage access, malformed data treated as empty rather than thrown.
- "New chat" generates a fresh conversation id and switches to it; it does not persist to storage until the conversation has at least one message.
- Every effect that calls a parent-provided callback (not a local `useState` setter) is expected to pass `react-hooks/set-state-in-effect` — verified by reading the rule's actual implementation (`node_modules/eslint-plugin-react-hooks/cjs/eslint-plugin-react-hooks.development.js`): it only flags effects whose callback argument is a *locally-declared* `useState` setter it can statically trace, not an opaque prop function. This differs from the earlier, real violation in `app/hooks/use-shortlist.ts` (which called its own local setter directly). If `npm run lint` disagrees with this analysis for any task below, that is a real, unexpected finding — investigate root cause per the project's established process rather than blindly disabling the rule.
- Package manager: npm. Commit after every task (conventional commits).

---

### Task 1: Typing indicator

**Files:**
- Create: `app/components/typing-indicator.tsx`
- Modify: `app/components/chat-app.tsx`

**Interfaces:**
- Produces: `function TypingIndicator(): JSX.Element` — a presentational component, no props.

- [ ] **Step 1: Create the component**

```tsx
// app/components/typing-indicator.tsx
export function TypingIndicator() {
  return (
    <div className="inline-block max-w-[85%] rounded border border-hairline bg-surface-soft px-3.5 py-2.5">
      <div className="flex items-center gap-1">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-mute [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-mute [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-mute" />
      </div>
    </div>
  );
}
```

`animate-bounce` is a built-in Tailwind v4 utility (ships with its default `@keyframes bounce`) — no new CSS or dependency needed. The staggered `[animation-delay:...]` arbitrary values give the classic three-dot stagger.

- [ ] **Step 2: Wire it into `app/components/chat-app.tsx`**

Add the import near the top (alongside the existing component imports):

```tsx
import { TypingIndicator } from "./typing-indicator";
```

Immediately after the existing block that computes `lastAssistantMessage`/`lastSources`/`showSuggestions` (currently `app/components/chat-app.tsx:58-64`), add two more derived variables:

```tsx
const lastAssistantHasText =
  lastAssistantMessage?.parts.some(p => p.type === "text" && p.text.length > 0) ?? false;
const showTypingIndicator =
  status === "submitted" || (status === "streaming" && !lastAssistantHasText);
```

Replace the current loading line:

```tsx
{status === "submitted" && <p className="text-sm text-mute">Searching CVs…</p>}
```

with:

```tsx
{showTypingIndicator && <TypingIndicator />}
```

- [ ] **Step 3: Verify**

Run: `npm run lint && npx tsc --noEmit && npm test`
Expected: all clean (no new tests — this is a presentational change, verified live in Step 4).

Start `npm run dev`, ask a real question, and confirm: the typing-dots bubble appears immediately after sending, stays visible through the gap before the first token, and disappears the instant text starts rendering (not before, not lingering after). If you have Chrome browser automation available, use it and confirm via a screenshot or DOM check that `TypingIndicator`'s markup is present during that gap. If not available, describe what you observed via `curl` timing or manual reasoning about the status transitions, and note that live visual confirmation wasn't possible in this environment.

- [ ] **Step 4: Commit**

```bash
git add app/components/typing-indicator.tsx app/components/chat-app.tsx
git commit -m "feat: add typing indicator loading state"
```

---

### Task 2: Source-chip per-candidate grouping

**Files:**
- Modify: `app/components/source-chips.tsx` (full rewrite)
- Test: `app/components/__tests__/source-chips.test.ts`

**Interfaces:**
- Consumes: `SourceRef` from `@/lib/chat-types` (unchanged).
- Produces: `interface GroupedSource { candidate: string; file: string; sections: string[]; bestScore: number }`, `function groupSourcesByCandidate(sources: SourceRef[]): GroupedSource[]` (exported for testing, sorted by `bestScore` descending). `SourceChips`'s own prop signature (`{ sources, isShortlisted, onToggleShortlist }`) is unchanged — Task 3's consumer in `chat-message.tsx` needs no changes to how it calls `SourceChips`.

- [ ] **Step 1: Write the failing tests**

```ts
// app/components/__tests__/source-chips.test.ts
import { describe, expect, it } from "vitest";
import { groupSourcesByCandidate } from "@/app/components/source-chips";
import type { SourceRef } from "@/lib/chat-types";

const source = (candidate: string, section: string, score: number): SourceRef => ({
  candidate,
  section,
  file: `${candidate.toLowerCase().replace(/\s+/g, "-")}.pdf`,
  score,
});

describe("groupSourcesByCandidate", () => {
  it("returns one group per distinct file, sorted by best score descending", () => {
    const result = groupSourcesByCandidate([
      source("Low Score", "Skills", 0.3),
      source("High Score", "Experience", 0.9),
    ]);
    expect(result.map(g => g.candidate)).toEqual(["High Score", "Low Score"]);
  });

  it("collects every matched section for a candidate cited in multiple sections", () => {
    const result = groupSourcesByCandidate([
      source("Jane Doe", "Skills", 0.4),
      source("Jane Doe", "Experience", 0.6),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].sections).toEqual(["Skills", "Experience"]);
    expect(result[0].bestScore).toBe(0.6);
  });

  it("deduplicates a repeated (file, section) pair without duplicating the section in the list", () => {
    const result = groupSourcesByCandidate([
      source("Jane Doe", "Skills", 0.4),
      source("Jane Doe", "Skills", 0.5),
    ]);
    expect(result[0].sections).toEqual(["Skills"]);
    expect(result[0].bestScore).toBe(0.5);
  });

  it("returns an empty array for no sources", () => {
    expect(groupSourcesByCandidate([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- app/components/__tests__/source-chips.test.ts`
Expected: FAIL — `groupSourcesByCandidate` is not exported (the current `source-chips.tsx` doesn't have it yet).

- [ ] **Step 3: Rewrite the component**

```tsx
// app/components/source-chips.tsx
import type { SourceRef } from "@/lib/chat-types";

export interface GroupedSource {
  candidate: string;
  file: string;
  sections: string[];
  bestScore: number;
}

export function groupSourcesByCandidate(sources: SourceRef[]): GroupedSource[] {
  const byFile = new Map<
    string,
    { candidate: string; file: string; sections: Set<string>; bestScore: number }
  >();
  for (const s of sources) {
    const existing = byFile.get(s.file);
    if (existing) {
      existing.sections.add(s.section);
      existing.bestScore = Math.max(existing.bestScore, s.score);
    } else {
      byFile.set(s.file, {
        candidate: s.candidate,
        file: s.file,
        sections: new Set([s.section]),
        bestScore: s.score,
      });
    }
  }
  return [...byFile.values()]
    .map(g => ({ ...g, sections: [...g.sections] }))
    .sort((a, b) => b.bestScore - a.bestScore);
}

interface SourceChipsProps {
  sources: SourceRef[];
  isShortlisted: (file: string) => boolean;
  onToggleShortlist: (file: string) => void;
}

export function SourceChips({ sources, isShortlisted, onToggleShortlist }: SourceChipsProps) {
  const grouped = groupSourcesByCandidate(sources);
  if (grouped.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {grouped.map(g => {
        const shortlisted = isShortlisted(g.file);
        return (
          <span
            key={g.file}
            className="inline-flex items-center gap-1 rounded-full border border-hairline-strong bg-surface-soft py-0.5 pl-2.5 pr-1 text-xs text-mute"
          >
            <a
              href={`/api/cvs/${g.file}`}
              target="_blank"
              rel="noreferrer"
              title={`${g.sections.join(", ")} — similarity ${g.bestScore.toFixed(2)} — open PDF`}
              className="hover:text-ink"
            >
              {g.candidate}
            </a>
            <button
              type="button"
              onClick={() => onToggleShortlist(g.file)}
              title={shortlisted ? "Remove from shortlist" : "Add to shortlist"}
              aria-label={shortlisted ? "Remove from shortlist" : "Add to shortlist"}
              className="group -m-2.5 flex h-9 w-9 items-center justify-center rounded-full"
            >
              <span
                className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${
                  shortlisted
                    ? "bg-accent text-accent-foreground"
                    : "bg-canvas text-mute group-hover:text-ink"
                }`}
              >
                {shortlisted ? "✓" : "+"}
              </span>
            </button>
          </span>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- app/components/__tests__/source-chips.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Lint, typecheck, commit**

```bash
npm run lint && npx tsc --noEmit
git add app/components/source-chips.tsx app/components/__tests__/source-chips.test.ts
git commit -m "feat: group source chips one-per-candidate with a section tooltip"
```

---

### Task 3: Source-chip timing gate

**Files:**
- Modify: `app/components/chat-message.tsx`

**Interfaces:**
- Consumes: `SourceChips` from Task 2 (unchanged props). No new exports.

- [ ] **Step 1: Gate the render**

In `app/components/chat-message.tsx`, find this block (currently lines 68-74):

```tsx
        {!isUser && (
          <SourceChips
            sources={sources}
            isShortlisted={isShortlisted}
            onToggleShortlist={onToggleShortlist}
          />
        )}
```

Replace with:

```tsx
        {!isUser && text.length > 0 && (
          <SourceChips
            sources={sources}
            isShortlisted={isShortlisted}
            onToggleShortlist={onToggleShortlist}
          />
        )}
```

- [ ] **Step 2: Verify**

Run: `npm run lint && npx tsc --noEmit`
Expected: clean.

Live check: ask a question and confirm the source chips no longer appear the instant you hit send — they should appear at the same moment the first word of the answer renders, not before.

- [ ] **Step 3: Commit**

```bash
git add app/components/chat-message.tsx
git commit -m "feat: don't render source chips until the answer starts streaming"
```

---

### Task 4: Conversation storage hook

**Files:**
- Create: `app/hooks/use-conversations.ts`
- Test: `app/hooks/__tests__/use-conversations.test.ts`

**Interfaces:**
- Consumes: `ChatMessage` from `@/lib/chat-types` (unchanged).
- Produces:
  ```ts
  interface StoredConversation { id: string; title: string; updatedAt: number; messages: ChatMessage[] }
  function readStoredConversations(): StoredConversation[]
  function writeStoredConversations(conversations: StoredConversation[]): void
  function deriveTitle(firstUserMessageText: string): string
  function pruneConversations(conversations: StoredConversation[]): StoredConversation[]
  interface UseConversationsResult {
    conversations: StoredConversation[]; // sorted by updatedAt desc
    activeConversationId: string;
    startNewConversation: () => void;
    saveConversation: (id: string, messages: ChatMessage[]) => void;
    switchToConversation: (id: string) => void;
    deleteConversation: (id: string) => void;
  }
  function useConversations(): UseConversationsResult
  ```
  Tasks 5 and 6 both consume this exact interface.

- [ ] **Step 1: Write the failing tests**

```ts
// app/hooks/__tests__/use-conversations.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deriveTitle,
  pruneConversations,
  readStoredConversations,
  writeStoredConversations,
  type StoredConversation,
} from "@/app/hooks/use-conversations";

function mockLocalStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
}

const conversation = (id: string, updatedAt: number): StoredConversation => ({
  id,
  title: `Conversation ${id}`,
  updatedAt,
  messages: [],
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readStoredConversations", () => {
  it("returns an empty array when window is undefined (SSR)", () => {
    expect(readStoredConversations()).toEqual([]);
  });

  it("reads a previously stored array of conversations", () => {
    const stored = [conversation("a", 1000)];
    vi.stubGlobal("window", {
      localStorage: mockLocalStorage({ "cv-screener:conversations": JSON.stringify(stored) }),
    });
    expect(readStoredConversations()).toEqual(stored);
  });

  it("returns an empty array for malformed JSON instead of throwing", () => {
    vi.stubGlobal("window", {
      localStorage: mockLocalStorage({ "cv-screener:conversations": "{not json" }),
    });
    expect(readStoredConversations()).toEqual([]);
  });

  it("filters out entries that don't match the StoredConversation shape", () => {
    vi.stubGlobal("window", {
      localStorage: mockLocalStorage({
        "cv-screener:conversations": JSON.stringify([
          conversation("valid", 1000),
          { id: "missing-fields" },
          "not an object",
        ]),
      }),
    });
    expect(readStoredConversations()).toEqual([conversation("valid", 1000)]);
  });
});

describe("writeStoredConversations", () => {
  it("persists the given conversation list under the storage key", () => {
    const storage = mockLocalStorage();
    vi.stubGlobal("window", { localStorage: storage });
    const stored = [conversation("a", 1000)];
    writeStoredConversations(stored);
    expect(storage.getItem("cv-screener:conversations")).toBe(JSON.stringify(stored));
  });
});

describe("deriveTitle", () => {
  it("returns the trimmed text as-is when at or under 40 characters", () => {
    expect(deriveTitle("Who has Python experience?")).toBe("Who has Python experience?");
  });

  it("truncates to 40 characters with an ellipsis when longer", () => {
    const long = "Which candidate has the most experience with distributed systems and Kubernetes?";
    const result = deriveTitle(long);
    expect(result).toBe("Which candidate has the most experience…");
    expect(result.length).toBe(40);
  });

  it("falls back to a default title for empty/whitespace-only input", () => {
    expect(deriveTitle("   ")).toBe("New conversation");
  });
});

describe("pruneConversations", () => {
  it("keeps all conversations when under the cap", () => {
    const list = [conversation("a", 1000), conversation("b", 2000)];
    expect(pruneConversations(list)).toHaveLength(2);
  });

  it("keeps only the 50 most-recently-updated conversations, dropping the oldest", () => {
    const list = Array.from({ length: 55 }, (_, i) => conversation(`c${i}`, i));
    const pruned = pruneConversations(list);
    expect(pruned).toHaveLength(50);
    expect(pruned[0].id).toBe("c54");
    expect(pruned.some(c => c.id === "c4")).toBe(false);
    expect(pruned.some(c => c.id === "c5")).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- app/hooks/__tests__/use-conversations.test.ts`
Expected: FAIL — cannot resolve `@/app/hooks/use-conversations`.

- [ ] **Step 3: Implement**

```ts
// app/hooks/use-conversations.ts
"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/chat-types";

const STORAGE_KEY = "cv-screener:conversations";
const MAX_CONVERSATIONS = 50;
const TITLE_MAX_LENGTH = 40;

export interface StoredConversation {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMessage[];
}

function isStoredConversation(value: unknown): value is StoredConversation {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.title === "string" &&
    typeof v.updatedAt === "number" &&
    Array.isArray(v.messages)
  );
}

export function readStoredConversations(): StoredConversation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isStoredConversation) : [];
  } catch {
    return [];
  }
}

export function writeStoredConversations(conversations: StoredConversation[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  } catch {
    // localStorage unavailable (private mode, quota exceeded, etc.) — no-op
  }
}

export function deriveTitle(firstUserMessageText: string): string {
  const trimmed = firstUserMessageText.trim();
  if (trimmed.length <= TITLE_MAX_LENGTH) return trimmed || "New conversation";
  return `${trimmed.slice(0, TITLE_MAX_LENGTH).trimEnd()}…`;
}

/** Keeps the MAX_CONVERSATIONS most-recently-updated conversations. */
export function pruneConversations(conversations: StoredConversation[]): StoredConversation[] {
  return [...conversations]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_CONVERSATIONS);
}

function generateConversationId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `conv-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export interface UseConversationsResult {
  conversations: StoredConversation[];
  activeConversationId: string;
  startNewConversation: () => void;
  saveConversation: (id: string, messages: ChatMessage[]) => void;
  switchToConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
}

export function useConversations(): UseConversationsResult {
  const initRef = useRef(false);
  const [conversations, setConversations] = useState<StoredConversation[]>([]);
  // useId() is stable between server render and initial client render, unlike
  // crypto.randomUUID() — starting the active conversation on a random id
  // generated separately on each side would be a real hydration mismatch.
  // Every conversation id generated AFTER mount (startNewConversation,
  // deleteConversation's fallback) uses generateConversationId() instead,
  // since those only ever run from client-side event handlers.
  const initialId = useId();
  const [activeConversationId, setActiveConversationId] = useState<string>(initialId);

  useEffect(() => {
    if (!initRef.current) {
      initRef.current = true;
      setConversations(pruneConversations(readStoredConversations()));
    }
  }, []);

  const startNewConversation = useCallback(() => {
    setActiveConversationId(generateConversationId());
  }, []);

  const saveConversation = useCallback((id: string, messages: ChatMessage[]) => {
    if (messages.length === 0) return;
    setConversations(prev => {
      const existing = prev.find(c => c.id === id);
      const firstUserText =
        messages
          .find(m => m.role === "user")
          ?.parts.filter(p => p.type === "text")
          .map(p => p.text)
          .join("") ?? "";
      const title = existing?.title ?? deriveTitle(firstUserText);
      const updated: StoredConversation = { id, title, updatedAt: Date.now(), messages };
      const next = pruneConversations([updated, ...prev.filter(c => c.id !== id)]);
      writeStoredConversations(next);
      return next;
    });
  }, []);

  const switchToConversation = useCallback((id: string) => {
    setActiveConversationId(id);
  }, []);

  const deleteConversation = useCallback((id: string) => {
    setConversations(prev => {
      const next = prev.filter(c => c.id !== id);
      writeStoredConversations(next);
      return next;
    });
    setActiveConversationId(current => (current === id ? generateConversationId() : current));
  }, []);

  return {
    conversations,
    activeConversationId,
    startNewConversation,
    saveConversation,
    switchToConversation,
    deleteConversation,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- app/hooks/__tests__/use-conversations.test.ts`
Expected: PASS (10/10).

- [ ] **Step 5: Lint, typecheck, commit**

```bash
npm run lint && npx tsc --noEmit
git add app/hooks/use-conversations.ts app/hooks/__tests__/use-conversations.test.ts
git commit -m "feat: localStorage-backed multi-conversation history hook"
```

---

### Task 5: Split `ChatApp` into an outer shell and a keyed `ChatThread`

**Files:**
- Create: `app/components/chat-thread.tsx`
- Modify: `app/components/chat-app.tsx` (full rewrite)

**Interfaces:**
- Consumes: `useConversations`/`StoredConversation`/`UseConversationsResult` from Task 4; `TypingIndicator` from Task 1; `SourceChips` (via `ChatMessageBubble`, unchanged) from Tasks 2-3; `ChatStatus` from `ai`.
- Produces: `ChatThread(props: { initialMessages: ChatMessage[]; onMessagesChange: (messages: ChatMessage[]) => void; onStatusChange: (status: ChatStatus) => void; isShortlisted: (file: string) => boolean; onToggleShortlist: (file: string) => void; onOpenDirectory: () => void; pendingPrompt: string | null; onPendingPromptConsumed: () => void }): JSX.Element`. `ChatApp`'s own props are unchanged (`{ candidates: CandidateSummary[] }`), but it now renders `CandidatePanel` with new props that Task 6 requires (see that task).

- [ ] **Step 1: Create `ChatThread`**

This absorbs the message list, input row, auto-scroll, and typing-indicator/suggestions logic that currently lives in `ChatApp`. The `useChat` instance now lives here instead — this component is meant to be rendered with `key={conversationId}` by its parent so that switching conversations remounts it cleanly.

```tsx
// app/components/chat-thread.tsx
"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type ChatStatus } from "ai";
import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/chat-types";
import { ChatMessageBubble } from "./chat-message";
import { FollowUpSuggestions } from "./follow-up-suggestions";
import { TypingIndicator } from "./typing-indicator";

const SUGGESTIONS = [
  "Who has experience with Python?",
  "Which candidate graduated from UPC?",
  "Compare the two strongest data engineers.",
];

interface ChatThreadProps {
  initialMessages: ChatMessage[];
  onMessagesChange: (messages: ChatMessage[]) => void;
  onStatusChange: (status: ChatStatus) => void;
  isShortlisted: (file: string) => boolean;
  onToggleShortlist: (file: string) => void;
  onOpenDirectory: () => void;
  pendingPrompt: string | null;
  onPendingPromptConsumed: () => void;
}

export function ChatThread({
  initialMessages,
  onMessagesChange,
  onStatusChange,
  isShortlisted,
  onToggleShortlist,
  onOpenDirectory,
  pendingPrompt,
  onPendingPromptConsumed,
}: ChatThreadProps) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

  const { messages, sendMessage, status, error, clearError } = useChat<ChatMessage>({
    messages: initialMessages,
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });

  const submit = (text: string) => {
    if (text.trim() && status !== "submitted" && status !== "streaming") {
      if (status === "error") clearError();
      sendMessage({ text });
      setInput("");
    }
  };

  useEffect(() => {
    onMessagesChange(messages);
  }, [messages, onMessagesChange]);

  useEffect(() => {
    onStatusChange(status);
  }, [status, onStatusChange]);

  useEffect(() => {
    if (pendingPrompt) {
      submit(pendingPrompt);
      onPendingPromptConsumed();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- submit closes over status/sendMessage; re-running on every status change would re-fire this effect without pendingPrompt having changed
  }, [pendingPrompt]);

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
  const lastAssistantHasText =
    lastAssistantMessage?.parts.some(p => p.type === "text" && p.text.length > 0) ?? false;
  const showSuggestions =
    messages.length > 0 &&
    (status === "ready" || status === "error") &&
    lastAssistantMessage !== undefined;
  const showTypingIndicator =
    status === "submitted" || (status === "streaming" && !lastAssistantHasText);

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 space-y-4 overflow-y-auto p-4">
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
            isShortlisted={isShortlisted}
            onToggleShortlist={onToggleShortlist}
          />
        ))}
        {showTypingIndicator && <TypingIndicator />}
        {error && <p className="text-sm text-danger">{error.message}</p>}
        {showSuggestions && (
          <FollowUpSuggestions sources={lastSources} onAsk={submit} onOpenDirectory={onOpenDirectory} />
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
  );
}
```

The `pendingPrompt` effect intentionally omits `onPendingPromptConsumed`/`submit` from its dependency array with an explicit, justified `eslint-disable` comment — re-running on every status change (which changes `submit`'s closure) would re-fire the same prompt. This is a real, deliberate exception, not the same class of issue as the `use-shortlist.ts` case: verify with `npm run lint` that this is in fact the ONLY suppressed warning this task needs; if the two plain `[messages, onMessagesChange]`/`[status, onStatusChange]` effects above it also warn, do not silence them without first reading why — per the Global Constraints note, opaque prop-function calls in an effect should not trip `set-state-in-effect`, so a warning there would be a genuine, worth-investigating finding.

- [ ] **Step 2: Rewrite `ChatApp` as the outer shell**

```tsx
// app/components/chat-app.tsx
"use client";

import { useState } from "react";
import type { ChatStatus } from "ai";
import type { CandidateSummary } from "@/lib/candidates";
import type { ChatMessage } from "@/lib/chat-types";
import { useShortlist } from "@/app/hooks/use-shortlist";
import { useConversations } from "@/app/hooks/use-conversations";
import { CandidatePanel } from "./candidate-panel";
import { ChatThread } from "./chat-thread";

export function ChatApp({ candidates }: { candidates: CandidateSummary[] }) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelTab, setPanelTab] = useState<"candidates" | "shortlist" | "history">("candidates");
  const [status, setStatus] = useState<ChatStatus>("ready");
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);

  const shortlist = useShortlist();
  const conversations = useConversations();

  const activeConversation = conversations.conversations.find(
    c => c.id === conversations.activeConversationId,
  );
  const initialMessages: ChatMessage[] = activeConversation?.messages ?? [];
  const isBusy = status === "submitted" || status === "streaming";

  const openDirectory = () => {
    setPanelTab("candidates");
    setPanelOpen(true);
  };

  const handleNewChat = () => {
    if (isBusy) return;
    conversations.startNewConversation();
  };

  const handleSwitchConversation = (id: string) => {
    if (isBusy) return;
    conversations.switchToConversation(id);
    setPanelOpen(false);
  };

  return (
    <div className="flex h-dvh flex-col bg-canvas text-ink">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-hairline px-4">
        <div>
          <h1 className="text-xl font-bold">CV Screener</h1>
          <p className="text-xs text-mute">{`${candidates.length} candidates indexed`}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleNewChat}
            disabled={isBusy}
            className="rounded border border-hairline-strong px-3 py-1.5 text-sm hover:bg-surface-soft disabled:opacity-50"
          >
            New chat
          </button>
          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            className="relative rounded border border-hairline-strong px-3 py-1.5 text-sm hover:bg-surface-soft lg:hidden"
          >
            Candidates
            {shortlist.shortlisted.size > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[10px] text-accent-foreground">
                {shortlist.shortlisted.size}
              </span>
            )}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <ChatThread
          key={conversations.activeConversationId}
          initialMessages={initialMessages}
          onMessagesChange={messages =>
            conversations.saveConversation(conversations.activeConversationId, messages)
          }
          onStatusChange={setStatus}
          isShortlisted={shortlist.isShortlisted}
          onToggleShortlist={shortlist.toggle}
          onOpenDirectory={openDirectory}
          pendingPrompt={pendingPrompt}
          onPendingPromptConsumed={() => setPendingPrompt(null)}
        />

        <CandidatePanel
          candidates={candidates}
          shortlist={shortlist}
          conversations={conversations.conversations}
          activeConversationId={conversations.activeConversationId}
          onSwitchConversation={handleSwitchConversation}
          onDeleteConversation={conversations.deleteConversation}
          isBusy={isBusy}
          activeTab={panelTab}
          onTabChange={setPanelTab}
          isOpen={panelOpen}
          onClose={() => setPanelOpen(false)}
          onAsk={setPendingPrompt}
        />
      </div>
    </div>
  );
}
```

`onAsk={setPendingPrompt}` type-checks directly: `setPendingPrompt`'s parameter type is `string | null | ((prev: string | null) => string | null)`, a supertype of the `(prompt: string) => void` shape `CandidatePanel` expects, so no wrapper function is needed — this is a real, intentional TypeScript contravariance detail, not an oversight; do not "fix" it by wrapping in an arrow function.

Note: `activeConversationId` starts as a React `useId()`-based value (from `useConversations`, Task 4) that never matches any *stored* conversation's id, so `activeConversation` is `undefined` and `initialMessages` is `[]` on both the server render and the initial client render — no hydration mismatch. `CandidatePanel` does not yet exist with this new prop shape; that's Task 6.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: errors in `app/components/candidate-panel.tsx` (it doesn't accept these new props yet) — this is the same kind of deliberately tracked, temporary intermediate state used earlier in this project (e.g. the redesign plan's Task 5→9 gap). Confirm the *only* errors are about `CandidatePanel`'s prop mismatch, nothing else, then proceed — Task 6 resolves this.

Run: `npm run lint`
Expected: clean (lint doesn't type-check props against a component's declared interface the way `tsc` does, so this should pass even with the props mismatch pending).

Run: `npm test`
Expected: all existing suites still pass (no test touches these two files' JSX directly).

- [ ] **Step 4: Commit**

```bash
git add app/components/chat-thread.tsx app/components/chat-app.tsx
git commit -m "feat: split chat surface into a keyed ChatThread for multi-conversation support"
```

Note in your report that `npx tsc --noEmit` has expected, tracked errors in `app/components/candidate-panel.tsx` until Task 6 — this is deliberate, not a regression to fix now.

---

### Task 6: History tab in `CandidatePanel`

**Files:**
- Modify: `app/components/candidate-panel.tsx` (full rewrite)
- Test: `app/components/__tests__/candidate-panel.test.ts`

**Interfaces:**
- Consumes: `StoredConversation` from `@/app/hooks/use-conversations` (Task 4); `CandidateSummary` from `@/lib/candidates` (unchanged); `UseShortlistResult` from `@/app/hooks/use-shortlist` (unchanged).
- Produces: `formatRelativeTime(timestamp: number, now?: number): string` (exported for testing). `CandidatePanel`'s new prop shape is defined below and must match exactly what `ChatApp` (Task 5) already passes: `{ candidates, shortlist, conversations, activeConversationId, onSwitchConversation, onDeleteConversation, isBusy, activeTab: "candidates" | "shortlist" | "history", onTabChange, isOpen, onClose, onAsk }`.

- [ ] **Step 1: Write the failing test for the relative-time formatter**

```ts
// app/components/__tests__/candidate-panel.test.ts
import { describe, expect, it } from "vitest";
import { formatRelativeTime } from "@/app/components/candidate-panel";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("formatRelativeTime", () => {
  it("returns 'just now' for under a minute", () => {
    const now = 1_000_000;
    expect(formatRelativeTime(now - 30_000, now)).toBe("just now");
  });

  it("returns minutes for under an hour", () => {
    const now = 1_000_000;
    expect(formatRelativeTime(now - 5 * MINUTE, now)).toBe("5m ago");
  });

  it("returns hours for under a day", () => {
    const now = 1_000_000;
    expect(formatRelativeTime(now - 3 * HOUR, now)).toBe("3h ago");
  });

  it("returns days for under a week", () => {
    const now = 1_000_000;
    expect(formatRelativeTime(now - 2 * DAY, now)).toBe("2d ago");
  });

  it("falls back to a locale date string past a week", () => {
    const now = Date.now();
    const eightDaysAgo = now - 8 * DAY;
    expect(formatRelativeTime(eightDaysAgo, now)).toBe(new Date(eightDaysAgo).toLocaleDateString());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- app/components/__tests__/candidate-panel.test.ts`
Expected: FAIL — `formatRelativeTime` is not exported (doesn't exist yet).

- [ ] **Step 3: Rewrite `CandidatePanel`**

```tsx
// app/components/candidate-panel.tsx
"use client";

import { useState } from "react";
import type { CandidateSummary } from "@/lib/candidates";
import type { StoredConversation } from "@/app/hooks/use-conversations";
import type { UseShortlistResult } from "@/app/hooks/use-shortlist";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

export function formatRelativeTime(timestamp: number, now: number = Date.now()): string {
  const diffMs = now - timestamp;
  if (diffMs < MINUTE) return "just now";
  if (diffMs < HOUR) return `${Math.floor(diffMs / MINUTE)}m ago`;
  if (diffMs < DAY) return `${Math.floor(diffMs / HOUR)}h ago`;
  if (diffMs < WEEK) return `${Math.floor(diffMs / DAY)}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

type PanelTab = "candidates" | "shortlist" | "history";

interface CandidatePanelProps {
  candidates: CandidateSummary[];
  shortlist: UseShortlistResult;
  conversations: StoredConversation[];
  activeConversationId: string;
  onSwitchConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  isBusy: boolean;
  activeTab: PanelTab;
  onTabChange: (tab: PanelTab) => void;
  isOpen: boolean;
  onClose: () => void;
  onAsk: (prompt: string) => void;
}

export function CandidatePanel({
  candidates,
  shortlist,
  conversations,
  activeConversationId,
  onSwitchConversation,
  onDeleteConversation,
  isBusy,
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

  const handleSwitch = (id: string) => {
    if (isBusy) return;
    onSwitchConversation(id);
    onClose();
  };

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-40 bg-ink/30 lg:hidden" onClick={onClose} aria-hidden="true" />
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
            className="flex min-h-9 items-center rounded px-3 text-sm hover:bg-surface-soft"
          >
            Close
          </button>
        </div>

        <div className="flex border-b border-hairline-strong">
          <button
            type="button"
            onClick={() => onTabChange("candidates")}
            className={`flex-1 border-b-2 px-2 py-2 text-sm font-medium ${
              activeTab === "candidates" ? "border-ink text-ink" : "border-transparent text-mute hover:text-ink"
            }`}
          >
            Candidates ({candidates.length})
          </button>
          <button
            type="button"
            onClick={() => onTabChange("shortlist")}
            className={`flex-1 border-b-2 px-2 py-2 text-sm font-medium ${
              activeTab === "shortlist" ? "border-ink text-ink" : "border-transparent text-mute hover:text-ink"
            }`}
          >
            Shortlist ({shortlist.shortlisted.size})
          </button>
          <button
            type="button"
            onClick={() => onTabChange("history")}
            className={`flex-1 border-b-2 px-2 py-2 text-sm font-medium ${
              activeTab === "history" ? "border-ink text-ink" : "border-transparent text-mute hover:text-ink"
            }`}
          >
            History ({conversations.length})
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

        {activeTab !== "history" && (
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
                  aria-label={shortlist.isShortlisted(c.file) ? "Remove from shortlist" : "Add to shortlist"}
                  className={`flex min-h-9 min-w-9 shrink-0 items-center justify-center rounded border px-2 text-xs ${
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
        )}

        {activeTab === "history" && (
          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 && (
              <p className="p-4 text-sm text-mute">Conversations appear here once you start chatting.</p>
            )}
            {conversations.map(c => (
              <div
                key={c.id}
                className={`flex items-start gap-2 border-b border-hairline p-3 ${
                  c.id === activeConversationId ? "bg-surface-soft" : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => handleSwitch(c.id)}
                  disabled={isBusy}
                  className="min-w-0 flex-1 text-left disabled:opacity-50"
                >
                  <p className="truncate text-sm font-medium">{c.title}</p>
                  <p className="text-xs text-mute">{formatRelativeTime(c.updatedAt)}</p>
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteConversation(c.id)}
                  aria-label={`Delete conversation "${c.title}"`}
                  className="flex min-h-9 min-w-9 shrink-0 items-center justify-center rounded border border-hairline-strong text-xs text-mute hover:text-danger"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </aside>
    </>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- app/components/__tests__/candidate-panel.test.ts`
Expected: PASS (5/5).

- [ ] **Step 5: Full verify**

Run: `npm run lint && npx tsc --noEmit && npm test`
Expected: all clean — this is the point where the `tsc` errors tracked since Task 5 finally resolve, since `CandidatePanel` now accepts the props `ChatApp` passes.

- [ ] **Step 6: Commit**

```bash
git add app/components/candidate-panel.tsx app/components/__tests__/candidate-panel.test.ts
git commit -m "feat: add conversation history tab to the candidate panel"
```

---

### Task 7: Full regression and live verification

**Files:**
- No new files expected; only fixes for anything found below (small, targeted).

**Interfaces:**
- Consumes: the fully wired app from Task 6.

- [ ] **Step 1: Automated gate**

Run: `npm run lint && npx tsc --noEmit && npm test && npm run build`
Expected: all clean, all tests passing, production build succeeds.

- [ ] **Step 2: Live verification**

With `npm run dev` running (browser automation if available; otherwise reason carefully and state clearly what could not be directly observed):

1. **Typing indicator:** ask a question, confirm the dots bubble appears immediately and is replaced by real text the instant the first token streams in.
2. **Chip timing + dedup:** ask a question whose answer cites one candidate across multiple CV sections (e.g. "Tell me about Marc Serra" if his CV has both Skills and Experience matches). Confirm: (a) no chips appear before the answer starts streaming, (b) that candidate gets exactly one chip, (c) hovering it shows all matched sections in the tooltip.
3. **New conversation:** send a message, then click "New chat" — confirm the chat clears and the input is ready for a fresh conversation.
4. **History persistence:** send a message in a conversation, open the History tab, confirm it appears with a sensible truncated title and a "just now"-style timestamp. Switch to a different (new) conversation via "New chat", then switch back via the History tab — confirm the original messages reappear exactly as they were.
5. **Delete:** delete a conversation from the History tab — confirm it disappears from the list; if it was the active one, confirm the chat surface resets to a fresh empty conversation.
6. **Shortlist independence:** shortlist a candidate, switch conversations via History, confirm the shortlist tab/badge count is unaffected by the switch.
7. **Busy-state gating:** while a response is streaming, confirm "New chat" and History-tab row clicks are disabled (or at least visibly inert) until the response finishes.
8. **Mobile width:** at a narrow viewport (375px), confirm all three sidebar tabs ("Candidates", "Shortlist", "History") fit without overlapping or wrapping awkwardly.
9. **Reload persistence:** send a message, reload the page. Confirm you land on a fresh new conversation (not the one you were just in) and that the previous conversation is still reachable via the History tab with its messages intact.

- [ ] **Step 3: Fix anything found**

If any check above fails, diagnose the root cause and apply a small, targeted fix (not a rewrite) in the relevant file from Tasks 1-6. Re-run the full Step 1 gate and the specific failed Step 2 check after any fix.

- [ ] **Step 4: Commit (only if Step 3 found something to fix)**

```bash
git add -A
git commit -m "fix: address issues found in chat UX improvements regression pass"
```

If nothing needed fixing, state that explicitly in your report and skip this commit (no empty commits).

---

## Self-review notes

- Spec coverage: typing indicator (T1), chip dedup+tooltip (T2), chip timing gate (T3), conversation storage (T4), keyed-remount switching + New Chat + busy-gating (T5), History tab + relative time (T6), shortlist independence and reload behavior (T7, verified live — no code change needed since it falls out of the T4/T5 design). ✔
- Placeholder scan: no TBD/TODO; every step has complete code or an exact command. ✔
- Type consistency checked across tasks: `StoredConversation`/`UseConversationsResult` (T4) used identically in T5/T6; `ChatThreadProps` (T5) fully self-contained; `CandidatePanelProps`'s new shape (T6) matches exactly what T5's `ChatApp` already passes (`conversations`, `activeConversationId`, `onSwitchConversation`, `onDeleteConversation`, `isBusy`, plus the widened `PanelTab` union used identically in both files). `SourceChips`'s prop signature is untouched by T2, so T3's consumer needs no changes beyond the one-line gate. ✔
- Known, deliberately-sequenced intermediate state: Task 5 leaves `app/components/candidate-panel.tsx` failing `tsc` until Task 6 replaces its prop shape — flagged explicitly in both tasks so it isn't mistaken for a regression during review, mirroring how this project's earlier redesign plan handled the same kind of cross-task sequencing gap.
- Verified against actual installed code, not assumed: `ChatStatus`'s export from `ai` (confirmed in `node_modules/ai/dist/index.d.ts`), `useChat`'s `messages` init option accepting `UI_MESSAGE[]` (confirmed in `ChatInit`), and the exact behavior of `eslint-plugin-react-hooks`'s `set-state-in-effect` rule (read its actual source) to determine which effects in Task 5 genuinely need a suppression comment (one, with justification) versus which don't.
