"use client";
import React from "react";
import { SignalStatus } from "@/lib/data";

interface DotProps {
  status: SignalStatus;
}

export function StatusDot({ status }: DotProps) {
  const bg =
    status === "new"      ? "var(--status-new)"      :
    status === "accepted" ? "var(--status-accepted)" :
    status === "ready"    ? "var(--status-ready)"    :
    status === "skipped"  ? "var(--status-skipped)"  :
    status === "closed"   ? "var(--text-disabled)"   :
    "var(--status-rejected)";
  // Per-status shape tweaks so users can tell them apart without colour:
  //   • Ready → rounded square with a halo (it's a distinct moment)
  //   • Skipped → hollow ring (deferred / paused feel)
  //   • Everything else → solid dot
  const isReady   = status === "ready";
  const isSkipped = status === "skipped";
  return (
    <span
      style={{
        display: "inline-block",
        width: isReady || isSkipped ? 8 : 7,
        height: isReady || isSkipped ? 8 : 7,
        borderRadius: isReady ? 2 : 999,
        background: isSkipped ? "transparent" : bg,
        border: isSkipped ? `1.5px solid ${"var(--status-skipped)"}` : undefined,
        boxShadow: isReady ? "0 0 0 1.5px rgba(13,148,136,0.25)" : undefined,
        flexShrink: 0,
      }}
    />
  );
}
