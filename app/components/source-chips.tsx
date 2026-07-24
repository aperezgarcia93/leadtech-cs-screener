"use client";

import { useEffect, useRef, useState } from "react";
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

// Retrieval hands the model every chunk above the relevance threshold — often more candidates
// than actually end up in the answer. The system prompt instructs the model to bold a
// candidate's name specifically when it cites their CV, so a **bold** span is a reliable
// "actually used" signal, distinct from a name merely mentioned in passing (e.g. "unlike Marc
// Serra, ..."). Falls back to returning every source unfiltered if the answer has no bolded
// names at all, rather than risk hiding every chip when the model simply forgot to bold.
export function filterCitedSources(sources: SourceRef[], text: string): SourceRef[] {
  const bolded = [...text.matchAll(/\*\*(.+?)\*\*/g)].map(m => m[1].toLowerCase());
  if (bolded.length === 0) return sources;
  return sources.filter(s => {
    const name = s.candidate.toLowerCase();
    return bolded.some(b => b.includes(name) || name.includes(b));
  });
}

const CLOSE_DELAY_MS = 200;

interface SourceChipProps {
  source: GroupedSource;
  shortlisted: boolean;
  onToggleShortlist: (file: string) => void;
}

// A CSS-only :hover chain (trigger -> group-hover on a floating descendant) turned out to be
// too fragile for this exact "move from the chip up into the tooltip" path: browsers don't
// guarantee hit-testing on every intermediate pixel of a mouse move, so a fast or slightly
// off-axis movement can lose :hover for a single frame and snap the tooltip shut before the
// cursor arrives — reproduced directly against this component. A short JS-driven close delay
// (the standard "hover intent" pattern real UI libraries use for floating panels) is the
// robust fix: closing is scheduled on mouseleave/blur and cancelled if the cursor (or focus)
// lands back on the trigger OR the tooltip within the grace window, so the two don't need to
// touch pixel-for-pixel the way a pure-CSS chain does.
function SourceChip({ source: g, shortlisted, onToggleShortlist }: SourceChipProps) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipId = `source-tooltip-${g.file}`;

  const cancelClose = () => {
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const show = () => {
    cancelClose();
    setOpen(true);
  };
  const scheduleHide = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  };

  useEffect(() => () => cancelClose(), []);

  return (
    <span
      className="relative inline-flex items-center gap-1 rounded-full border border-hairline-strong bg-surface-soft py-0.5 pl-2.5 pr-1 text-xs text-mute"
      onMouseEnter={show}
      onMouseLeave={scheduleHide}
    >
      <a
        href={`/api/cvs/${g.file}`}
        target="_blank"
        rel="noreferrer"
        aria-describedby={tooltipId}
        onFocus={show}
        onBlur={scheduleHide}
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
      {open && (
        <div
          id={tooltipId}
          role="tooltip"
          onMouseEnter={show}
          onMouseLeave={scheduleHide}
          className="absolute bottom-full left-0 z-10 mb-2 w-max max-w-56 rounded border border-hairline-strong bg-canvas px-2.5 py-1.5 text-xs text-ink shadow-sm"
        >
          <p className="font-semibold">{g.candidate}</p>
          <p className="text-mute">Matched in: {g.sections.join(", ")}</p>
          <a
            href={`/api/cvs/${g.file}`}
            target="_blank"
            rel="noreferrer"
            className="mt-1 block text-accent hover:underline"
          >
            View PDF →
          </a>
        </div>
      )}
    </span>
  );
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
      {grouped.map(g => (
        <SourceChip
          key={g.file}
          source={g}
          shortlisted={isShortlisted(g.file)}
          onToggleShortlist={onToggleShortlist}
        />
      ))}
    </div>
  );
}
