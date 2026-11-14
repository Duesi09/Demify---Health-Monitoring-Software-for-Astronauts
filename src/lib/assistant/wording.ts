import { DISCLAIMER_SHORT } from "../disclaimer";

/**
 * Fixed texts of the onboard assistant (library assistant, local language
 * model), in one place so the routes, the UI and the tests use the same words.
 * Plain strings, no server imports: client components may use them too.
 */

/** Shown with every answer. */
export const ASSISTANT_NOTICE = `Advises, never decides. The crew and, when the ground link is up, the flight surgeons make every medical decision. ${DISCLAIMER_SHORT}`;

/** Questions that ask for a medicine, a dose or a prescription. */
export const BLOCKED_REASON =
  "This prototype never names medicines or doses. Ask the flight surgeon; during a blackout follow your mission's medical procedures.";

/** First line of every reply to a question that names an emergency. */
export const ACT_NOW_LINE =
  "If this is a real emergency, act now: start the emergency checklist and alert the crew. Do not wait for the assistant.";

/** The library has no good answer (ground link up / down). */
export const NO_ANSWER_LINK_UP = "The onboard library has no good answer to this. Ask the flight surgeon.";
export const NO_ANSWER_LINK_DOWN = "The onboard library has no good answer to this. Ask the flight surgeon when contact returns.";

/** What the model replies, exactly, when the passages do not answer the question. */
export const NO_ANSWER_TOKEN = "NO_ANSWER";

/** Why the matching passages are shown instead of a model answer. */
export const PASSAGES_ONLY_REASON = {
  notConfigured: "No language model is set up on this machine, so the matching library passages are shown instead.",
  unreachable: "The language model is not reachable right now, so the matching library passages are shown instead.",
  missing: (model: string) =>
    `The language model ${model} is not loaded on the model server, so the matching library passages are shown instead.`,
  timeout: "The language model did not answer in time, so the matching library passages are shown instead.",
  failed: "The language model returned an error, so the matching library passages are shown instead.",
  uncited: "The model's answer did not cite the library for every statement, so it is not shown. The matching library passages are shown instead.",
  dose: "The model's answer contained a dose, an amount or a schedule, which this prototype never shows. The matching library passages are shown instead.",
  ungrounded:
    "The model's answer used words that the cited library passages do not contain, so it is not shown. The matching library passages are shown instead.",
} as const;

/** Reasons for a model answer withheld by the answer checks (the UI groups them). */
export const WITHHELD_REASONS: readonly string[] = [PASSAGES_ONLY_REASON.uncited, PASSAGES_ONLY_REASON.dose, PASSAGES_ONLY_REASON.ungrounded];

/** 503 from POST /api/assistant while the language model already answers other questions. */
export const ASSISTANT_BUSY = "Assistant busy, try again in a moment.";

/** Shown with the question form: the keyword search translates common German terms (glossary in onboard/library.mjs). */
export const GERMAN_HINT = "The library is in English; German questions work for common terms.";
