# Chat UX Improvements — Design

**Date:** 2026-07-23
**Context:** Follow-up polish on the redesigned chat UI. The user requested four improvements; investigation found markdown formatting already works (dropped from scope) and traced a "constant rerendering" report to a stale service worker in the browser from an unrelated prior project sharing `localhost:3000` — not a code bug, resolved by clearing it in DevTools. Three items remain: a proper loading indicator, source-chip timing/dedup, and multi-conversation chat history.

## Decisions (settled during brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| Formatting | Dropped — already works | `react-markdown` + bold citations confirmed working by the user after the rerender bug was cleared |
| Loading indicator | Typing-dots bubble, not plain text | Anchors visually where the answer will appear; matches the assistant-bubble style already in use |
| Chip timing | Client-side gate (don't render until text exists), not a server-side stream reorder | Sources are the retrieval context computed *before* generation — delaying them server-side would require buffering the response stream for a purely cosmetic effect |
| Chip dedup | Grouped in `SourceChips` (display-only), not in the API route | Keeps the `SourceRef[]` data contract unchanged for other consumers (`getFollowUpSuggestions`, `CandidatePanel`); one chip per candidate, sections joined into a hover tooltip |
| Chat history scope | Multiple saved conversations (ChatGPT-style), not single-conversation persistence | Explicit user choice — a conversation list you can switch between, not just "survive a refresh" |
| Conversation switching mechanism | Remount `useChat` keyed by conversation id | `useChat` only consumes its initial `messages`/`id` once, at mount (verified against installed `ai`/`@ai-sdk/react` types) — re-passing a different `messages` array on a later render does not reseed it. A key-based remount is the correct, safe pattern; anything else risks stale streaming state leaking between threads |
| History persistence | `localStorage`, same pattern as the existing shortlist | Consistent with the app's established local-only persistence approach; no backend in scope |
| Shortlist scope | Unchanged — stays global, not per-conversation | Explicit constraint carried over from the original redesign |

## 1. Loading indicator

**Current state:** `app/components/chat-app.tsx` shows a plain `<p>Searching CVs…</p>` only while `status === "submitted"`, which disappears the instant streaming starts even if no text has arrived yet.

**New behavior:** a `TypingIndicator` component styled like an assistant message bubble (same `border border-hairline bg-surface-soft` treatment as `ChatMessageBubble`'s assistant variant, containing three animated dots) renders whenever:
- `status === "submitted"`, OR
- `status === "streaming"` AND the in-progress assistant message has no text content yet.

It disappears the moment real text starts rendering in that message — no separate teardown logic needed, since it's driven by the same condition each render.

## 2. Source chips — timing and dedup

**Timing:** `ChatMessageBubble` already extracts `text` (joined text parts) and `sources` (from the `data-sources` part) for a message. Add one condition: only render `<SourceChips>` when `text.length > 0`. The data itself still arrives immediately (unchanged in `app/api/chat/route.ts`) — only the render is gated. This means on a slow model response, the chips visually appear at the same moment the first token does, not before.

**Dedup:** `SourceChips` currently renders one chip per `SourceRef` (deduped upstream by `file#section`, so a candidate with 2 matching sections gets 2 chips). Change `SourceChips` to group its incoming `sources: SourceRef[]` by `file` internally:
- Sort candidates by their best (highest) score across all their entries — reusing the same "best score per candidate" logic already proven correct in `getFollowUpSuggestions`.
- Render one chip per candidate: visible label is just the name; `title` (tooltip) lists every matched section for that candidate, comma-joined (e.g. `"Skills, Experience — similarity 0.61"`).
- The chip's shortlist toggle and PDF link continue to use `file`, unchanged.

No changes to `app/api/chat/route.ts`, `lib/chat-types.ts`, or `getFollowUpSuggestions` — the `SourceRef[]` contract is untouched; only `SourceChips`'s internal rendering logic changes.

## 3. Chat history

### Data model

```ts
interface StoredConversation {
  id: string;
  title: string;
  updatedAt: number; // Date.now()
  messages: ChatMessage[];
}
```

Stored as a JSON array under `localStorage` key `cv-screener:conversations`, capped at the 50 most-recently-updated conversations (oldest pruned on write past that cap) to bound storage growth. Same read/write robustness pattern as the existing `use-shortlist.ts`: guarded `typeof window` checks, try/catch around `JSON.parse`/`localStorage` access, malformed data treated as empty rather than thrown.

### New hook: `useConversations`

Parallel to `useShortlist`. Owns:
- `conversations: StoredConversation[]` (sorted by `updatedAt` descending)
- `activeConversationId: string`
- `startNewConversation(): void` — generates a fresh id, sets it active. Does **not** write to storage yet (an unused "new chat" never clutters history).
- `saveConversation(id: string, messages: ChatMessage[]): void` — called whenever the active conversation's messages change and `messages.length > 0`. Upserts the conversation record: creates it (deriving `title` from the first user message, truncated to ~40 chars with an ellipsis if longer) on first save, updates `messages`/`updatedAt` on every subsequent save.
- `switchToConversation(id: string): void` — sets `activeConversationId`.
- `deleteConversation(id: string): void` — removes from storage; if the deleted conversation was active, switches to a new empty conversation.

### Remount mechanism

`ChatApp` splits into two layers:
- **Outer layer** (unchanged component name `ChatApp`): owns `useConversations`, the sidebar/panel state, and renders the header + `CandidatePanel`. Delegates the actual chat surface to an inner component.
- **Inner layer** (new, e.g. `ChatThread`): contains the `useChat` call, message list, input row, auto-scroll logic — everything currently in `ChatApp` that depends on the live conversation. Rendered as `<ChatThread key={activeConversationId} initialMessages={...} onMessagesChange={(messages) => saveConversation(activeConversationId, messages)} />` — the outer layer binds the conversation id into the closure it passes down, so `ChatThread` itself only ever deals with a plain `(messages: ChatMessage[]) => void` callback and never needs to know about conversation ids.

Because it's keyed by `activeConversationId`, switching conversations (or starting a new one) unmounts the old `ChatThread` and mounts a fresh one seeded with that conversation's stored `messages` — a clean instance boundary, no manual state-reset code needed. An orphaned in-flight request from a just-unmounted thread (e.g. if the user switches away mid-stream) simply has its response arrive with no live component to apply it to; this is an accepted, low-risk edge case rather than something requiring an abort-on-unmount mechanism, since switching/starting-new is already disabled while the active thread's `status` is `"submitted"`/`"streaming"` (existing gating pattern, carried over).

### Sidebar

`CandidatePanel` gains a third tab, "History", alongside "Candidates" and "Shortlist" (same tab-strip pattern, same responsive persistent-sidebar/drawer behavior — no new responsive logic needed). Each row: title, relative timestamp (e.g. "2h ago"), click to switch (closes the drawer on mobile, consistent with the existing "ask" auto-close behavior), and a delete affordance. Empty state explains that conversations appear here once you start chatting.

The relative-timestamp label is a small hand-rolled formatter (a handful of `if` branches over a millisecond diff — "just now", "Xm ago", "Xh ago", "Xd ago", falling back to a locale date string past 7 days). No new date-formatting dependency (e.g. `date-fns`) is needed or justified for one label.

### "New chat" button

Existing header button now calls `startNewConversation()` instead of `setMessages([])`. Behavior from the user's perspective is identical (empty chat surface) but is now backed by a real, switchable, freshly-generated conversation id.

## Testing

- `lib/conversations.ts` (or wherever the pure storage functions live, following the `use-shortlist.ts` file-split precedent): vitest coverage for read/write robustness (empty, malformed JSON, non-array, SSR-safe), title truncation at the 40-char boundary, and the 50-conversation cap/prune behavior.
- `SourceChips`'s new grouping logic: vitest coverage for the "one chip per candidate, sections joined" behavior — reusing the same test-fixture style as `getFollowUpSuggestions`'s existing "best score per candidate" tests.
- Loading indicator, chip-timing gate, conversation switching/persistence end-to-end: verified live against the dev server and a browser, consistent with how the rest of this project has been verified.

## Out of scope

- No backend/server persistence for conversations — `localStorage` only, single browser/device, matching the shortlist's existing scope.
- No AI-generated conversation titles — first-message truncation only.
- No conversation renaming, search, or folders.
- No changes to the RAG backend, retrieval logic, or system prompt.
- No abort-on-unmount for orphaned streams when switching conversations mid-response (accepted edge case, see Remount mechanism above).
