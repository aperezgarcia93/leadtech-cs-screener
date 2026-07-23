"use client";

import { useCallback, useState } from "react";
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

  const handleMessagesChange = useCallback(
    (messages: ChatMessage[]) => {
      conversations.saveConversation(conversations.activeConversationId, messages);
    },
    [conversations.activeConversationId, conversations.saveConversation],
  );

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
          onMessagesChange={handleMessagesChange}
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
