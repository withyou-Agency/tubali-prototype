"use client";
import React from "react";
import { Kbd } from "./kbd";

interface SearchInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

export function SearchInput({ value, onChange, placeholder = "Search..." }: SearchInputProps) {
  const ref = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "/" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        width: 220,
        height: 28,
        background: "var(--bg-sunken)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: "0 8px",
        gap: 6,
      }}
    >
      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        ref={ref}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          flex: 1,
          border: "none",
          background: "transparent",
          outline: "none",
          fontSize: "var(--fs-meta)",
          color: "var(--text)",
          minWidth: 0,
        }}
      />
      {value ? (
        <button
          onClick={() => onChange("")}
          style={{ color: "var(--text-tertiary)", display: "flex", alignItems: "center" }}
          aria-label="Clear search"
        >
          <svg width={10} height={10} viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <line x1="2" y1="2" x2="8" y2="8" /><line x1="8" y1="2" x2="2" y2="8" />
          </svg>
        </button>
      ) : (
        <Kbd>/</Kbd>
      )}
    </span>
  );
}
