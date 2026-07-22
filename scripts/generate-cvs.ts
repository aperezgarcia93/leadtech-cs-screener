import "dotenv/config"; // tsx does not auto-load .env.local
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { generateText, generateImage, Output } from "ai";
import { openrouter, CHAT_MODEL, IMAGE_MODEL } from "@/lib/openrouter";
import { batchSchema, generationPrompt, type Candidate } from "./cv-schema";
import { renderCvHtml, TEMPLATE_COUNT } from "./cv-template";

const TOTAL = 28;
const BATCH_SIZE = 7; // small batches keep JSON generation reliable
const OUT_DIR = path.join(process.cwd(), "data", "cvs");

const kebab = (name: string) =>
  name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-");

async function generateBatch(count: number, existingNames: string[], attempt = 1): Promise<Candidate[]> {
  try {
    const result = await generateText({
      model: openrouter(CHAT_MODEL),
      output: Output.object({ schema: batchSchema }),
      prompt: generationPrompt(count, existingNames),
    });
    return result.output.candidates;
  } catch (error) {
    if (attempt >= 3) throw error;
    console.warn(`Batch attempt ${attempt} failed (${String(error)}); retrying...`);
    return generateBatch(count, existingNames, attempt + 1);
  }
}

function initialsAvatar(name: string): string {
  const initials = name.split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="240" height="240" fill="#334155"/><text x="120" y="150" font-family="sans-serif" font-size="88" fill="#fff" text-anchor="middle">${initials}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

async function generatePhoto(candidate: Candidate): Promise<string> {
  try {
    const { image } = await generateImage({
      model: openrouter.imageModel(IMAGE_MODEL),
      prompt: `Professional CV headshot photo: ${candidate.photoPrompt}. Photorealistic, plain light background, business attire.`,
    });
    return `data:${image.mediaType};base64,${image.base64}`;
  } catch (error) {
    console.warn(`Photo failed for ${candidate.fullName}, using avatar: ${String(error)}`);
    return initialsAvatar(candidate.fullName);
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const candidates: Candidate[] = [];
  while (candidates.length < TOTAL) {
    const batch = await generateBatch(
      Math.min(BATCH_SIZE, TOTAL - candidates.length),
      candidates.map(c => c.fullName),
    );
    candidates.push(...batch);
    console.log(`Generated ${candidates.length}/${TOTAL} profiles`);
  }

  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const [i, candidate] of candidates.slice(0, TOTAL).entries()) {
    const photo = await generatePhoto(candidate);
    const html = renderCvHtml(candidate, photo, i % TEMPLATE_COUNT);
    await page.setContent(html, { waitUntil: "networkidle" });
    const file = path.join(OUT_DIR, `${kebab(candidate.fullName)}.pdf`);
    await page.pdf({ path: file, format: "A4", printBackground: true });
    console.log(`  [${i + 1}/${TOTAL}] ${file}`);
  }
  await browser.close();
  await writeFile(path.join(OUT_DIR, ".gitkeep"), "");
  console.log("Done.");
}

main().catch(error => { console.error(error); process.exit(1); });
