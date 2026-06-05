"use client";
import React from "react";

interface LabelChipProps {
  label: string;
  onRemove?: () => void;
}

export function LabelChip({ label, onRemove }: LabelChipProps) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
        padding: "1px 5px",
        background: "var(--bg-sunken)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
        fontSize: "var(--fs-meta)",
        color: "var(--text-secondary)",
        whiteSpace: "nowrap",
        lineHeight: 1.4,
      }}
    >
      <span style={{ color: "var(--text-tertiary)" }}>#</span>
      {label}
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            marginLeft: 2,
            width: 12,
            height: 12,
            color: "var(--text-tertiary)",
            borderRadius: 2,
          }}
          aria-label={`Remove ${label}`}
        >
          <svg width={8} height={8} viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <line x1="2" y1="2" x2="8" y2="8" />
            <line x1="8" y1="2" x2="2" y2="8" />
          </svg>
        </button>
      )}
    </span>
  );
}
