import type { UIMessage } from "ai";

export type SourceRef = { candidate: string; section: string; file: string; score: number };

export type ChatMessage = UIMessage<never, { sources: { sources: SourceRef[] } }>;
