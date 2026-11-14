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
export const NO_ANSWER_LINK_UP = "The onboard library has no good answer to this. Ask the flight surgeon when the ground link is up.";
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
  uncited: "The model's answer did not cite the library, so it is not shown. The matching library passages are shown instead.",
  dose: "The model's answer contained a dose or an amount, which this prototype never shows. The matching library passages are shown instead.",
} as const;
