import { afterEach, describe, expect, it, vi } from "vitest";
import { readStoredTheme, resolveInitialTheme, writeStoredTheme } from "@/app/hooks/use-theme";

function mockLocalStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
}

function mockMatchMedia(matches: boolean) {
  return (query: string) => ({ media: query, matches });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readStoredTheme", () => {
  it("returns null when window is undefined (SSR)", () => {
    expect(readStoredTheme()).toBeNull();
  });

  it("reads a previously stored theme", () => {
    vi.stubGlobal("window", {
      localStorage: mockLocalStorage({ "cv-screener:theme": "dark" }),
    });
    expect(readStoredTheme()).toBe("dark");
  });

  it("returns null for an unexpected stored value instead of throwing", () => {
    vi.stubGlobal("window", {
      localStorage: mockLocalStorage({ "cv-screener:theme": "sepia" }),
    });
    expect(readStoredTheme()).toBeNull();
  });
});

describe("writeStoredTheme", () => {
  it("persists the given theme under the storage key", () => {
    const storage = mockLocalStorage();
    vi.stubGlobal("window", { localStorage: storage });
    writeStoredTheme("dark");
    expect(storage.getItem("cv-screener:theme")).toBe("dark");
  });
});

describe("resolveInitialTheme", () => {
  it("returns 'light' when window is undefined (SSR)", () => {
    expect(resolveInitialTheme()).toBe("light");
  });

  it("prefers a stored theme over the OS preference", () => {
    vi.stubGlobal("window", {
      localStorage: mockLocalStorage({ "cv-screener:theme": "dark" }),
      matchMedia: mockMatchMedia(false),
    });
    expect(resolveInitialTheme()).toBe("dark");
  });

  it("falls back to the OS dark preference when nothing is stored", () => {
    vi.stubGlobal("window", {
      localStorage: mockLocalStorage(),
      matchMedia: mockMatchMedia(true),
    });
    expect(resolveInitialTheme()).toBe("dark");
  });

  it("falls back to light when nothing is stored and the OS prefers light", () => {
    vi.stubGlobal("window", {
      localStorage: mockLocalStorage(),
      matchMedia: mockMatchMedia(false),
    });
    expect(resolveInitialTheme()).toBe("light");
  });

  it("falls back to light when matchMedia throws", () => {
    vi.stubGlobal("window", {
      localStorage: mockLocalStorage(),
      matchMedia: () => {
        throw new Error("not supported");
      },
    });
    expect(resolveInitialTheme()).toBe("light");
  });
});
