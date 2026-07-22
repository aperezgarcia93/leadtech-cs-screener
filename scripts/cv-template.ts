import type { Candidate } from "./cv-schema";

export const TEMPLATE_COUNT = 3;

/** Shared HTML escaper applied to every candidate field before interpolation. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const PAGE_CSS = `@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }`;

/** Returns the individually rendered section blocks so each variant can lay them out differently. */
function buildSections(candidate: Candidate) {
  const experience = candidate.experience
    .map(
      (job) => `
      <div class="job">
        <div class="job-head">
          <span class="job-role">${esc(job.role)}</span> &mdash; <span class="job-company">${esc(job.company)}</span>
          <span class="job-period">${esc(job.period)}</span>
        </div>
        <ul>
          ${job.achievements.map((a) => `<li>${esc(a)}</li>`).join("")}
        </ul>
      </div>`,
    )
    .join("");

  const education = candidate.education
    .map(
      (edu) => `
      <div class="edu">
        <div class="edu-degree">${esc(edu.degree)}</div>
        <div class="edu-meta">${esc(edu.institution)} &middot; ${esc(edu.year)}</div>
      </div>`,
    )
    .join("");

  const skills = candidate.skills.map((s) => `<span class="skill">${esc(s)}</span>`).join("");

  const languages = candidate.languages
    .map((l) => `<li>${esc(l.language)} &mdash; ${esc(l.level)}</li>`)
    .join("");

  return { experience, education, skills, languages };
}

