"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/chat-types";

const STORAGE_KEY = "cv-screener:conversations";
const MAX_CONVERSATIONS = 50;
const TITLE_MAX_LENGTH = 40;

export interface StoredConversation {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMessage[];
}

function isStoredConversation(value: unknown): value is StoredConversation {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.title === "string" &&
    typeof v.updatedAt === "number" &&
    Array.isArray(v.messages)
  );
}

export function readStoredConversations(): StoredConversation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isStoredConversation) : [];
  } catch {
    return [];
  }
}

export function writeStoredConversations(conversations: StoredConversation[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  } catch {
    // localStorage unavailable (private mode, quota exceeded, etc.) — no-op
  }
}

export function deriveTitle(firstUserMessageText: string): string {
  const trimmed = firstUserMessageText.trim();
  if (trimmed.length <= TITLE_MAX_LENGTH) return trimmed || "New conversation";
  return `${trimmed.slice(0, TITLE_MAX_LENGTH).trimEnd()}…`;
}

/** Keeps the MAX_CONVERSATIONS most-recently-updated conversations. */
export function pruneConversations(conversations: StoredConversation[]): StoredConversation[] {
  return [...conversations]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_CONVERSATIONS);
}

function generateConversationId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `conv-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export interface UseConversationsResult {
  conversations: StoredConversation[];
  activeConversationId: string;
  startNewConversation: () => void;
  saveConversation: (id: string, messages: ChatMessage[]) => void;
  switchToConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
}

export function useConversations(): UseConversationsResult {
  const initRef = useRef(false);
  const [conversations, setConversations] = useState<StoredConversation[]>([]);
  // useId() is stable between server render and initial client render, unlike
  // crypto.randomUUID() — starting the active conversation on a random id
  // generated separately on each side would be a real hydration mismatch.
  // Every conversation id generated AFTER mount (startNewConversation,
  // deleteConversation's fallback) uses generateConversationId() instead,
  // since those only ever run from client-side event handlers.
  const initialId = useId();
  const [activeConversationId, setActiveConversationId] = useState<string>(initialId);

  useEffect(() => {
    if (!initRef.current) {
      initRef.current = true;
      setConversations(pruneConversations(readStoredConversations()));
    }
  }, []);

  const startNewConversation = useCallback(() => {
    setActiveConversationId(generateConversationId());
  }, []);

  const saveConversation = useCallback((id: string, messages: ChatMessage[]) => {
    if (messages.length === 0) return;
    setConversations(prev => {
      const existing = prev.find(c => c.id === id);
      const firstUserText =
        messages
          .find(m => m.role === "user")
          ?.parts.filter(p => p.type === "text")
          .map(p => p.text)
          .join("") ?? "";
      const title = existing?.title ?? deriveTitle(firstUserText);
      const updated: StoredConversation = { id, title, updatedAt: Date.now(), messages };
      const next = pruneConversations([updated, ...prev.filter(c => c.id !== id)]);
      writeStoredConversations(next);
      return next;
    });
  }, []);

  const switchToConversation = useCallback((id: string) => {
    setActiveConversationId(id);
  }, []);

  const deleteConversation = useCallback((id: string) => {
    setConversations(prev => {
      const next = prev.filter(c => c.id !== id);
      writeStoredConversations(next);
      return next;
    });
    setActiveConversationId(current => (current === id ? generateConversationId() : current));
  }, []);

  return {
    conversations,
    activeConversationId,
    startNewConversation,
    saveConversation,
    switchToConversation,
    deleteConversation,
  };
}
