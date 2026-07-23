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
