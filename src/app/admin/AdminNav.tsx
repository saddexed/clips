"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, History, ListVideo, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/admin", label: "Manage", icon: ListVideo },
  { href: "/admin/tasks", label: "Queue", icon: Activity },
  { href: "/admin/history", label: "History", icon: History },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin" className="flex items-center gap-1 overflow-x-auto">
      {LINKS.map(({ href, label, icon: Icon }) => {
        const active = href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-2 rounded-full px-3 text-sm font-medium transition-colors",
              active ? "bg-chip text-chip-ink dark:bg-line dark:text-ink" : "text-muted hover:text-ink",
            )}
          >
            <Icon size={15} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
