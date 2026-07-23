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
