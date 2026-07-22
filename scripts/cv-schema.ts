import { z } from "zod";

export const candidateSchema = z.object({
  fullName: z.string(),
  headline: z.string(), // e.g. "Senior Data Engineer"
  email: z.string(),
  phone: z.string(),
  location: z.string(),
  summary: z.string(),
  experience: z.array(z.object({
    role: z.string(),
    company: z.string(),
    period: z.string(), // e.g. "2019 – 2023"
    achievements: z.array(z.string()).min(2).max(4),
  })).min(1).max(4),
  education: z.array(z.object({
    degree: z.string(),
    institution: z.string(),
    year: z.string(),
  })).min(1).max(2),
  skills: z.array(z.string()).min(5).max(14),
  languages: z.array(z.object({ language: z.string(), level: z.string() })).min(1).max(4),
  photoPrompt: z.string(), // headshot description for the image model
});

export type Candidate = z.infer<typeof candidateSchema>;

export const batchSchema = z.object({ candidates: z.array(candidateSchema) });

export function generationPrompt(count: number, existingNames: string[]): string {
  return `Generate ${count} realistic but entirely fictional CV profiles for a recruiting demo.

Diversity requirements across the batch:
- Mix of roles: software engineering, data, design, marketing, finance, operations.
- Mix of seniority (junior to principal), nationalities, and locations (mostly Europe).
- CV language: mostly English; make 2 of them in Spanish.
- At least one candidate educated at "Universitat Politècnica de Catalunya (UPC)".
- Several candidates with Python experience; several with none.
- Realistic fictional companies; emails as firstname.lastname@example.com.
- photoPrompt: one sentence describing a neutral professional headshot matching the person (age range, presentation), photorealistic, plain background.
${existingNames.length > 0 ? `- Do NOT reuse these names: ${existingNames.join(", ")}.` : ""}`;
}
