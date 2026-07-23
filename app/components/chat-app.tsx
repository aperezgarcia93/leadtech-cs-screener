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
