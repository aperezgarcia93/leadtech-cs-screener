# Chat UI Redesign — Design

**Date:** 2026-07-23
**Context:** The CV screener's chat UI (`app/page.tsx`) currently works but is a minimal Tailwind reskin with no responsive layout and no UX beyond basic Q&A. This redesign brings the UI up to production-interview quality: a design-system-driven visual overhaul plus four UX features that make the tool genuinely useful for a recruiter screening multiple candidates in one sitting.

## Decisions (settled during brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| Design approach | "Reskin" (Option A), not a full terminal/TUI interface | Keeps the chat immediately usable for a recruiter; borrows DESIGN.md's palette, type, spacing, and shape language without forcing a command-line metaphor onto a business tool |
| Font | JetBrains Mono via `next/font/google` | DESIGN.md's own documented substitute for the paid Berkeley Mono; closest metric match, self-hosted (no runtime fetch) |
| Dark mode | Supported, with an invented-but-consistent dark palette | DESIGN.md defines no dark chat surface (its only dark component is a marketing hero mockup); user asked to keep dark mode, so the dark tokens are derived from DESIGN.md's own `surface-dark`/`surface-dark-elevated` values in the same spirit |
| New features | Candidate directory, shortlist/bookmarks, suggested follow-ups, new-chat reset (plus a copy-answer button) | All four selected by the user; all derivable from data already in `data/index.json` — no new data pipeline needed |
| Shortlist persistence | `localStorage`, survives page refresh | It's a recruiter's working artifact, distinct from the conversation itself (which resets via "New chat") |
| Layout | Two-column desktop (chat + sidebar), slide-in drawer sidebar on mobile/tablet | Sidebar holds the candidate directory and shortlist; must not consume the mobile chat viewport permanently |

## Visual system

Adapts DESIGN.md's tokens; does not adopt its marketing-page layout rhythm (96px section spacing, ASCII bullet markers, full-bleed hero) since none of that applies to a dense chat app.

### Colors

