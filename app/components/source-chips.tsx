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
      {grouped.map(g => {
        const shortlisted = isShortlisted(g.file);
        const tooltipId = `source-tooltip-${g.file}`;
        return (
          <span
            key={g.file}
            className="group/chip relative inline-flex items-center gap-1 rounded-full border border-hairline-strong bg-surface-soft py-0.5 pl-2.5 pr-1 text-xs text-mute"
          >
            <a
              href={`/api/cvs/${g.file}`}
              target="_blank"
              rel="noreferrer"
              aria-describedby={tooltipId}
              className="hover:text-ink"
            >
              {g.candidate}
            </a>
            <button
              type="button"
              onClick={() => onToggleShortlist(g.file)}
              title={shortlisted ? "Remove from shortlist" : "Add to shortlist"}
              aria-label={shortlisted ? "Remove from shortlist" : "Add to shortlist"}
              className="group/shortlist -m-2.5 flex h-9 w-9 items-center justify-center rounded-full"
            >
              <span
                className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${
                  shortlisted
                    ? "bg-accent text-accent-foreground"
                    : "bg-canvas text-mute group-hover/shortlist:text-ink"
                }`}
              >
                {shortlisted ? "✓" : "+"}
              </span>
            </button>
            <div
              id={tooltipId}
              role="tooltip"
              // pointer-events only turn on together with opacity (both gated on the same
              // hover/focus condition) — the tooltip sits outside the chip's own box
              // (bottom-full), so it must be part of the same hoverable region or moving the
              // cursor toward it drops out of group/chip:hover and the tooltip closes before
              // it can be reached. Staying pointer-events-none while hidden keeps it from
              // blocking clicks on whatever it visually overlaps when not shown.
              className="pointer-events-none absolute bottom-full left-0 z-10 mb-2 w-max max-w-56 rounded border border-hairline-strong bg-canvas px-2.5 py-1.5 text-xs text-ink opacity-0 shadow-sm transition-opacity group-hover/chip:pointer-events-auto group-hover/chip:opacity-100 group-focus-within/chip:pointer-events-auto group-focus-within/chip:opacity-100"
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
          </span>
        );
      })}
    </div>
  );
}
