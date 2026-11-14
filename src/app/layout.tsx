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

export const metadata: Metadata = {
  title: {
    default: "Demify · Astronaut Health Monitor",
    template: "%s · Demify",
  },
  description:
    "Self-assessment health monitoring for astronauts on long-duration missions, built on NASA OSDR and NOAA SWPC data.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-theme="light" className="h-full antialiased">
      <body className="min-h-full flex flex-col md:flex-row">
        <AppNav />
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Global patient-monitor alarms: sticky bar above the page content, beside the nav on desktop. */}
          <AlarmCenter />
          <main className="flex-1 min-w-0 px-4 py-6 md:px-8 md:py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
