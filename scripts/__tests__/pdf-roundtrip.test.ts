import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { chromium, type Browser } from "playwright";
import { extractText, getDocumentProxy } from "unpdf";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { renderCvHtml, TEMPLATE_COUNT } from "@/scripts/cv-template";
import type { Candidate } from "@/scripts/cv-schema";

// Downstream chunking splits PDF-extracted text on exactly these literal
// uppercase strings, so every template variant must reproduce them verbatim
// in Chromium's PDF text layer — not as individually-spaced glyphs (e.g.
// "E D U C A T I O N") caused by letter-spacing or column row-sharing.
const REQUIRED_HEADINGS = ["SUMMARY", "EXPERIENCE", "EDUCATION", "SKILLS", "LANGUAGES"];

const candidate: Candidate = {
  fullName: "Ingrid Sørensen",
  headline: "Principal Data Engineer",
  email: "ingrid.sorensen@example.com",
  phone: "+45 20 12 34 56",
  location: "Copenhagen, Denmark",
  summary:
    "Data engineering leader with 12+ years building large-scale pipelines across Python, Spark, and cloud platforms.",
  experience: [
    {
      role: "Principal Data Engineer",
      company: "Nordic Analytics",
      period: "2020 – Present",
      achievements: [
        "Led migration of batch pipelines to a streaming architecture, cutting latency by 80%.",
        "Mentored a team of six engineers across two countries.",
      ],
    },
    {
      role: "Senior Data Engineer",
      company: "Baltic Systems",
      period: "2016 – 2020",
      achievements: [
        "Built the company's first data warehouse from scratch.",
        "Automated reporting pipelines, saving 20 hours/week of manual work.",
      ],
    },
  ],
  education: [
    { degree: "MSc Computer Science", institution: "University of Copenhagen", year: "2014" },
    { degree: "BSc Software Engineering", institution: "DTU", year: "2012" },
  ],
  skills: ["Python", "Spark", "SQL", "Airflow", "AWS", "Docker", "Kubernetes"],
  languages: [
    { language: "Danish", level: "Native" },
    { language: "English", level: "C2" },
    { language: "German", level: "B1" },
  ],
  photoPrompt: "headshot",
};

// A 1x1 transparent PNG avoids any network fetch for the photo.
const PHOTO_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

describe("PDF round-trip: heading extraction", () => {
  let browser: Browser;
  let tmpDir: string;

  beforeAll(async () => {
    browser = await chromium.launch();
    tmpDir = await mkdtemp(path.join(tmpdir(), "cv-pdf-roundtrip-"));
  });

  afterAll(async () => {
    await browser.close();
    await rm(tmpDir, { recursive: true, force: true });
  });

  for (let variant = 0; variant < TEMPLATE_COUNT; variant++) {
    it(
      `variant ${variant} preserves all five literal headings through PDF text extraction`,
      async () => {
        const html = renderCvHtml(candidate, PHOTO_DATA_URI, variant);

        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: "networkidle" });
        const pdfPath = path.join(tmpDir, `variant-${variant}.pdf`);
        await page.pdf({ path: pdfPath, format: "A4", printBackground: true });
        await page.close();

        const buffer = await readFile(pdfPath);
        const pdf = await getDocumentProxy(new Uint8Array(buffer));
        const { text } = await extractText(pdf, { mergePages: true });

        for (const heading of REQUIRED_HEADINGS) {
          expect(text, `variant ${variant} missing literal heading "${heading}"`).toContain(heading);
        }
      },
      60_000,
    );
  }
});
