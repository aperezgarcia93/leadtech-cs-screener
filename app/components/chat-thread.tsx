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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- submit's setInput call is a deliberate response to the pendingPrompt bridge from the parent, not an accidental derived-state update
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
