"use client";
import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, Check, X } from "./icons";

interface FilterPopoverProps {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (v: string) => void;
  onClear: () => void;
  active?: boolean;
  activeLabel?: string;
  width?: number;
}

export function FilterPopover({ label, options, selected, onToggle, onClear, active, activeLabel, width = 180 }: FilterPopoverProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "3px 8px",
          height: 28,
          borderRadius: "var(--radius)",
          border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
          background: active ? "var(--accent-soft)" : "var(--bg)",
          fontSize: "var(--fs-meta)",
          color: active ? "var(--accent)" : "var(--text-secondary)",
          fontWeight: active ? 500 : 400,
          whiteSpace: "nowrap",
        }}
      >
        {active && activeLabel ? activeLabel : label}
        {active && (
          <span
            onClick={(e) => { e.stopPropagation(); onClear(); }}
            style={{ display: "flex", alignItems: "center", marginLeft: 2 }}
          >
            <X size={10} />
          </span>
        )}
        {!active && <ChevronDown size={12} />}
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 100,
            width,
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-lg)",
            overflow: "hidden",
            animation: "fadeIn 0.1s ease",
          }}
        >
          {options.map(opt => (
            <button
              key={opt.value}
              onClick={() => onToggle(opt.value)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                padding: "6px 10px",
                textAlign: "left",
                fontSize: "var(--fs-body)",
                color: "var(--text)",
                background: "transparent",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{ width: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {selected.includes(opt.value) && <Check size={12} style={{ color: "var(--accent)" }} />}
              </span>
              {opt.label}
            </button>
          ))}
          {selected.length > 0 && (
            <div style={{ borderTop: "1px solid var(--border)", padding: "4px 6px" }}>
              <button
                onClick={() => { onClear(); setOpen(false); }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  width: "100%",
                  padding: "4px 6px",
                  fontSize: "var(--fs-meta)",
                  color: "var(--text-tertiary)",
                  borderRadius: "var(--radius-sm)",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <X size={10} /> Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
