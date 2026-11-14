"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";

/** Code block with a copy button (falls back to manual selection if the clipboard is blocked). */
export function CopyCode({ code, label }: { code: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const t = window.setTimeout(() => setState("idle"), 2000);
    return () => window.clearTimeout(t);
  }, [state]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface-2">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
        <span className="text-xs font-medium text-muted">{label}</span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex h-7 items-center gap-1.5 rounded-[3px] border border-border bg-surface px-2.5 text-[11px] font-semibold text-fg transition-colors hover:border-muted/60 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
        >
          {state === "copied" ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
          {state === "copied" ? "Copied" : state === "failed" ? "Select and copy" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-3 font-mono text-[12.5px] leading-relaxed text-fg" tabIndex={0}>
        <code>{code}</code>
      </pre>
      <p className="sr-only" role="status" aria-live="polite">
        {state === "copied" ? "Copied to clipboard" : state === "failed" ? "Copy failed; select the text to copy it" : ""}
      </p>
    </div>
  );
}
