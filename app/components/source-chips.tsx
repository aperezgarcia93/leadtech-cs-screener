import type { SourceRef } from "@/lib/chat-types";

interface SourceChipsProps {
  sources: SourceRef[];
  isShortlisted: (file: string) => boolean;
  onToggleShortlist: (file: string) => void;
}

export function SourceChips({ sources, isShortlisted, onToggleShortlist }: SourceChipsProps) {
  if (sources.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {sources.map(s => {
        const shortlisted = isShortlisted(s.file);
        return (
          <span
            key={`${s.file}#${s.section}`}
            className="inline-flex items-center gap-1 rounded-full border border-hairline-strong bg-surface-soft py-0.5 pl-2.5 pr-1 text-xs text-mute"
          >
            <a
              href={`/api/cvs/${s.file}`}
              target="_blank"
              rel="noreferrer"
              title={`similarity ${s.score.toFixed(2)} — open PDF`}
              className="hover:text-ink"
            >
              {s.candidate} · {s.section}
            </a>
            <button
              type="button"
              onClick={() => onToggleShortlist(s.file)}
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
          </span>
        );
      })}
    </div>
  );
}
