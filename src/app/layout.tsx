import type { Metadata } from "next";
// IBM Plex, bundled with the app (no font CDN at runtime: works offline on board).
import "@fontsource/ibm-plex-sans/latin-200.css";
import "@fontsource/ibm-plex-sans/latin-300.css";
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-sans/latin-700.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "./globals.css";
import { AlarmCenter } from "@/components/alarms/alarm-center";
import { AppNav } from "@/components/app-nav";
import { GroundLinkBanner } from "@/components/onboard/ground-link-indicators";
import { HideOnPhonePage } from "@/components/pulse/hide-on-phone-page";
import { ATTRIBUTION, DISCLAIMER_LONG, DISCLAIMER_SHORT } from "@/lib/disclaimer";

export const metadata: Metadata = {
  title: {
    default: "Demify · Astronaut Health Monitor",
    template: "%s · Demify",
  },
  description: `Research and training software for analog and simulated space missions, with public NASA OSDR and NOAA SWPC data. ${DISCLAIMER_SHORT}`,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-theme="light" className="h-full antialiased">
      <body className="min-h-full flex flex-col md:flex-row">
        <HideOnPhonePage>
          <AppNav />
        </HideOnPhonePage>
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Global patient-monitor alarms: sticky bar above the page content, beside the nav on desktop. */}
          <HideOnPhonePage>
            <AlarmCenter />
          </HideOnPhonePage>
          {/* Shown only while the ground link is down (simulated blackout); nothing otherwise. */}
          <GroundLinkBanner />
          <main className="flex-1 min-w-0 px-4 py-6 md:px-8 md:py-8">{children}</main>
          <footer className="border-t border-border px-4 py-5 text-[11.5px] leading-relaxed text-muted md:px-8">
            <div className="max-w-4xl space-y-1.5">
              <p>{DISCLAIMER_LONG}</p>
              <p>{ATTRIBUTION}</p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
