"use client";

import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

const CYCLE = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const index = Math.max(0, CYCLE.findIndex((option) => option.value === theme));
  const current = CYCLE[index];
  const next = CYCLE[(index + 1) % CYCLE.length];
  const Icon = current.icon;

  return (
    <button
      type="button"
      onClick={() => setTheme(next.value)}
      // The stored theme is unknown on the server, so the icon and labels stay out
      // of the first render and appear once mounted. Otherwise the markup mismatches.
      title={mounted ? `Theme: ${current.label} - switch to ${next.label}` : "Theme"}
      aria-label={mounted ? `Theme: ${current.label}. Switch to ${next.label}` : "Theme"}
      className="grid size-8 cursor-pointer place-items-center rounded-full border border-line-soft bg-surface text-muted transition-colors hover:text-ink"
    >
      {mounted ? <Icon size={15} strokeWidth={2.25} /> : <span className="size-[15px]" />}
    </button>
  );
}
