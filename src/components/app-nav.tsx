"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Activity,
  BookOpen,
  CircleHelp,
  ClipboardPlus,
  Database,
  HeartPulse,
  LibraryBig,
  MessageSquareText,
  PersonStanding,
  Radiation,
  type LucideIcon,
} from "lucide-react";
import { GroundLinkChip } from "@/components/onboard/ground-link-indicators";
import { parseLinkParam, withLink, type LinkProfileId } from "@/lib/link";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/**
 * Navigation grouped by task: watch the crew, enter your own values, check
 * the environment, ask the onboard server, look things up. Group headings
 * show on desktop only; on phones the links stay one horizontally scrolling
 * row with a hairline between groups.
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
    id: "onboard",
    title: "Onboard server",
    items: [
      { href: "/assistant", label: "Assistant", icon: MessageSquareText },
      { href: "/library", label: "Library", icon: LibraryBig },
    ],
  },
  {
    id: "reference",
    title: "Reference",
    items: [
      { href: "/research", label: "Open data (NASA OSDR)", icon: Database },
      { href: "/guidance", label: "Guidance", icon: BookOpen },
      { href: "/help", label: "Help", icon: CircleHelp },
    ],
  },
];

/** A trailing parenthetical (the data source, e.g. "(NASA OSDR)") is set smaller so the label stays on one line. */
function NavLabel({ label }: { label: string }) {
  const m = /^(.+?)\s+(\(.+\))$/.exec(label);
  if (!m) return label;
  return (
    <span className="whitespace-nowrap">
      {m[1]} <span className="text-[12px]">{m[2]}</span>
    </span>
  );
}

/** The accent darkened a quarter towards the text colour: above 4.5:1 on the active item's tint (plain accent is 3.6:1). */
const ACTIVE_TEXT = "text-[color:color-mix(in_srgb,var(--accent)_75%,var(--fg))]";

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Every nav link keeps the page's signal delay profile (?link=), so a
 * chosen profile (e.g. the conjunction blackout) stays on while moving
 * between pages. useSearchParams sits under Suspense: a prerendered page
 * gets the plain links in its HTML and the profile once it hydrates.
 */
export function AppNav() {
  return (
    <Suspense fallback={<NavBar link={null} />}>
      <NavBarWithLink />
    </Suspense>
  );
}

function NavBarWithLink() {
  const link = parseLinkParam(useSearchParams().get("link"));
  return <NavBar link={link} />;
}

function NavBar({ link }: { link: LinkProfileId | null }) {
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
        href={withLink("/", link)}
        aria-label="Demify Health Monitoring, overview"
        className="mr-2 flex shrink-0 items-center rounded-md px-1 focus-visible:outline-2 focus-visible:outline-accent md:mb-5 md:mr-0 md:mt-1 md:justify-center md:px-2"
      >
        {/* Phones: compact mark in the top bar. Desktop: full logo with wordmark. */}
        <Image src="/brand/demify-mark.png" alt="" width={32} height={32} priority unoptimized className="h-8 w-8 md:hidden" />
        <Image
          src="/brand/demify-logo.png"
          alt=""
          width={640}
          height={979}
          priority
          unoptimized
          className="hidden h-auto w-[100px] md:block"
        />
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
                href={withLink(href, link)}
                aria-current={active ? "page" : undefined}
                className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                  active ? `bg-accent/15 ${ACTIVE_TEXT}` : "text-muted hover:bg-surface-2 hover:text-fg"
                }`}
              >
                <Icon size={16} aria-hidden />
                <NavLabel label={label} />
              </Link>
            );
          })}
        </div>
      ))}
      {/* Ground link (simulated blackout switch, conjunction profile, air-gapped); hidden until GET /api/ground-link answers. */}
      <GroundLinkChip
        link={link}
        className="ml-1 border-l border-border pl-2 md:mt-auto md:ml-0 md:border-l-0 md:px-3 md:pb-1 md:pl-3 md:pt-4"
      />
    </nav>
  );
}
