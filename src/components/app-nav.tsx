"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BookOpen,
  ClipboardPlus,
  Database,
  HeartPulse,
  PersonStanding,
  Radiation,
} from "lucide-react";

const NAV = [
  { href: "/", label: "Overview", icon: Activity },
  { href: "/crew", label: "Crew Monitor", icon: HeartPulse },
  { href: "/body", label: "Body Map", icon: PersonStanding },
  { href: "/check-in", label: "Check-in", icon: ClipboardPlus },
  { href: "/radiation", label: "Radiation", icon: Radiation },
  { href: "/research", label: "NASA Data", icon: Database },
  { href: "/guidance", label: "Guidance", icon: BookOpen },
] as const;

export function AppNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="sticky top-0 z-20 flex shrink-0 md:self-start items-center gap-1 overflow-x-auto border-b border-border bg-surface/90 px-3 py-2 backdrop-blur md:h-screen md:w-56 md:flex-col md:items-stretch md:gap-1 md:border-b-0 md:border-r md:px-3 md:py-5"
    >
      <Link
        href="/"
        className="mr-2 flex items-center gap-2 px-2 font-semibold tracking-wide md:mb-6 md:mr-0"
      >
        <span className="relative inline-flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 text-accent">
          <Activity size={16} aria-hidden />
        </span>
        <span>
          DEMIFY
          <span className="hidden text-[10px] font-normal tracking-normal text-muted md:block">
            Astronaut Health Monitor
          </span>
        </span>
      </Link>
      {NAV.map(({ href, label, icon: Icon }) => {
        const active =
          href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
              active
                ? "bg-accent/15 text-accent"
                : "text-muted hover:bg-surface-2 hover:text-fg"
            }`}
          >
            <Icon size={16} aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
