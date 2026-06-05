"use client";
import React from "react";
import { userById } from "@/lib/data";

interface AvatarProps {
  userId: string;
  size?: "sm" | "md" | "lg";
}

export function Avatar({ userId, size = "md" }: AvatarProps) {
  const user = userById(userId);
  const dim = size === "sm" ? 18 : size === "lg" ? 24 : 20;
  const fs = size === "sm" ? 9 : size === "lg" ? 11 : 10;
  return (
    <span
      title={user.name}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: dim,
        height: dim,
        borderRadius: "50%",
        background: user.color,
        fontSize: fs,
        fontWeight: 600,
        color: "#374151",
        flexShrink: 0,
        letterSpacing: "-0.02em",
      }}
    >
      {user.initials}
    </span>
  );
}
