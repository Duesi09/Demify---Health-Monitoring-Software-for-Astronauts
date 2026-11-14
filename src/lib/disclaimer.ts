/**
 * Regulatory wording for Demify, in one place. Plain strings with no imports,
 * so server and client components (and docs tooling) can share them.
 *
 * Use these constants verbatim wherever the app states what it is; do not
 * paraphrase them in components. tests/wording.test.ts keeps known
 * medical-device trigger phrases out of src/.
 */

/** One line, for tight spaces (tags, captions, the monitor stage). */
export const DISCLAIMER_SHORT = "Research prototype, not a certified medical device.";

/** Site footer and anywhere the full statement fits. */
export const DISCLAIMER_LONG =
  "Research prototype – not a certified medical device. Not for diagnosis, treatment or emergency decisions. Vital signs are simulated unless labelled REAL or DEVICE. Thresholds come from NASA standards, clinical guidelines or our own project rules, and each carries its source tag. In a real situation follow your mission's medical procedures and contact your flight surgeon or emergency service.";

/** Intended purpose statement (shown on /help under "About Demify"). */
export const INTENDED_PURPOSE =
  "Demify is open-source research and training software for analog and simulated space missions. It records self-reported wellbeing data and readings from connected sensors, shows them next to public space-weather and NASA open-science data, and indicates which reference ranges (published or project-defined, each tagged) a value falls outside. It is intended for research, education and mission-operations training with adult volunteers who have given informed consent. It is a research and training simulation: it shows how published and project-defined thresholds would flag values and how pre-approved procedures would be timed under signal delay. It must not be used for the medical care of any individual.";

/** Attribution for the site footer. */
export const ATTRIBUTION =
  "Built for the NASA International Space Apps Challenge 2026. Uses public data from NASA OSDR and NOAA SWPC. Not affiliated with or endorsed by NASA or NOAA.";
