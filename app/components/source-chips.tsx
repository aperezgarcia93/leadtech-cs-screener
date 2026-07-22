import type { SourceRef } from "@/lib/chat-types";

export function SourceChips({ sources }: { sources: SourceRef[] }) {
  if (sources.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {sources.map(s => (
        <a
          key={`${s.file}#${s.section}`}
          href={`/api/cvs/${s.file}`}
          target="_blank"
          rel="noreferrer"
          title={`similarity ${s.score.toFixed(2)} — open PDF`}
          className="rounded-full border border-slate-300 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
        >
          {s.candidate} · {s.section}
        </a>
      ))}
    </div>
  );
}
