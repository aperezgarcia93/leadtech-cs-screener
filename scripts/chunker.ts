import type { IndexedChunk } from "@/lib/retrieval";

const HEADINGS = ["SUMMARY", "EXPERIENCE", "EDUCATION", "SKILLS", "LANGUAGES"] as const;

const titleCase = (s: string) => s[0] + s.slice(1).toLowerCase();

/**
 * Splits extracted CV text on the uppercase section headings emitted by the
 * PDF templates. Each chunk's text is prefixed with "<candidate> — <section>:"
 * so its embedding carries the candidate's identity.
 */
export function chunkCvText(
  text: string,
  candidate: string,
  file: string,
): Omit<IndexedChunk, "vector">[] {
  // Match headings as whole words, either at the start of a line or preceded by whitespace
  const pattern = new RegExp(`(?:^|\\s)(${HEADINGS.join("|")})(?=\\s|$)`, "g");
  const chunks: Omit<IndexedChunk, "vector">[] = [];
  let currentSection = "Header";
  let lastEndIndex = 0;
  let index = 0;

  const matches = Array.from(text.matchAll(pattern));

  for (const match of matches) {
    const body = text.slice(lastEndIndex, match.index).trim();
    if (body.length > 0) {
      chunks.push({
        id: `${file}#${index++}`,
        candidate,
        section: currentSection,
        file,
        text: `${candidate} — ${currentSection}: ${body}`,
      });
    }
    currentSection = titleCase(match[1]);
    lastEndIndex = match.index + match[0].length;
  }

  // Handle remaining text after the last heading
  const finalBody = text.slice(lastEndIndex).trim();
  if (finalBody.length > 0) {
    chunks.push({
      id: `${file}#${index++}`,
      candidate,
      section: currentSection,
      file,
      text: `${candidate} — ${currentSection}: ${finalBody}`,
    });
  }

  return chunks;
}
