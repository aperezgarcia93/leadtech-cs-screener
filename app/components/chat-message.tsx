"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import type { ChatMessage } from "@/lib/chat-types";
import { filterCitedSources, SourceChips } from "./source-chips";

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
  const sources = filterCitedSources(sourcesPart?.data.sources ?? [], text);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — no confirmation shown, non-fatal
    }
  };

  // The API route writes the sources part before the text stream starts, so an assistant
  // message can briefly exist with no text yet — the typing indicator covers that state,
  // this bubble shouldn't render an empty box alongside it.
  if (!isUser && text.length === 0) return null;

  return (
    <div className={isUser ? "text-right" : ""}>
      <div
        className={`relative inline-block max-w-[85%] break-words rounded px-3.5 py-2 text-sm ${
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
            aria-label={copied ? "Message copied" : "Copy message"}
            className="group absolute -top-5 right-2 flex h-9 items-center justify-center px-1"
          >
            <span className="rounded border border-hairline-strong bg-canvas px-1.5 py-0.5 text-[10px] text-mute group-hover:text-ink">
              {copied ? "Copied" : "Copy"}
            </span>
          </button>
        )}

        {!isUser && text.length > 0 && (
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
