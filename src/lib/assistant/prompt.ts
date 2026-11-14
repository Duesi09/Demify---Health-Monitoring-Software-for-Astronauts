import type { ChatMessage } from "@onboard/model.mjs";
import { NO_ANSWER_TOKEN } from "./wording";

/**
 * The prompt of the onboard assistant. The model sees the numbered library
 * passages [1]..[n] and, when a crew member is selected, their data as [C];
 * it must answer from those and nothing else, cite every statement, and
 * reply NO_ANSWER when the passages do not answer the question.
 *
 * The user message layout is fixed (Question / Library passages / Crew data
 * [C] / Library status / Ground link status): scripts/dev/fake-model-server.mjs
 * reads the first passage from it.
 */

export interface PromptPassage {
  n: number;
  title: string;
  heading: string;
  source: string;
  reviewed?: string;
  text: string;
}

export interface PromptCrew {
  /** Data label of the values, e.g. "SIMULATED". */
  source: string;
  takenAt: string | null;
  summary: string;
}

export interface PromptInput {
  question: string;
  passages: PromptPassage[];
  crew?: PromptCrew | null;
  /** "last synced 14 hours ago" / "bundled with this release (…)" */
  libraryAgeText: string;
  stale: boolean;
  groundLinkUp: boolean;
}

export const SYSTEM_PROMPT = [
  "You are the onboard library assistant of Demify, a research prototype for crewed spaceflight. Research prototype, not a certified medical device.",
  "You advise; you never decide. The crew and, when the ground link is up, the flight surgeons make every medical decision.",
  "",
  "Rules:",
  "- Answer strictly from the numbered library passages ([1], [2], ...) and, when given, the crew data [C] in the user message. Use no other knowledge.",
  "- Cite every statement with the number of the passage it comes from, for example [1] or [2][3]. Cite crew data as [C]. Never cite a number that is not in the passages.",
  `- If the passages do not answer the question, reply exactly ${NO_ANSWER_TOKEN} and nothing else.`,
  "- Never name a medicine, a dose, an amount or a schedule for taking anything, even if the question asks for one. Never diagnose.",
  "- Say which procedure or check the passages describe, and that the crew and the flight surgeon decide.",
  "- Keep it short: at most 6 sentences, or a short list.",
  "- Answer in the language of the question.",
  "- If the library status says the library may be out of date, say so in one short sentence.",
].join("\n");

function passageTitle(p: PromptPassage): string {
  if (!p.heading) return p.title;
  return p.heading.startsWith(p.title) ? p.heading : `${p.title} › ${p.heading}`;
}

/** One line: the passage text may span lines, but never a line that looks like a new passage or section. */
function passageText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/^\s*\[(\d+)\]\s/, "($1) "))
    .join("\n")
    .trim();
}

export function userMessage(input: PromptInput): string {
  const parts: string[] = [`Question: ${input.question.trim()}`, "", "Library passages:"];
  for (const p of input.passages) {
    const meta = [p.source, p.reviewed].filter(Boolean).join("; ");
    parts.push("", `[${p.n}] ${passageTitle(p)}`, `(source: ${meta})`, passageText(p.text));
  }
  if (input.crew) {
    const when = input.crew.takenAt ? `, ${input.crew.takenAt}` : "";
    parts.push("", `Crew data [C] (${input.crew.source}${when}):`, input.crew.summary);
  }
  parts.push(
    "",
    `Library status: ${input.libraryAgeText}${input.stale ? "; the library may be out of date" : ""}.`,
    input.groundLinkUp
      ? "Ground link status: up. The flight surgeons can be reached."
      : "Ground link status: down (blackout). The flight surgeons cannot be reached until contact returns; the crew follows the mission's medical procedures.",
  );
  return parts.join("\n");
}

export function buildMessages(input: PromptInput): ChatMessage[] {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userMessage(input) },
  ];
}
