import { describe, expect, it } from "vitest";
import { parseHeaderTeaser } from "@/lib/candidates";

describe("parseHeaderTeaser", () => {
  it("extracts title and location from a well-formed header", () => {
    const text =
      "Aisha Karim — Header: Aisha Karim Software Engineer (Principal) aisha.karim@example.com · +31 6 12345678 · Amsterdam, Netherlands";
    expect(parseHeaderTeaser("Aisha Karim", text)).toBe(
      "Software Engineer (Principal) · Amsterdam, Netherlands",
    );
  });

  it("matches the name even when the header preserves diacritics the filename-derived candidate name doesn't have", () => {
    const text =
      "Carlos Mendez — Header: Carlos Méndez Senior Software Engineer carlos.mendez@example.com · +49 30 1234 5678 · Berlin, Germany";
    expect(parseHeaderTeaser("Carlos Mendez", text)).toBe(
      "Senior Software Engineer · Berlin, Germany",
    );
  });

  it("skips leading stray content (e.g. a mis-chunked date range) before the name", () => {
    const text =
      "Antoine Dubois — Header: Mar 2021 – Present Jun 2018 – Feb 2021 Antoine Dubois Senior UX/UI Designer antoine.dubois@example.com · +33 1 23 45 67 89 · Paris, France";
    expect(parseHeaderTeaser("Antoine Dubois", text)).toBe(
      "Senior UX/UI Designer · Paris, France",
    );
  });

  it("returns undefined when the header text doesn't match the expected format", () => {
    expect(
      parseHeaderTeaser("Jane Doe", "Jane Doe — Header: something unexpected"),
    ).toBeUndefined();
  });

  it("returns undefined when the candidate name can't be found in the body", () => {
    const text =
      "Jane Doe — Header: Someone Else Engineer jane@example.com · 555-1234 · Nowhere";
    expect(parseHeaderTeaser("Jane Doe", text)).toBeUndefined();
  });
});
