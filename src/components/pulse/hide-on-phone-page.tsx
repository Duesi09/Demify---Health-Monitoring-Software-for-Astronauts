"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * Leaves out its children on the phone pulse page (/pulse): no navigation,
 * no alarm bar and no alarm sound on the demo phone, and no extra polling.
 * /pulse/connect (on the laptop) keeps everything.
 */
export function HideOnPhonePage({ children }: { children: ReactNode }) {
  return usePathname() === "/pulse" ? null : children;
}
