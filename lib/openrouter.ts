import { createOpenRouter } from "@openrouter/ai-sdk-provider";

if (!process.env.OPENROUTER_API_KEY) {
  throw new Error("OPENROUTER_API_KEY is not set. Copy .env.example to .env.local and add your key.");
}

export const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });

export const CHAT_MODEL =
  process.env.OPENROUTER_CHAT_MODEL ?? "nvidia/nemotron-3-super-120b-a12b:free";

export const IMAGE_MODEL =
  process.env.OPENROUTER_IMAGE_MODEL ?? "google/gemini-3.1-flash-image";
