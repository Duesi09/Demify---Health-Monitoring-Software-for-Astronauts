"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** QR code (inline SVG, rendered in the browser, no network) for one URL. */
export function PulseQr({ url, size = 240 }: { url: string; size?: number }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    QRCode.toString(url, { type: "svg", margin: 2, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } })
      .then((s) => {
        if (alive) setSvg(s);
      })
      .catch(() => {
        if (alive) setSvg(null);
      });
    return () => {
      alive = false;
    };
  }, [url]);
  return (
    <div
      className="rounded-xl bg-white p-2"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`QR code for ${url}`}
      // The SVG string comes from the qrcode library for our own URL (no user HTML).
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
}
