"use client";
import React from "react";

interface SegmentOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

interface SegmentedProps {
  value: string;
  onChange: (v: string) => void;
  options: SegmentOption[];
}

export function Segmented({ value, onChange, options }: SegmentedProps) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        background: "var(--bg-sunken)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: 2,
        gap: 1,
      }}
    >
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "3px 8px",
            borderRadius: "var(--radius-sm)",
            fontSize: "var(--fs-meta)",
            fontWeight: 500,
            color: value === opt.value ? "var(--text)" : "var(--text-secondary)",
            background: value === opt.value ? "var(--bg)" : "transparent",
            boxShadow: value === opt.value ? "var(--shadow-sm)" : "none",
            border: value === opt.value ? "1px solid var(--border)" : "1px solid transparent",
            transition: "all 0.1s",
          }}
        >
          {opt.icon}
          {opt.label}
        </button>
      ))}
    </span>
  );
}
