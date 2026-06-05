"use client";
import React from "react";

interface KbdProps {
  children: React.ReactNode;
}

export function Kbd({ children }: KbdProps) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 16,
        height: 16,
        padding: "0 4px",
        background: "#f4f4f5",
        border: "1px solid var(--border)",
        borderRadius: 3,
        fontFamily: "JetBrains Mono, ui-monospace, monospace",
        fontSize: 10,
        color: "var(--text-tertiary)",
      }}
    >
      {children}
    </span>
  );
}
