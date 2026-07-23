import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deriveTitle,
  pruneConversations,
  readStoredConversations,
  writeStoredConversations,
  type StoredConversation,
} from "@/app/hooks/use-conversations";

function mockLocalStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
}

const conversation = (id: string, updatedAt: number): StoredConversation => ({
  id,
  title: `Conversation ${id}`,
  updatedAt,
  messages: [],
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readStoredConversations", () => {
  it("returns an empty array when window is undefined (SSR)", () => {
    expect(readStoredConversations()).toEqual([]);
  });

  it("reads a previously stored array of conversations", () => {
    const stored = [conversation("a", 1000)];
    vi.stubGlobal("window", {
      localStorage: mockLocalStorage({ "cv-screener:conversations": JSON.stringify(stored) }),
    });
    expect(readStoredConversations()).toEqual(stored);
  });

  it("returns an empty array for malformed JSON instead of throwing", () => {
    vi.stubGlobal("window", {
      localStorage: mockLocalStorage({ "cv-screener:conversations": "{not json" }),
    });
    expect(readStoredConversations()).toEqual([]);
  });

  it("filters out entries that don't match the StoredConversation shape", () => {
    vi.stubGlobal("window", {
      localStorage: mockLocalStorage({
        "cv-screener:conversations": JSON.stringify([
          conversation("valid", 1000),
          { id: "missing-fields" },
          "not an object",
        ]),
      }),
    });
    expect(readStoredConversations()).toEqual([conversation("valid", 1000)]);
  });
});

describe("writeStoredConversations", () => {
  it("persists the given conversation list under the storage key", () => {
    const storage = mockLocalStorage();
    vi.stubGlobal("window", { localStorage: storage });
    const stored = [conversation("a", 1000)];
    writeStoredConversations(stored);
    expect(storage.getItem("cv-screener:conversations")).toBe(JSON.stringify(stored));
  });
});

describe("deriveTitle", () => {
  it("returns the trimmed text as-is when at or under 40 characters", () => {
    expect(deriveTitle("Who has Python experience?")).toBe("Who has Python experience?");
  });

  it("truncates to 40 characters with an ellipsis when longer", () => {
    const long = "Which candidate has the most experience with distributed systems and Kubernetes?";
    const result = deriveTitle(long);
    expect(result).toBe("Which candidate has the most experience…");
    expect(result.length).toBe(40);
  });

  it("falls back to a default title for empty/whitespace-only input", () => {
    expect(deriveTitle("   ")).toBe("New conversation");
  });

  it("caps output at exactly 40 characters for non-whitespace-boundary input", () => {
    const repeated = "A".repeat(50);
    const result = deriveTitle(repeated);
    expect(result).toBe("A".repeat(39) + "…");
    expect(result.length).toBe(40);
  });
});

describe("pruneConversations", () => {
  it("keeps all conversations when under the cap", () => {
    const list = [conversation("a", 1000), conversation("b", 2000)];
    expect(pruneConversations(list)).toHaveLength(2);
  });

  it("keeps only the 50 most-recently-updated conversations, dropping the oldest", () => {
    const list = Array.from({ length: 55 }, (_, i) => conversation(`c${i}`, i));
    const pruned = pruneConversations(list);
    expect(pruned).toHaveLength(50);
    expect(pruned[0].id).toBe("c54");
    expect(pruned.some(c => c.id === "c4")).toBe(false);
    expect(pruned.some(c => c.id === "c5")).toBe(true);
  });
});