/** Variant 0: classic serif, single column. */
function renderClassic(candidate: Candidate, photoDataUri: string): string {
  const { experience, education, skills, languages } = buildSections(candidate);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${PAGE_CSS}
body { font-family: Georgia, "Times New Roman", serif; color: #1f2933; }
.page { padding: 36px 44px; }
.header { display: flex; align-items: center; gap: 20px; border-bottom: 2px solid #1f2933; padding-bottom: 16px; margin-bottom: 20px; }
.photo { width: 96px; height: 96px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
.name { font-size: 26px; font-weight: bold; margin: 0; }
.headline { font-size: 15px; color: #52606d; margin: 2px 0 8px; }
.contact { font-size: 11px; color: #52606d; }
h2 { font-size: 13px; letter-spacing: 1.5px; border-bottom: 1px solid #cbd2d9; padding-bottom: 4px; margin: 18px 0 8px; }
.job-head { font-size: 13px; font-weight: bold; margin-bottom: 2px; }
.job-period { float: right; font-weight: normal; color: #52606d; }
ul { margin: 4px 0 10px 18px; padding: 0; font-size: 12px; }
.edu-degree { font-size: 13px; font-weight: bold; }
.edu-meta { font-size: 11px; color: #52606d; margin-bottom: 8px; }
.skill { display: inline-block; border: 1px solid #cbd2d9; border-radius: 3px; padding: 2px 8px; margin: 2px 4px 2px 0; font-size: 11px; }
.languages { margin: 4px 0 0 18px; padding: 0; font-size: 12px; }
p.summary { font-size: 12px; line-height: 1.5; }
</style></head><body>
<div class="page">
  <div class="header">
    <img class="photo" src="${photoDataUri}" alt="">
    <div>
      <p class="name">${esc(candidate.fullName)}</p>
      <p class="headline">${esc(candidate.headline)}</p>
      <p class="contact">${esc(candidate.email)} &middot; ${esc(candidate.phone)} &middot; ${esc(candidate.location)}</p>
    </div>
  </div>
  <h2>SUMMARY</h2>
  <p class="summary">${esc(candidate.summary)}</p>
  <h2>EXPERIENCE</h2>
  ${experience}
  <h2>EDUCATION</h2>
  ${education}
  <h2>SKILLS</h2>
  <div>${skills}</div>
  <h2>LANGUAGES</h2>
  <ul class="languages">${languages}</ul>
</div>
</body></html>`;
}

/** Variant 1: modern sans with a colored sidebar for contact/skills/languages. */
function renderSidebar(candidate: Candidate, photoDataUri: string): string {
  const { experience, education, skills, languages } = buildSections(candidate);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${PAGE_CSS}
body { font-family: Arial, Helvetica, sans-serif; color: #102a43; }
.page { display: flex; min-height: 297mm; }
.sidebar { width: 34%; background: #10456b; color: #f0f4f8; padding: 32px 20px; }
.photo { width: 110px; height: 110px; border-radius: 50%; object-fit: cover; display: block; margin: 0 auto 16px; border: 3px solid #f0f4f8; }
.sidebar h2 { font-size: 12px; letter-spacing: 1.5px; border-bottom: 1px solid #4a90c4; padding-bottom: 4px; margin: 20px 0 8px; color: #bcccdc; }
.sidebar .contact { font-size: 11px; line-height: 1.8; }
.sidebar .skill { display: block; font-size: 11px; padding: 3px 0; }
.sidebar .languages { list-style: none; padding: 0; margin: 0; font-size: 11px; line-height: 1.8; }
.main { width: 66%; padding: 32px 28px; }
.name { font-size: 24px; font-weight: bold; margin: 0; }
.headline { font-size: 14px; color: #486581; margin: 2px 0 16px; }
.main h2 { font-size: 13px; letter-spacing: 1.5px; color: #10456b; border-bottom: 2px solid #10456b; padding-bottom: 4px; margin: 16px 0 8px; }
.job-head { font-size: 13px; font-weight: bold; margin-bottom: 2px; }
.job-period { float: right; font-weight: normal; color: #627d98; }
ul { margin: 4px 0 10px 18px; padding: 0; font-size: 12px; }
.edu-degree { font-size: 13px; font-weight: bold; }
.edu-meta { font-size: 11px; color: #627d98; margin-bottom: 8px; }
p.summary { font-size: 12px; line-height: 1.5; }
</style></head><body>
<div class="page">
  <div class="sidebar">
    <img class="photo" src="${photoDataUri}" alt="">
    <h2>LANGUAGES</h2>
    <ul class="languages">${languages}</ul>
    <h2>SKILLS</h2>
    <div>${skills}</div>
    <h2>CONTACT</h2>
    <div class="contact">${esc(candidate.email)}<br>${esc(candidate.phone)}<br>${esc(candidate.location)}</div>
  </div>
  <div class="main">
    <p class="name">${esc(candidate.fullName)}</p>
    <p class="headline">${esc(candidate.headline)}</p>
    <h2>SUMMARY</h2>
    <p class="summary">${esc(candidate.summary)}</p>
    <h2>EXPERIENCE</h2>
    ${experience}
    <h2>EDUCATION</h2>
    ${education}
  </div>
</div>
</body></html>`;
}

/** Variant 2: minimal two-column layout with a thin rule instead of a filled sidebar. */
function renderMinimalTwoColumn(candidate: Candidate, photoDataUri: string): string {
  const { experience, education, skills, languages } = buildSections(candidate);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${PAGE_CSS}
body { font-family: "Helvetica Neue", Arial, sans-serif; color: #202124; }
.page { padding: 40px 40px 40px 40px; }
.header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
.photo { width: 88px; height: 88px; border-radius: 50%; object-fit: cover; }
.name { font-size: 25px; font-weight: 300; margin: 0; }
.headline { font-size: 14px; color: #5f6368; margin: 4px 0; }
.contact { font-size: 10px; color: #5f6368; }
.columns { display: flex; gap: 32px; }
.left { width: 62%; }
.right { width: 38%; border-left: 1px solid #dadce0; padding-left: 24px; }
h2 { font-size: 12px; letter-spacing: 2px; color: #5f6368; margin: 0 0 8px; }
.job-head { font-size: 13px; font-weight: 600; margin-bottom: 2px; }
.job-period { display: block; font-weight: normal; color: #5f6368; font-size: 10.5px; }
ul { margin: 4px 0 14px 16px; padding: 0; font-size: 11.5px; }
.edu-degree { font-size: 12.5px; font-weight: 600; }
.edu-meta { font-size: 10.5px; color: #5f6368; margin-bottom: 10px; }
.skill { display: inline-block; background: #f1f3f4; border-radius: 3px; padding: 2px 7px; margin: 2px 4px 2px 0; font-size: 10.5px; }
.languages { list-style: none; padding: 0; margin: 0 0 16px; font-size: 11.5px; line-height: 1.7; }
p.summary { font-size: 11.5px; line-height: 1.6; margin-bottom: 16px; }
section { margin-bottom: 18px; }
</style></head><body>
<div class="page">
  <div class="header">
    <div>
      <p class="name">${esc(candidate.fullName)}</p>
      <p class="headline">${esc(candidate.headline)}</p>
      <p class="contact">${esc(candidate.email)} &middot; ${esc(candidate.phone)} &middot; ${esc(candidate.location)}</p>
    </div>
    <img class="photo" src="${photoDataUri}" alt="">
  </div>
  <div class="columns">
    <div class="left">
      <section>
        <h2>SUMMARY</h2>
        <p class="summary">${esc(candidate.summary)}</p>
      </section>
      <section>
        <h2>EXPERIENCE</h2>
        ${experience}
      </section>
    </div>
    <div class="right">
      <section>
        <h2>EDUCATION</h2>
        ${education}
      </section>
      <section>
        <h2>SKILLS</h2>
        <div>${skills}</div>
      </section>
      <section>
        <h2>LANGUAGES</h2>
        <ul class="languages">${languages}</ul>
      </section>
    </div>
  </div>
</div>
</body></html>`;
}

const RENDERERS: Array<(candidate: Candidate, photoDataUri: string) => string> = [
  renderClassic,
  renderSidebar,
  renderMinimalTwoColumn,
];

export function renderCvHtml(candidate: Candidate, photoDataUri: string, variant: number): string {
  const renderer = RENDERERS[((variant % TEMPLATE_COUNT) + TEMPLATE_COUNT) % TEMPLATE_COUNT];
  return renderer(candidate, photoDataUri);
}
