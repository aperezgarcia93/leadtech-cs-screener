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
  it("returns 'dark' when window is undefined (SSR)", () => {
    expect(resolveInitialTheme()).toBe("dark");
  });

  it("prefers a stored theme over the default", () => {
    vi.stubGlobal("window", {
      localStorage: mockLocalStorage({ "cv-screener:theme": "light" }),
    });
    expect(resolveInitialTheme()).toBe("light");
  });

  it("defaults to dark when nothing is stored", () => {
    vi.stubGlobal("window", { localStorage: mockLocalStorage() });
    expect(resolveInitialTheme()).toBe("dark");
  });

  it("defaults to dark when the stored value is malformed", () => {
    vi.stubGlobal("window", {
      localStorage: mockLocalStorage({ "cv-screener:theme": "sepia" }),
    });
    expect(resolveInitialTheme()).toBe("dark");
  });
});
