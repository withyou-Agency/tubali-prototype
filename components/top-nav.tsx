"use client";
import React, { useState, useRef, useEffect } from "react";
import { useStore } from "@/lib/store";
import { Avatar } from "./ui/avatar";
import { Bell, ChevronDown, Check } from "./ui/icons";
import { SOURCES } from "@/lib/data";

const PROJECTS = [
  { id: "p1", name: "Acme Corp" },
  { id: "p2", name: "Beta Labs" },
  { id: "p3", name: "Gamma Studio" },
  { id: "p4", name: "Delta Works" },
  { id: "p5", name: "Epsilon AI" },
];

function ProjectSwitcher() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("signal:project") || "p1";
    }
    return "p1";
  });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const currentProject = PROJECTS.find(p => p.id === current) || PROJECTS[0];

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "3px 6px",
          borderRadius: "var(--radius)",
          fontSize: "var(--fs-body)",
          fontWeight: 500,
          color: "var(--text)",
          background: "transparent",
        }}
        onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
      >
        {currentProject.name}
        <ChevronDown size={12} style={{ color: "var(--text-tertiary)" }} />
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            zIndex: 200,
            width: 180,
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-lg)",
            overflow: "hidden",
            animation: "fadeIn 0.1s ease",
          }}
        >
          {PROJECTS.map(p => (
            <button
              key={p.id}
              onClick={() => {
                setCurrent(p.id);
                localStorage.setItem("signal:project", p.id);
                setOpen(false);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                padding: "7px 10px",
                textAlign: "left",
                fontSize: "var(--fs-body)",
                color: "var(--text)",
                background: "transparent",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{ width: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {current === p.id && <Check size={12} style={{ color: "var(--accent)" }} />}
              </span>
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function TopNav() {
  const { route, setRoute, signals, wipItems, notes, transactions, appMode, setAppMode, resetClientVisit } = useStore();
  const isClient = appMode === "client";

  const newSignalsCount = signals.filter(s => s.status === "new").length;
  const wipCount = wipItems.filter(w => w.location !== "backlog" && w.column !== "done").length;
  const sourcesCount = notes.length;
  const historyCount = transactions.length;

  // In client mode, internal-only routes (Sources, History) are hidden.
  // The remaining tabs are exactly the read-only-safe pages.
  const allTabs: { id: "signals" | "wip" | "roadmap" | "sources" | "history"; label: string; count: number; teamOnly?: boolean }[] = [
    { id: "signals", label: "Signals", count: newSignalsCount },
    { id: "wip", label: "WIP", count: wipCount },
    { id: "roadmap", label: "Roadmap", count: 0, teamOnly: true },
    { id: "sources", label: "Sources", count: sourcesCount, teamOnly: true },
    { id: "history", label: "History", count: historyCount, teamOnly: true },
  ];
  const tabs = allTabs.filter(t => !(isClient && t.teamOnly));

  return (
    <header
      style={{
        height: 44,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg)",
        padding: "0 16px",
        gap: 0,
      }}
    >
      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 8 }}>
        <div style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          background: "var(--accent)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          <svg width={12} height={12} viewBox="0 0 12 12" fill="none">
            <circle cx="6" cy="6" r="4" stroke="white" strokeWidth={1.5} />
            <circle cx="6" cy="6" r="1.5" fill="white" />
          </svg>
        </div>
        <span style={{ fontWeight: 600, fontSize: 13.5, color: "var(--text)", letterSpacing: "-0.01em" }}>Signal</span>
      </div>

      {/* Separator */}
      <span style={{ width: 1, height: 16, background: "var(--border-strong)", margin: "0 10px" }} />

      {/* Project switcher */}
      <ProjectSwitcher />

      {/* Vertical divider */}
      <span style={{ width: 1, height: 16, background: "var(--border-strong)", margin: "0 12px" }} />

      {/* Tabs */}
      <nav style={{ display: "flex", alignItems: "center", gap: 2 }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setRoute(tab.id)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px",
              borderRadius: "var(--radius)",
              fontSize: "var(--fs-body)",
              fontWeight: route === tab.id ? 500 : 400,
              color: route === tab.id ? "var(--text)" : "var(--text-secondary)",
              background: route === tab.id ? "var(--bg-hover)" : "transparent",
              transition: "all 0.1s",
              height: 30,
            }}
            onMouseEnter={e => { if (route !== tab.id) e.currentTarget.style.background = "var(--bg-hover)"; }}
            onMouseLeave={e => { if (route !== tab.id) e.currentTarget.style.background = "transparent"; }}
          >
            {tab.label}
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 18,
                height: 16,
                padding: "0 4px",
                borderRadius: 100,
                background: route === tab.id ? "var(--bg)" : "var(--bg-sunken)",
                border: "1px solid var(--border)",
                fontSize: 11,
                fontWeight: 500,
                color: "var(--text-secondary)",
                fontFamily: "JetBrains Mono, ui-monospace, monospace",
              }}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </nav>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Read-only badge — only visible in client mode, sits left of the toggle */}
      {isClient && (
        <span
          style={{
            display: "inline-flex", alignItems: "center",
            marginRight: 8,
            background: "rgba(14,165,233,0.10)",
            border: "1px solid rgba(14,165,233,0.35)",
            color: "#0369a1",
            borderRadius: 100,
            overflow: "hidden",
            fontSize: 10.5, fontWeight: 500, letterSpacing: 0.2,
          }}
          title="You're viewing the read-only client experience"
        >
          <span style={{ padding: "2px 6px 2px 8px" }}>◔ Client View</span>
          {/* Demo helper — re-trigger the "first visit" highlights */}
          <button
            onClick={resetClientVisit}
            title="Reset to a first-time visit (re-highlight recent changes)"
            aria-label="Reset client visit"
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 18, height: 18,
              padding: 0, marginRight: 3,
              border: "none",
              borderLeft: "1px solid rgba(14,165,233,0.35)",
              background: "transparent",
              color: "#0369a1",
              cursor: "pointer",
              fontSize: 11,
              lineHeight: 1,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(14,165,233,0.18)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            ↻
          </button>
        </span>
      )}

      {/* Team / Client view toggle — temporary prototype switch */}
      <div
        role="group"
        aria-label="View mode"
        style={{
          display: "inline-flex",
          padding: 2,
          marginRight: 8,
          borderRadius: 100,
          background: "var(--bg-sunken)",
          border: "1px solid var(--border)",
        }}
      >
        {(["team", "client"] as const).map(m => {
          const active = appMode === m;
          return (
            <button
              key={m}
              onClick={() => setAppMode(m)}
              style={{
                padding: "2px 10px",
                borderRadius: 100,
                fontSize: 11,
                fontWeight: active ? 500 : 400,
                color: active ? "var(--text)" : "var(--text-tertiary)",
                background: active ? "var(--bg)" : "transparent",
                boxShadow: active ? "var(--shadow-sm)" : "none",
                border: "none",
                cursor: "pointer",
                textTransform: "capitalize",
                transition: "background 0.1s, color 0.1s",
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.color = "var(--text-secondary)"; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.color = "var(--text-tertiary)"; }}
            >
              {m}
            </button>
          );
        })}
      </div>

      {/* Theme toggle — sun/moon icon based on current theme */}
      <ThemeToggle />

      {/* Bell */}
      <button
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 28,
          height: 28,
          borderRadius: "var(--radius)",
          color: "var(--text-secondary)",
          marginRight: 4,
        }}
        onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
        title="Notifications"
      >
        <Bell size={15} />
      </button>

      {/* Avatar */}
      <Avatar userId="u1" size="md" />
    </header>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useStore();
  const isDark = theme === "dark";
  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label="Toggle theme"
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 28, height: 28,
        borderRadius: "var(--radius)",
        color: "var(--text-secondary)",
        marginRight: 4,
      }}
      onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
    >
      {isDark ? (
        // Sun glyph (we don't have an icon component for it; render inline SVG)
        <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        // Moon glyph
        <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}
