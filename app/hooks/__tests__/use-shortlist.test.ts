import { afterEach, describe, expect, it, vi } from "vitest";
import { readStoredShortlist, writeStoredShortlist } from "@/app/hooks/use-shortlist";

function mockLocalStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readStoredShortlist", () => {
  it("returns an empty array when window is undefined (SSR)", () => {
    expect(readStoredShortlist()).toEqual([]);
  });

  it("reads a previously stored array of files", () => {
    vi.stubGlobal("window", {
      localStorage: mockLocalStorage({
        "cv-screener:shortlist": JSON.stringify(["a.pdf", "b.pdf"]),
      }),
    });
    expect(readStoredShortlist()).toEqual(["a.pdf", "b.pdf"]);
  });

  it("returns an empty array for malformed JSON instead of throwing", () => {
    vi.stubGlobal("window", {
      localStorage: mockLocalStorage({ "cv-screener:shortlist": "{not json" }),
    });
    expect(readStoredShortlist()).toEqual([]);
  });

  it("returns an empty array when the stored value isn't an array of strings", () => {
    vi.stubGlobal("window", {
      localStorage: mockLocalStorage({
        "cv-screener:shortlist": JSON.stringify({ not: "an array" }),
      }),
    });
    expect(readStoredShortlist()).toEqual([]);
  });
});

describe("writeStoredShortlist", () => {
  it("persists the given file list under the storage key", () => {
    const storage = mockLocalStorage();
    vi.stubGlobal("window", { localStorage: storage });
    writeStoredShortlist(["x.pdf"]);
    expect(storage.getItem("cv-screener:shortlist")).toBe(JSON.stringify(["x.pdf"]));
  });
});
