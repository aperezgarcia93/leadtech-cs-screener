"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "cv-screener:shortlist";

export function readStoredShortlist(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string")
      : [];
  } catch {
    return [];
  }
}

export function writeStoredShortlist(files: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(files));
  } catch {
    // localStorage unavailable (private mode, quota exceeded, etc.) — no-op
  }
}

export interface UseShortlistResult {
  shortlisted: Set<string>;
  isShortlisted: (file: string) => boolean;
  toggle: (file: string) => void;
}

export function useShortlist(): UseShortlistResult {
  const initRef = useRef(false);
  const [shortlisted, setShortlisted] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!initRef.current) {
      initRef.current = true;
      setShortlisted(new Set(readStoredShortlist()));
    }
  }, []);

  const toggle = useCallback((file: string) => {
    setShortlisted(prev => {
      const next = new Set(prev);
      if (next.has(file)) {
        next.delete(file);
      } else {
        next.add(file);
      }
      writeStoredShortlist([...next]);
      return next;
    });
  }, []);

  const isShortlisted = useCallback((file: string) => shortlisted.has(file), [shortlisted]);

  return { shortlisted, isShortlisted, toggle };
}
