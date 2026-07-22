import { loadIndex, type IndexedChunk } from "@/lib/retrieval";

export interface CandidateSummary {
  name: string;
  file: string;
  teaser: string | undefined;
}

function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Extracts a "<Title> · <Location>" teaser from a candidate's raw Header
 * chunk text. Returns undefined rather than a garbled string whenever the
 * header doesn't match the expected shape (e.g. mis-chunked content
 * leaking in ahead of the name — a known, tested limitation of the
 * chunker's heading regex, see scripts/chunker.ts).
 */
export function parseHeaderTeaser(candidate: string, headerText: string): string | undefined {
  const prefix = `${candidate} — Header: `;
  if (!headerText.startsWith(prefix)) return undefined;
  const body = headerText.slice(prefix.length);

  const parts = body.split(" · ");
  if (parts.length < 2) return undefined;
  const location = parts[parts.length - 1].trim();
  if (!location) return undefined;

  const beforePhone = parts[0];
  const emailMatch = beforePhone.match(/\S+@\S+\.\S+/);
  if (!emailMatch || emailMatch.index === undefined) return undefined;
  const beforeEmail = beforePhone.slice(0, emailMatch.index).trim();

  const words = beforeEmail.split(/\s+/).filter(Boolean);
  const candWords = candidate.toLowerCase().split(/\s+/).filter(Boolean);
  const normWords = words.map(w => stripDiacritics(w).toLowerCase());

  let nameEnd = -1;
  for (let i = 0; i <= normWords.length - candWords.length; i++) {
    if (candWords.every((cw, j) => normWords[i + j] === cw)) {
      nameEnd = i + candWords.length;
      break;
    }
  }
  if (nameEnd === -1) return undefined;

  const title = words.slice(nameEnd).join(" ").trim();
  if (!title) return undefined;

  return `${title} · ${location}`;
}

export function getCandidateDirectory(): CandidateSummary[] {
  const chunks = loadIndex();
  const headerByFile = new Map<string, IndexedChunk>();
  for (const chunk of chunks) {
    if (chunk.section === "Header" && !headerByFile.has(chunk.file)) {
      headerByFile.set(chunk.file, chunk);
    }
  }
  return [...headerByFile.values()]
    .map(chunk => ({
      name: chunk.candidate,
      file: chunk.file,
      teaser: parseHeaderTeaser(chunk.candidate, chunk.text),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
