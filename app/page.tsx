"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState } from "react";
import type { ChatMessage } from "@/lib/chat-types";
import { SourceChips } from "./components/source-chips";

const SUGGESTIONS = [
  "Who has experience with Python?",
  "Which candidate graduated from UPC?",
  "Compare the two strongest data engineers.",
];

export default function Page() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, error } = useChat<ChatMessage>({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });

  const submit = (text: string) => {
    if (text.trim() && status === "ready") {
      sendMessage({ text });
      setInput("");
    }
  };

  return (
    <main className="mx-auto flex h-dvh max-w-2xl flex-col p-4">
      <header className="border-b border-slate-200 pb-3 dark:border-slate-700">
        <h1 className="text-lg font-semibold">CV Screener</h1>
        <p className="text-sm text-slate-500">Ask questions about the 28 indexed CVs.</p>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto py-4">
        {messages.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map(s => (
              <button key={s} onClick={() => submit(s)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map(message => (
          <div key={message.id} className={message.role === "user" ? "text-right" : ""}>
            <div className={`inline-block max-w-[85%] whitespace-pre-wrap rounded-xl px-3.5 py-2 text-sm ${
              message.role === "user"
                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                : "bg-slate-100 dark:bg-slate-800"
            }`}>
              {message.parts.map((part, i) =>
                part.type === "text" ? <span key={i}>{part.text}</span> : null,
              )}
              {message.role === "assistant" &&
                message.parts.map((part, i) =>
                  part.type === "data-sources"
                    ? <SourceChips key={i} sources={part.data.sources} />
                    : null,
                )}
            </div>
          </div>
        ))}
        {status === "submitted" && <p className="text-sm text-slate-400">Searching CVs…</p>}
        {error && <p className="text-sm text-red-500">{error.message}</p>}
      </div>

      <form onSubmit={e => { e.preventDefault(); submit(input); }} className="flex gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="e.g. Who has worked in fintech?"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 dark:border-slate-600 dark:bg-slate-900"
        />
        <button type="submit" disabled={status !== "ready"}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900">
          Ask
        </button>
      </form>
    </main>
  );
}
