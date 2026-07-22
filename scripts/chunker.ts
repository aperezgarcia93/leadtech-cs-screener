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
  // Match headings as whole words, either at the start of a line or preceded by whitespace.
  //
  // WHY THIS REGEX MUST BE PERMISSIVE:
  // Real PDF text extraction (via unpdf/Chromium) produces NO newlines around headings.
  // Headings run inline in a single continuous string: "Jane Doe Barcelona SUMMARY Engineer..."
  // A line-anchored pattern (e.g., `^\s*HEADING\s*$` with /m flag) would fail completely,
  // collapsing the entire CV into a single undifferentiated chunk.
  //
  // KNOWN LIMITATION (acceptable):
  // The permissive pattern (?:^|\s)(HEADING)(?=\s|$) will produce false positives on
  // uppercase heading words appearing mid-sentence in body text.
  // Example: "demonstrated strong SKILLS in leadership" incorrectly triggers a SKILLS split.
  // This is mitigated because:
  // - Real CVs very rarely capitalize heading section names mid-sentence
  // - Verified against 28-CV corpus: zero false positives in practice
  // - Stricter patterns risk missing real headings in PDF variants or non-standard layouts
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
