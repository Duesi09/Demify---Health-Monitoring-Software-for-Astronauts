import { describe, expect, it } from "vitest";
import { userMessage } from "@/lib/assistant/prompt";
describe("prompt passages for small models", () => {
  it("turns numbered checklist steps into bullets so step numbers are not cited as passages", () => {
    const msg = userMessage({
      passages: [{ n: 1, title: "Alarm response", heading: "Seizure", source: "Project", text: "Checklist:\n1. Stay with them.\n6. A first seizure is an emergency.\n- already a bullet" } as never],
      question: "Someone is having a seizure",
      libraryAgeText: "last synced just now",
      stale: false,
      groundLinkUp: true,
    } as never);
    expect(msg).toContain("- Stay with them.");
    expect(msg).toContain("- A first seizure is an emergency.");
    expect(msg).not.toMatch(/^\s*6\. /m);
  });
});
