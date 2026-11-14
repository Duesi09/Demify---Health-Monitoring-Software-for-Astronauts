"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  Activity,
  BookOpen,
  CircleHelp,
  ClipboardPlus,
  Database,
  HeartPulse,
  PersonStanding,
  Radiation,
  type LucideIcon,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/**
 * Navigation grouped by task: watch the crew, enter your own values, check
 * the environment, look things up. Group headings show on desktop only; on
 * phones the links stay one horizontally scrolling row with a hairline
 * between groups.
 */
const NAV: { id: string; title: string; items: NavItem[] }[] = [
  {
    id: "monitor",
    title: "Monitor",
    items: [
      { href: "/", label: "Overview", icon: Activity },
      { href: "/crew", label: "Crew monitor", icon: HeartPulse },
      { href: "/body", label: "Body map", icon: PersonStanding },
    ],
  },
  {
    id: "self-check",
    title: "Self-check",
    items: [{ href: "/check-in", label: "Check-in", icon: ClipboardPlus }],
  },
  {
    id: "environment",
    title: "Environment",
    items: [{ href: "/radiation", label: "Radiation", icon: Radiation }],
  },
  {
    id: "reference",
    title: "Reference",
    items: [
      { href: "/research", label: "NASA data", icon: Database },
      { href: "/guidance", label: "Guidance", icon: BookOpen },
      { href: "/help", label: "Help", icon: CircleHelp },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function AppNav() {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);

  // Phones: the nav is one horizontal row; bring the current page's link into view.
  useEffect(() => {
    const el = navRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!el || window.matchMedia("(min-width: 768px)").matches) return;
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [pathname]);
  return (
    <nav
      ref={navRef}
      aria-label="Main"
      className="sticky top-0 z-20 flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-surface/90 px-3 py-2 backdrop-blur md:h-screen md:w-56 md:flex-col md:items-stretch md:gap-0 md:self-start md:overflow-y-auto md:border-b-0 md:border-r md:px-3 md:py-5"
    >
      <Link
        href="/"
        className="mr-2 flex shrink-0 items-center gap-2 px-2 font-semibold tracking-wide md:mb-5 md:mr-0"
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
      {NAV.map((group, gi) => (
        <div
          key={group.id}
          role="group"
          aria-labelledby={`nav-group-${group.id}`}
          className={`flex shrink-0 items-center gap-1 md:flex-col md:items-stretch ${
            gi > 0 ? "border-l border-border pl-1 md:mt-4 md:border-l-0 md:pl-0" : ""
          }`}
        >
          <span
            id={`nav-group-${group.id}`}
            className="hidden px-3 pb-1 text-xs font-medium text-muted md:block"
          >
            {group.title}
          </span>
          {group.items.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                  active ? "bg-accent/15 text-accent" : "text-muted hover:bg-surface-2 hover:text-fg"
                }`}
              >
                <Icon size={16} aria-hidden />
                {label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
