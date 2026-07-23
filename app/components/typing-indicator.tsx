export function TypingIndicator() {
  return (
    <div className="inline-block max-w-[85%] rounded border border-hairline bg-surface-soft px-3.5 py-2.5">
      <div className="flex items-center gap-1">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-mute [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-mute [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-mute" />
      </div>
    </div>
  );
}
