"use client";
import React from "react";

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  style?: React.CSSProperties;
}

export function Checkbox({ checked, onChange, style }: CheckboxProps) {
  return (
    <span
      role="checkbox"
      aria-checked={checked}
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.stopPropagation();
          onChange(!checked);
        }
      }}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 14,
        height: 14,
        borderRadius: 3,
        border: checked ? "1.5px solid var(--accent)" : "1.5px solid var(--border-strong)",
        background: checked ? "var(--accent)" : "transparent",
        flexShrink: 0,
        cursor: "pointer",
        transition: "all 0.1s",
        ...style,
      }}
    >
      {checked && (
        <svg width={9} height={9} viewBox="0 0 10 10" fill="none">
          <polyline points="1.5 5 4 7.5 8.5 2" stroke="white" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}
