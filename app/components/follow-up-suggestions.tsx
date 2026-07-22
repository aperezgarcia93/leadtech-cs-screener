import type { SourceRef } from "@/lib/chat-types";

export interface FollowUpSuggestion {
  label: string;
  action: "ask" | "open-directory";
  prompt?: string;
}

export function getFollowUpSuggestions(sources: SourceRef[]): FollowUpSuggestion[] {
  const bestScoreByCandidate = new Map<string, number>();
  for (const s of sources) {
    const prev = bestScoreByCandidate.get(s.candidate);
    if (prev === undefined || s.score > prev) {
      bestScoreByCandidate.set(s.candidate, s.score);
    }
  }
  const distinctNames = [...bestScoreByCandidate.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);

  if (distinctNames.length === 0) {
    return [{ label: "Browse all candidates", action: "open-directory" }];
  }
  if (distinctNames.length === 1) {
    const name = distinctNames[0];
    return [
      { label: `Tell me more about ${name}`, action: "ask", prompt: `Tell me more about ${name}.` },
    ];
  }
  const [first, second] = distinctNames;
  return [
    {
      label: `Compare ${first} and ${second}`,
      action: "ask",
      prompt: `Compare ${first} and ${second}.`,
    },
  ];
}

interface FollowUpSuggestionsProps {
  sources: SourceRef[];
  onAsk: (prompt: string) => void;
  onOpenDirectory: () => void;
}

export function FollowUpSuggestions({ sources, onAsk, onOpenDirectory }: FollowUpSuggestionsProps) {
  const suggestions = getFollowUpSuggestions(sources);
  return (
    <div className="flex flex-wrap gap-2">
      {suggestions.map(s => (
        <button
          key={s.label}
          type="button"
          onClick={() => (s.action === "ask" ? onAsk(s.prompt ?? s.label) : onOpenDirectory())}
          className="rounded border border-accent/40 bg-accent/5 px-3 py-1.5 text-sm text-accent hover:bg-accent/10"
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
