import { describe, expect, it } from "vitest";
import { renderCvHtml, TEMPLATE_COUNT } from "@/scripts/cv-template";
import type { Candidate } from "@/scripts/cv-schema";

const candidate: Candidate = {
  fullName: "Test Person", headline: "Engineer", email: "t@example.com",
  phone: "+34 600 000 000", location: "Barcelona, Spain", summary: "A summary.",
  experience: [{ role: "Dev", company: "Acme", period: "2020 – 2024", achievements: ["Did X", "Did Y"] }],
  education: [{ degree: "BSc CS", institution: "UPC", year: "2019" }],
  skills: ["Python", "SQL", "Docker", "AWS", "Git"],
  languages: [{ language: "English", level: "C1" }],
  photoPrompt: "headshot",
};

describe("renderCvHtml", () => {
  it("renders every template variant with all sections and heading markers", () => {
    for (let variant = 0; variant < TEMPLATE_COUNT; variant++) {
      const html = renderCvHtml(candidate, "data:image/svg+xml;base64,x", variant);
      for (const heading of ["SUMMARY", "EXPERIENCE", "EDUCATION", "SKILLS", "LANGUAGES"]) {
        expect(html).toContain(heading);
      }
      expect(html).toContain("Test Person");
      expect(html).toContain("UPC");
    }
  });

  it("escapes HTML in candidate data", () => {
    const html = renderCvHtml({ ...candidate, fullName: "<script>x</script>" }, "", 0);
    expect(html).not.toContain("<script>x</script>");
  });
});
