import type { Metadata } from "next";
import "./globals.css";
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
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col md:flex-row">
        <AppNav />
        <main className="flex-1 min-w-0 px-4 py-6 md:px-8 md:py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