**Light** (from DESIGN.md verbatim):
- canvas `#fdfcfc`, ink `#201d1d`, body `#424245`, mute `#646262`
- surface-soft `#f8f7f7`, surface-card `#f1eeee`
- hairline `rgba(15,0,0,0.12)`, hairline-strong `#646262`
- accent `#007aff` (DESIGN.md reserves this for in-product UI, not marketing chrome — a chat app qualifies as in-product, so it's used here for focus rings, active toggles, and the primary send button)
- success `#30d158`, danger `#ff3b30`, warning `#ff9f0a` (used for shortlist confirmation, error states, rate-limit notices respectively)

**Dark** (derived, not in DESIGN.md): canvas `#201d1d` (DESIGN.md's `surface-dark`), surface-soft `#302c2c` (DESIGN.md's `surface-dark-elevated`), ink/text `#fdfcfc`, mute `#9a9898` (DESIGN.md's `ash`), hairline `rgba(253,252,252,0.12)` (light-tinted inverse of the light hairline), same accent/success/danger/warning (already readable on dark).

Implemented as CSS custom properties in `app/globals.css`, switched via `prefers-color-scheme` (matches the project's existing pattern — no manual toggle in scope).

### Typography

| Role | Size / Weight / Line-height | Use |
|---|---|---|
| app-title | 20px / 700 / 1.3 | Header "CV Screener" title (new size — DESIGN.md has no page-header size between its 16px label and 38px marketing hero) |
| heading-md | 16px / 700 / 1.5 | Sidebar tab labels, panel section headers |
| body-strong | 16px / 500 / 1.5 | Candidate names, emphasis |
| body-md | 16px / 400 / 1.5 | Chat message text, input text |
| caption-md | 14px / 400 / 1.6 | Source-chip metadata, timestamps, similarity scores, candidate teaser lines |

### Shape & elevation

- 4px radius (`rounded.sm`) on every interactive element: buttons, inputs, chips, message bubbles, panel cards. Deliberately sharper than a typical chat app's bubble rounding — this is the one place the DESIGN.md aesthetic reads clearly against a conventional chat UI.
- 0px radius on structural containers: header bar, sidebar outer frame, message-list scroll region.
- No box-shadow anywhere. 1px hairline borders separate every surface (message bubbles get a hairline border instead of relying on background-color contrast alone in light mode where bubble/canvas contrast is subtle).

### Spacing

8px-based scale (4 / 8 / 12 / 16 / 24 / 32px) for all internal padding and gaps. The 96px marketing rhythm from DESIGN.md is not used.

## Layout

### Desktop (≥1024px)

```
┌─────────────────────────────────────────────┐
│ Header: "CV Screener"           [New chat]   │
├───────────────────────────┬───────────────────┤
│                           │ [Candidates|Shortlist]│
│  Message list             │                   │
│  (scrolls independently)  │  search box       │
│                           │  ─────────────    │
│                           │  candidate rows /  │
│                           │  shortlist rows    │
│                           │                   │
├───────────────────────────┤                   │
│  Suggested follow-ups     │                   │
├───────────────────────────┤                   │
│  Input row        [Ask]   │                   │
└───────────────────────────┴───────────────────┘
```

Chat column: `flex-1 min-w-0`. Sidebar: fixed ~320px, own scroll region, persistent (not collapsible at this width).

### Mobile / tablet (<1024px)

Single column — chat only. A header button ("Candidates", with a badge if shortlist is non-empty) opens the sidebar as a right-side slide-in drawer with a backdrop, dismissible by backdrop tap or a close button. Same tabbed content (Candidates / Shortlist) as desktop, full-height.

### Touch targets & safe areas

All interactive elements ≥36–40px tall (matches DESIGN.md's own touch-target guidance). Input row gets `padding-bottom: env(safe-area-inset-bottom)` for iOS home-indicator clearance.

### Scroll & drawer behavior

- The message list auto-scrolls to the latest message as new content streams in (on every message-array change and on streaming text deltas), unless the user has manually scrolled up — in that case new content arrives without yanking their scroll position. A minimal `useEffect`-based approach (scroll-to-bottom on change, skipped if the user isn't already near the bottom) is sufficient; no separate "jump to latest" button is required for this pass.
- On mobile/tablet, the sidebar drawer closes automatically after an action that leaves it (asking about a candidate, sending a compare/follow-up prompt) so the user lands back on the chat to see the streaming answer. It does NOT auto-close on a shortlist toggle (the user is likely bookmarking more than one candidate in a row).

## Features

### 1. Candidate directory

- New server-only module `lib/candidates.ts`: reads the existing `loadIndex()` from `lib/retrieval.ts`, groups chunks by `file`, and for each candidate extracts `{ name, file, teaser }`. `teaser` is best-effort-parsed from that candidate's "Header" chunk text (format: `"<Name> — Header: <Name> <Title> <email> · <phone> · <Location>"`) — strips the duplicated name and contact info, keeping `<Title> · <Location>`. If parsing fails (unexpected format), `teaser` is `undefined` and the UI shows just the name — never a garbled string.
- `app/page.tsx` (Server Component) calls this once per request and passes the list into the client tree as a prop — no client-side fetch, no new API route.
- Sidebar "Candidates" tab: a text filter (client-side substring match on name) above a scrollable list of rows. Each row: name + teaser, a small "View PDF" link (opens `/api/cvs/<file>`, existing route, unchanged), and a shortlist toggle (see Feature 2). Clicking the name (not the PDF link or toggle) sends `"Tell me about {name}."` through the existing chat submit path — same auto-send behavior as the current suggestion buttons.

### 2. Shortlist / bookmarks

- New hook `app/hooks/use-shortlist.ts`: `{ shortlisted: Set<string>, toggle(file: string): void, isShortlisted(file: string): boolean }`, backed by `localStorage` under a single key (JSON array of files), hydrated on mount (guarding against SSR/hydration mismatch — starts empty on the server, syncs after mount).
- The toggle appears in three places, all calling the same hook instance (lifted to `chat-app.tsx`, passed down): candidate directory rows, source chips under assistant messages, and shortlist rows themselves (as a remove action).
- Sidebar "Shortlist" tab: same row layout as the directory, filtered to shortlisted files; empty state explains how to add candidates. Tab label shows a count badge when non-empty.

### 3. Suggested follow-ups

- New pure function in `app/components/follow-up-suggestions.tsx` (or a small `lib/`-style helper if it stays UI-free): given the `SourceRef[]` from the most recent assistant message, returns 0–2 suggestion objects (`{ label: string, action: "ask" | "open-directory", prompt?: string }`):
  - 0 distinct candidates → one suggestion, "Browse all candidates" (`open-directory`, switches the sidebar to the Candidates tab and opens it on mobile — does not send a chat message).
  - 1 distinct candidate → "Tell me more about {name}" (`ask`).
  - ≥2 distinct candidates → "Compare {first} and {second}" using the two highest-scoring distinct candidates (`ask`).
- Rendered only under the latest assistant message, as chip buttons matching the existing suggestion-button style.

### 4. New chat

- Header button, disabled/hidden when `messages.length === 0`. Calls `setMessages([])` from `useChat` (verified present on `UseChatHelpers` in the installed `@ai-sdk/react`). Shortlist state is untouched — it's a separate hook/storage key.

### Copy-answer button

- Small icon button on each assistant message bubble; copies that message's concatenated text parts via `navigator.clipboard.writeText`. Brief inline confirmation (e.g., label flips to "Copied" for ~1.5s), no toast system introduced.

## Component architecture

```
app/page.tsx                          Server Component — reads candidate
                                       directory, renders <ChatApp>

app/components/
  chat-app.tsx                        Client — owns useChat, shortlist hook,
                                       sidebar open/tab state; renders header,
                                       message list, input, sidebar
  chat-message.tsx                    One message bubble: markdown text,
                                       copy button, source chips (assistant only)
  source-chips.tsx                    Extended: adds shortlist toggle per chip
                                       (props: sources, isShortlisted, onToggle)
  follow-up-suggestions.tsx           Computes + renders 0-2 suggestion chips
  candidate-panel.tsx                 Tabbed sidebar: Candidates / Shortlist,
                                       search box, row list; responsive
                                       (persistent sidebar vs. drawer)

app/hooks/
  use-shortlist.ts                    localStorage-backed bookmark state

lib/
  candidates.ts                       Server-only: loadIndex() -> CandidateSummary[]
```

`chat-types.ts`'s `SourceRef`/`ChatMessage` types are unchanged — no backend/API changes in this redesign; `app/api/chat/route.ts` and `app/api/cvs/[file]/route.ts` are untouched.

## Error handling

Unchanged from the existing implementation (already reviewed/approved): `useChat`'s `error`/`clearError` drive the existing error-recovery behavior. The redesign restyles the error message display but doesn't change the retry logic. `localStorage` access in `use-shortlist.ts` is wrapped defensively (try/catch) since it can throw in restrictive browser contexts — falls back to in-memory-only state rather than crashing.

## Testing

- `lib/candidates.ts`: vitest coverage for the header-teaser parser — happy path (well-formed header), and the fallback-to-undefined path for a malformed/unexpected header string. Uses the same test-fixture style as the existing `lib/retrieval.ts` tests.
- `follow-up-suggestions.tsx`'s suggestion logic: if extracted as a pure function, vitest-covered for the three cases (0 / 1 / ≥2 distinct candidates). If it ends up trivial enough to inline in the component, this is covered by live verification instead — decided during implementation.
- Everything else (layout, responsiveness, drawer behavior, dark mode, the four features end-to-end): verified live against the dev server and a browser at desktop and mobile viewport widths, consistent with how the rest of this project was verified.

## Out of scope

- No changes to the RAG backend, retrieval logic, or system prompt.
- No manual light/dark toggle — follows `prefers-color-scheme`, matching the existing pattern.
- No server-side persistence of the shortlist (stays `localStorage`-only, single browser/device).
- No streaming markdown changes beyond what already exists (bold citations already work).
- No full terminal/TUI reinterpretation (Option B) — explicitly deferred by the user's choice of Option A.
