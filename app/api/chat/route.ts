import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
} from "ai";
import { getLocalEmbedder } from "@/lib/embeddings";
import { loadIndex, rankChunks } from "@/lib/retrieval";
import { openrouter, CHAT_MODEL } from "@/lib/openrouter";
import type { ChatMessage, SourceRef } from "@/lib/chat-types";

export const maxDuration = 60;

const TOP_K = 8;
const MIN_SCORE = 0.25; // below this, retrieval found nothing relevant

const systemPrompt = (context: string) => `You are a CV screening assistant. Answer the recruiter's question using ONLY the CV excerpts below.
Rules:
- If the excerpts do not contain the answer, say plainly that the CVs don't mention it. Never invent facts.
- Cite candidates inline by name in **bold** when you use their CV.
- Be concise and recruiter-friendly; use short lists when comparing candidates.

CV excerpts:
${context}`;

export async function POST(req: Request) {
  const { messages }: { messages: ChatMessage[] } = await req.json();

  const lastUser = messages.findLast(m => m.role === "user");
  const query = lastUser?.parts.filter(p => p.type === "text").map(p => p.text).join("\n") ?? "";

  const [queryVector] = await getLocalEmbedder().embed([query]);
  const retrieved = rankChunks(queryVector, loadIndex(), TOP_K);
  const relevant = retrieved.filter(c => c.score >= MIN_SCORE);

  // Deduplicate sources per candidate+section for the UI, keeping the
  // highest-scoring chunk for each key. `relevant` is sorted descending by
  // score, so only the first occurrence of a key should be kept — a plain
  // `new Map(array)` would keep the LAST (lowest-scoring) occurrence instead.
  const sourceMap = new Map<string, SourceRef>();
  for (const c of relevant) {
    const key = `${c.file}#${c.section}`;
    if (!sourceMap.has(key)) {
      sourceMap.set(key, { candidate: c.candidate, section: c.section, file: c.file, score: c.score });
    }
  }
  const sources: SourceRef[] = [...sourceMap.values()];

  const context = relevant.map(c => c.text).join("\n\n---\n\n")
    || "No relevant CV excerpts were found for this question.";

  const stream = createUIMessageStream<ChatMessage>({
    execute: async ({ writer }) => {
      writer.write({ type: "data-sources", id: "sources", data: { sources } });
      const result = streamText({
        model: openrouter(CHAT_MODEL),
        system: systemPrompt(context),
        messages: await convertToModelMessages(messages),
      });
      writer.merge(result.toUIMessageStream());
    },
    onError: error =>
      error instanceof Error && error.message.includes("429")
        ? "The free model is rate-limited right now — wait a few seconds and try again."
        : `Something went wrong talking to the model: ${error instanceof Error ? error.message : "unknown error"}`,
  });

  return createUIMessageStreamResponse({ stream });
}
