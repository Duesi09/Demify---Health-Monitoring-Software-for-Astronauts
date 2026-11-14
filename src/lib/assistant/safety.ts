import { BLOCKED_REASON, NO_ANSWER_TOKEN, PASSAGES_ONLY_REASON } from "./wording";

/**
 * Safety rules of the onboard assistant, as pure functions:
 *
 * - questions that ask to obtain, give or take a medicine or an amount of
 *   one are never answered (status "blocked"); this prototype has no
 *   medicines in its library and never names one;
 * - questions that name an emergency get an "act now" line first: the
 *   emergency checklist and the crew come before any assistant;
 * - every model answer is checked before it is shown: no dose, amount or
 *   schedule; every sentence and list item cites the library (markers that
 *   point nowhere are removed, and a statement that loses its only marker
 *   withholds the answer); words copied from the question must be backed by
 *   a cited passage, the crew data or the library (groundingCandidates).
 *
 * No medicine names here either: the checks look for the request (medicine
 * words, "how much … take", "can I give … for …", "wie viel … nehmen"), for
 * amounts with units, for schedules, and for the word endings that
 * international non-proprietary medicine names share (MEDICINE_STEM).
 * English and German; anything the rules miss still meets the system prompt,
 * the answer checks and the relevance gate.
 */

/* ------------------------------------------------------------------------- */
/* Shared word lists                                                          */
/* ------------------------------------------------------------------------- */

/** Numbers written as words (English and German) that can count tablets or drops. */
const NUMBER_WORDS =
  "one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|fifty|hundred|half|a half|one and a half|a couple of|a few|several|" +
  "ein|eine|einen|einer|zwei|drei|vier|f(?:ü|ue)nf|sechs|sieben|acht|neun|zehn|elf|zw(?:ö|oe)lf|zwanzig|halbe|halben|eineinhalb|anderthalb|einige|mehrere|ein paar";

/** A number in digits, optionally a range ("4-6", "4 to 6", "4 bis 6"). */
const DIGITS = String.raw`\d+(?:[.,]\d+)?(?:\s*(?:-|–|to|bis)\s*\d+(?:[.,]\d+)?)?`;

/** Units of mass, volume and activity a medicine is measured in (spelled out and abbreviated, English and German). */
const AMOUNT_UNITS =
  "mg|milligrams?|milligrammes?|milligramm|mcg|µg|μg|ug|micrograms?|microgrammes?|mikrogramm|g|grams?|grammes?|gramm|" +
  "ml|millilit(?:er|re)s?|milliliter|cc|iu|i\\.\\s?u\\.|i\\.\\s?e\\.|units?|einheiten|mmol|meq|millimol";

/** Forms a medicine is counted in. */
const FORMS =
  "tablets?|tabletten?|pills?|pillen?|capsules?|kapseln?|caplets?|drops?|tropfen|puffs?|h(?:ü|ue)be|sprühst(?:ö|oe)(?:ß|ss)e?|sprays?|" +
  "ampoules?|ampules?|ampullen?|vials?|sachets?|suppositor(?:y|ies)|z(?:ä|ae)pfchen|lozenges?|injections?|shots?";

/** Forms that "a"/"an" may count ("take a pill"). Not tablet (the crew tablet computer), drop ("a drop in SpO₂"), patch or spray. */
const SINGLE_FORMS = "pill|capsule|caplet|ampoule|ampule|suppository|lozenge";

/**
 * Word endings (stems) of international non-proprietary medicine names:
 * antibiotics, antifungals, beta blockers, ACE inhibitors, sartans, statins,
 * profens, fenacs, coxibs, triptans, setrons, H2 blockers, heparins,
 * anticoagulants, diuretics, benzodiazepines, opioids, local anaesthetics,
 * calcium blockers, antivirals, steroids and the like. A stem, not a name:
 * it matches words no library passage contains (checked by a test).
 */
export const MEDICINE_STEM =
  /\b[a-z]{2,}(?:cillin|mycin|micin|cycline|oxacin|conazole|prazole|olol|sartan|statin|profen|fenac|coxib|triptan|setron|tidine|dronate|parin|xaban|gatran|semide|thiazide|azepam|zolam|codone|morphone|orphine|caine|dipine|gliptin|gliflozin|glitazone|formin|lukast|ciclovir|clovir|amivir|tadine|olone|metasone|nisone|ephrine|oxetine|triptyline|pramine|peridol|azoline)e?s?\b/i;

/* ------------------------------------------------------------------------- */
/* Amounts and schedules (answers and questions)                              */
/* ------------------------------------------------------------------------- */

/** "325 mg", "400 Milligramm", "0.5 g", "10 mL", "500 IU" (lab units such as mg/dL or mmol/L are not doses). */
const AMOUNT = new RegExp(String.raw`(?<![\w.,])${DIGITS}\s?-?\s?(?:${AMOUNT_UNITS})(?![\w/])(?!\s*\/\s*(?:dl|l|liter|litre|deciliter)\b)`, "i");
/** "2 tablets", "two tablets", "zwei Tabletten", "20 Tropfen", "a pill". */
const COUNTED_FORM = new RegExp(
  String.raw`(?:(?<![\w.,])${DIGITS}\s?-?\s?|\b(?:${NUMBER_WORDS})\s+(?:(?:a|an|of|of the|der|von)\s+)?)(?:${FORMS})\b|\b(?:a|an)\s+(?:${SINGLE_FORMS})s?\b`,
  "i",
);
/** "mg/kg", "per kg", "pro kg". */
const PER_BODY_MASS = /\b(?:mg|mcg|µg|μg|g|ml|iu|units?)\s*\/\s*kg\b|\b(?:per|pro|je)\s+kg\b/i;
/** "every 6 hours", "every 4 to 6 h", "alle 8 Stunden", "q6h". */
const EVERY_N_HOURS = new RegExp(
  String.raw`\b(?:every|alle)\s+(?:${DIGITS}|(?:${NUMBER_WORDS}))\s*(?:hours?|hrs?|h|stunden|std\.?)(?![\w])|\bq\s?\d+\s?h\b`,
  "i",
);
/** "once daily", "twice a day", "three times per day", "2x daily", "x-mal täglich", "dreimal am Tag". */
const TIMES_A_DAY = new RegExp(
  String.raw`\b(?:once|twice|thrice|(?:\d+|${NUMBER_WORDS})\s*(?:x|×|times))\s+(?:a\s+|per\s+|each\s+|every\s+)?(?:day|daily|night|nightly)\b|` +
    String.raw`(?:\b\d+\s*[x×]|\b(?:\d+|x|ein|zwei|drei|vier|f(?:ü|ue)nf|sechs)\s*-?\s*mal)\s+(?:t(?:ä|ae)glich|tgl\.?|am tag|pro tag|je tag|am abend|zur nacht)`,
  "i",
);
/** "2 per day", "zwei pro Tag" (a count per day without a unit). */
const COUNT_PER_DAY = new RegExp(String.raw`(?:(?<![\w.,])${DIGITS}|\b(?:${NUMBER_WORDS}))\s+(?:per|a|pro|je|am)\s+(?:day|tag)\b`, "i");

/** An amount with a unit, a counted form or a schedule for taking something. */
export const DOSE_PATTERN = new RegExp(
  [AMOUNT, COUNTED_FORM, PER_BODY_MASS, EVERY_N_HOURS, TIMES_A_DAY, COUNT_PER_DAY].map((re) => `(?:${re.source})`).join("|"),
  "i",
);

/** The text names a dose, an amount or a schedule for taking something. */
export function containsDose(text: string): boolean {
  return DOSE_PATTERN.test(text);
}

/* ------------------------------------------------------------------------- */
/* Questions                                                                  */
/* ------------------------------------------------------------------------- */

/** Words that name a medicine or a prescription (English, German and a few other languages). */
const MEDICINE_WORD =
  /\b(?:medicines?|medications?|meds|drugs?|pills?|pain ?killers?|pain relievers?|analgesics?|antibiotics?|antihistamines?|antiemetics?|sedatives?|sleeping (?:pills?|aids?|tablets?)|tranquill?i[sz]ers?|opioids?|opiates?|narcotics?|prescriptions?|prescrib(?:e|es|ed|ing)|dosages?|dosing|overdos(?:e|es|ed|ing)|medizin|medikament\w*|arznei\w*|dosierung\w*|tablette\w*|schmerzmittel\w*|schmerztablette\w*|antibiotik\w*|beruhigungsmittel\w*|schlafmittel\w*|schlaftablette\w*|rezept(?:e|en|pflichtig\w*)?|m[ée]dicament\w*|medicamento\w*|f[aá]rmaco\w*|posolog\w*)\b/i;
/** "tablet(s)" is a medicine word unless it is the crew's tablet computer. */
const TABLET_WORD = /\btablets?\b(?!\s+(?:computer|app|screen|device|pc)s?\b)/i;
const TABLET_DEVICE = /\b(?:crew|station|android|ipad|touch)\s+tablets?\b|\b(?:on|from|in)\s+(?:the|a|my|our)\s+tablet\b/i;

/** Uses of medicine words that do not ask for a medicine: allergies, and medicine as a field ("space medicine"). */
const NOT_A_REQUEST = [
  /\b(?:drugs?|medications?|medicines?|medikament(?:e|en)?)[- ]?allerg\w*/gi,
  /\ballerg\w*\s+(?:to|gegen|auf)\s+(?:(?:a|an|any|some|the|ein|eine|einen|bestimmte)\s+)?(?:drugs?|medications?|medicines?|medikament(?:e|en)?)\b/gi,
  /\b(?:space|aerospace|flight|emergency|sports|internal|preventive|occupational|wilderness|operational|aviation|nuclear|family|tropical|clinical|evidence-based)\s+medicine\b/gi,
];

/** "dose" is also a radiation word ("radiation dose", "dose rate", "career dose"). */
const DOSE_WORD = /\b(?:doses?|dosis|dosen)\b/i;
const RADIATION_CONTEXT =
  /radiat|strahl|\bm?sv\b|µsv|μsv|\bm?gy\b|sievert|\bgray\b|dosimet|exposure|career|cumulative|cosmic|\bgcr\b|\bspe\b|solar|storm|shield|alara|proton|neutron|dose[- ]rates?|dose[- ]limits?|dose budget/i;
/** Words that make "dose of <word>" a radiation question. */
const RADIATION_WORD =
  /^(?:radiation|strahlung|ionising|ionizing|cosmic|galactic|solar|proton|neutron|gamma|x-?ray|particle|background|exposure|sievert|millisievert|gray|msv|mgy)$/i;
const DETERMINERS = new Set(
  "a an the this that these those some any his her their its my our your more another extra der die das dem den des ein eine einen einem einer".split(" "),
);

/** Verbs that give, take or administer something. */
const STRONG_VERB = /\b(?:take|takes|taken|taking|took|give|gives|given|giving|gave|administer\w*|inject\w*|swallow\w*)\b/i;
/** Words that ask whether an amount is acceptable ("how much X is safe"). */
const WEAK_VERB = /\b(?:safe|allowed|okay|ok|maximum|max|enough|too much)\b/i;
/** "does the signal delay take", "will it take": take as duration, not as swallowing something. */
const DURATION_TAKE =
  /\b(?:does|do|did|will|would|could|can|should|might|may)\s+(?:it|this|that|(?:the|a|an)\s+(?!commander|pilot|crew|astronaut|patient|flight engineer|engineer|specialist|cmo)[\p{L}-]+(?:\s+[\p{L}-]+)?)\s+take\b|\b(?:it|that|this)\s+takes?\b/giu;
/** Words after "how many / how much" that start the verb phrase ("how much should I take"). */
const AUXILIARY = new Set("is are was were be does do did has have had will would should can could may might must shall more longer".split(" "));
const NEHMEN_VERB =
  /\b(?:nehmen|nimmt|genommen|einnehmen|eingenommen|geben|gibt|gegeben|verabreichen|verabreicht|spritzen|gespritzt|schlucken|darf|d(?:ü|ue)rfen|soll|sollte|sollen|sicher|erlaubt|maximal|h(?:ö|oe)chstens)\b/i;

/** Nouns after "how many / how much" that are not medicines ("how many minutes", "how much water"). */
const NOT_MEDICINE_QUANTITY = new Set(
  (
    "second seconds minute minutes hour hours day days week weeks month months year years time crew crewmembers member members " +
    "people persons astronauts cosmonauts sensor sensors device devices electrode electrodes item items pouch pouches kit kits " +
    "step steps compression compressions breath breaths shock shocks cycle cycles round rounds liter liters litre litres water " +
    "food calories exercise radiation sievert sieverts millisievert msv mgy data bandwidth power delay signal light sleep rest " +
    "weight mass kg kilograms percent pressure noise space room storage battery batteries passages documents chunks questions " +
    "sekunden minuten stunden tage wochen monate jahre zeit crew besatzung besatzungsmitglieder mitglieder personen leute " +
    "astronauten strahlung wasser liter schritte kompressionen schocks elektroden"
  ).split(" "),
);
/** Medicine units after "how many / how much": always a dose question. */
const DOSE_QUANTITY =
  /^(?:mg|milligrams?|milligramm|mcg|micrograms?|mikrogramm|grams?|gramm|ml|millilit(?:er|re)s?|units?|einheiten|iu|doses?|dosen|tablets?|tabletten|pills?|pillen|capsules?|kapseln|drops?|tropfen|puffs?|shots?|injections?|spritzen|ampoules?|ampullen|medicine|medication|medikamente?)$/i;

/** Objects of "take / give / receive" that are not medicines ("take shelter", "take a blood pressure reading"). */
const NOT_MEDICINE_OBJECT = new Set(
  (
    "pulse oximeter blood pressure temperature reading readings measurement measurements vitals vital sample samples picture " +
    "pictures photo photos video shelter cover rest break nap kit bag mask aed defibrillator cpr compressions breaths shock " +
    "shocks water drink food look care notes note checklist checklists procedure procedures radiation part place action " +
    "measures steps over off him her them me us crew commander pilot heart ecg dosimeter dosimeters control charge position " +
    "seat time medical first emergency ground report status update call notice warning alarm signal data lead command"
  ).split(" "),
);

/** The first word after the determiners, lower case. */
function objectWord(text: string): string {
  for (const w of text.toLowerCase().match(/[\p{L}\d-]+/gu) ?? []) if (!DETERMINERS.has(w)) return w;
  return "";
}

/** Clauses of a question (split at sentence punctuation). */
function clauses(text: string): string[] {
  return text.split(/[.?!;\n]+/).filter((c) => c.trim());
}

/** "how many minutes … take" is fine; "how much should I take", "how many milligrams", "how much X is safe" are not. */
function asksHowMuch(clause: string): boolean {
  for (const m of clause.matchAll(/\bhow\s+(?:much|many)\s+(?:of\s+)?([\p{L}\d-]+)/giu)) {
    const next = m[1].toLowerCase();
    if (DOSE_QUANTITY.test(next)) return true;
    if (NOT_MEDICINE_QUANTITY.has(next)) continue;
    const rest = clause.slice(m.index).replace(DURATION_TAKE, " ");
    if (STRONG_VERB.test(rest)) return true;
    if (!AUXILIARY.has(next) && WEAK_VERB.test(rest)) return true;
  }
  for (const m of clause.matchAll(/\bwie\s*viele?\s+(?:von\s+)?([\p{L}\d-]+)/giu)) {
    const next = m[1].toLowerCase();
    if (DOSE_QUANTITY.test(next)) return true;
    if (NOT_MEDICINE_QUANTITY.has(next)) continue;
    if (NEHMEN_VERB.test(clause.slice(m.index))) return true;
  }
  return false;
}

/** "can I give X for …", "should the commander take X", "what can we give him for …", "was kann ich ihm gegen … geben". */
function asksToGiveOrTake(clause: string): boolean {
  const canGive = clause.match(
    /\b(?:can|could|may|might|should|must|shall|do|is it (?:ok|okay|safe) to)\s+(?:(?:i|we|you|he|she|they|one)\s+)?(?:give|take|administer|inject|swallow)\s+([^.?!]*?)\s+(?:for|against|to treat|to help(?: with)?|when|if|after|before)\b/i,
  );
  if (canGive && !NOT_MEDICINE_OBJECT.has(objectWord(canGive[1]))) return true;

  const shouldTake = clause.match(
    /\b(?:should|must|can|may|could)\s+(?:i|we|you|he|she|they|the\s+[\p{L}-]+(?:\s+[\p{L}-]+)?|[\p{L}-]+)\s+(?:take|receive|be given)\s+(.*)$/iu,
  );
  if (shouldTake) {
    const object = objectWord(shouldTake[1]);
    if (object && object !== "it" && !NOT_MEDICINE_OBJECT.has(object) && !/^(?:to|into|in|on|out|up|down)$/.test(object)) return true;
  }

  if (/\bwhat\b[^.?!]*\b(?:can|could|should|do|must|may)\b[^.?!]*\b(?:take|give|administer)\b[^.?!]*\b(?:for|against)\b/i.test(clause)) return true;

  // German: "was kann ich ihm gegen die Schmerzen geben", "soll der Kommandant X einnehmen".
  if (/\b(?:was|welche[snrm]?)\b[^.?!]*\b(?:geben|nehmen|einnehmen|verabreichen|spritzen)\b/i.test(clause) && /\b(?:gegen|bei|f(?:ü|ue)r)\b/i.test(clause)) return true;
  if (
    /\b(?:soll|sollte|sollen|darf|d(?:ü|ue)rfen|kann|k(?:ö|oe)nnen|muss|m(?:ü|ue)ssen)\b[^.?!]{0,80}\b(?:einnehmen|verabreichen|spritzen|nehmen|geben|bekommen|kriegen|erhalten)\b/i.test(clause) &&
    !/\b(?:puls|blutdruck|temperatur|schutzraum|deckung|pause|ruhe|messung|messwert|checkliste|kontakt|verbindung|platz|aed|defibrillator|wasser|daten|bericht|meldung|information\w*|bescheid|status)\b/i.test(clause)
  ) {
    return true;
  }
  return false;
}

/** "safe dose of X", "dose of X" (X not radiation), "take a dose", or "dose" with no radiation word at all. */
function asksForMedicineDose(question: string): boolean {
  if (!DOSE_WORD.test(question)) return false;
  if (!RADIATION_CONTEXT.test(question)) return true;
  for (const m of question.matchAll(/\b(?:doses?|dosis|dosen)\s+(?:of|von|an)\s+([^.?!]*)/giu)) {
    const object = objectWord(m[1]);
    if (object && !RADIATION_WORD.test(object)) return true;
  }
  return /\b(?:take|give|administer|inject|swallow|nehmen|geben|einnehmen|verabreichen)\b[^.?!]{0,30}\b(?:doses?|dosis)\b|\b(?:doses?|dosis)\b[^.?!]{0,30}\b(?:to take|to give|nehmen|einnehmen|geben)\b/i.test(
    question,
  );
}

/** The reason a question is never answered, or null when it may be. */
export function blockedReason(question: string): string | null {
  const q = question.normalize("NFC");
  let words = q;
  for (const re of NOT_A_REQUEST) words = words.replace(re, " ");
  if (MEDICINE_WORD.test(words)) return BLOCKED_REASON;
  if (TABLET_WORD.test(words) && !TABLET_DEVICE.test(words)) return BLOCKED_REASON;
  if (MEDICINE_STEM.test(q)) return BLOCKED_REASON;
  if (DOSE_PATTERN.test(q)) return BLOCKED_REASON;
  if (asksForMedicineDose(q)) return BLOCKED_REASON;
  for (const clause of clauses(q)) {
    if (asksHowMuch(clause) || asksToGiveOrTake(clause)) return BLOCKED_REASON;
  }
  return null;
}

/** Words that describe an emergency happening now. */
const EMERGENCY =
  /\b(not breathing|stopped breathing|isn'?t breathing|can'?t breathe|cannot breathe|no pulse|pulseless|unconscious|unresponsive|passed out|collapsed?|cardiac arrest|heart attack|ventricular fibrillation|ventricular tachycardia|v-?fib|v-?tach|stemi|chest pain|choking|seizures?|convuls\w*|stroke|severe bleeding|bleeding heavily|anaphyla\w*|bewusstlos|atmet nicht|herzstillstand|kammerflimmern|brustschmerz\w*)\b/i;
/** VF / VT as monitor abbreviations (upper case only, so "vt" in other words does not count). */
const EMERGENCY_ABBREVIATION = /\b(VF|VT)\b/;

/** The question names an emergency (the reply starts with ACT_NOW_LINE). */
export function isEmergency(question: string): boolean {
  return EMERGENCY.test(question) || EMERGENCY_ABBREVIATION.test(question);
}

/* ------------------------------------------------------------------------- */
/* Answers                                                                    */
/* ------------------------------------------------------------------------- */

export type AnswerCheck =
  | { ok: true; text: string; cited: number[] }
  | { ok: false; kind: "no-answer" | "uncited" | "dose"; reason: string; detail: string };

/**
 * Normalises citation markers to [n]: "[1, 2]" and "[1-3]" become
 * "[1][2]" and "[1][2][3]", "【1†source】" becomes "[1]", "[c]" becomes "[C]".
 */
function normaliseMarkers(text: string): string {
  return text
    .replace(/【\s*(\d+)[^】]*】/g, "[$1]")
    .replace(/\[\s*c\s*\]/gi, "[C]")
    .replace(/\[\s*(\d+)\s*[-–]\s*(\d+)\s*\]/g, (whole, a: string, b: string) => {
      const from = Number(a);
      const to = Number(b);
      if (!(to >= from) || to - from > 20) return whole;
      return Array.from({ length: to - from + 1 }, (_, i) => `[${from + i}]`).join("");
    })
    .replace(/\[\s*(\d+(?:\s*[,;]\s*\d+)+)\s*\]/g, (_, list: string) =>
      list
        .split(/[,;]/)
        .map((n) => `[${n.trim()}]`)
        .join(""),
    )
    .replace(/\[\s*(\d+)\s*\]/g, "[$1]")
    // "[1], [2]" -> "[1][2]"
    .replace(/(\[(?:\d+|C)\])\s*[,;]\s*(?=\[(?:\d+|C)\])/g, "$1");
}

const MARKER = /\[(\d+|C)\]/g;
const LIST_ITEM = /^\s*(?:[-*•–]|\d+[.)])\s+/;
/** Abbreviations whose full stop does not end a sentence. */
const ABBREVIATION = /(?:\b(?:e\.g|i\.e|etc|approx|ca|vs|cf|dr|no|nr|fig|ref|st|min|max|z\.\s?b|bzw|usw|ggf|evtl|inkl|ca)|\b[A-Z]|\d)\.$/i;

/**
 * Statements of an answer: each list item is one, other lines are split
 * into sentences. Markers right after a full stop ("… CPR. [1]") stay with
 * the sentence before them; a line of markers alone joins the statement
 * above it.
 */
export function statements(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (/^(?:\[(?:\d+|C)\]\s*)+[.]?$/.test(line) && out.length) {
      out[out.length - 1] += ` ${line}`;
      continue;
    }
    if (LIST_ITEM.test(line)) {
      out.push(line);
      continue;
    }
    let start = 0;
    const boundary = /[.!?…]+["'”’)]*((?:\s*\[(?:\d+|C)\])*)(?=\s+["'“„(]?[\p{Lu}\d])/gu;
    for (const m of line.matchAll(boundary)) {
      const end = m.index + m[0].length;
      const before = line.slice(start, m.index + m[0].length - m[1].length).trimEnd();
      if (ABBREVIATION.test(before.replace(/["'”’)]+$/, ""))) continue;
      out.push(line.slice(start, end).trim());
      start = end;
    }
    const rest = line.slice(start).trim();
    if (rest) out.push(rest);
  }
  return out.filter((s) => /[\p{L}\d]/u.test(s.replace(MARKER, "")));
}

/**
 * Lines of numbers and markers only ("1, 2, 6, 7 [1][2]"): small models
 * sometimes list the passage numbers before the answer. They state nothing
 * and are dropped (after the dose check), as is such a list in front of a
 * line's leading markers ("1, 3, [3] The crew …"). A line of markers alone stays: it
 * belongs to the statement above it (statements()).
 */
function dropNumberLines(text: string): string {
  return text
    .split("\n")
    .filter((line) => {
      const rest = line.replace(MARKER, " ");
      return !(/\d/.test(rest) && !/\p{L}/u.test(rest));
    })
    // "1, 3, [3] The crew member …": the same list in front of a statement.
    .map((line) => line.replace(/^([ \t]*)(?:\d+[ \t]*,[ \t]*)+(?:\d+[ \t]*)?(?=\[(?:\d+|C)\])/, "$1"))
    .join("\n");
}

/** Fewest words of a statement that counts as copied from a passage (a word or two can mean anything). */
const VERBATIM_MIN_WORDS = 3;

/** Text for the word-for-word comparison: folded, lower case, punctuation and Markdown dropped, single spaces. */
function verbatimForm(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Lines that introduce the next lines or head a section: they state nothing themselves. */
function isLeadIn(statement: string): boolean {
  const s = statement.replace(MARKER, "").trim();
  return /:\s*$/.test(s) || /^#{1,6}\s/.test(s) || /^(?:\*\*|__)[^*_]+(?:\*\*|__):?$/.test(s);
}

/** The sentence the system prompt asks for when the library may be out of date. */
function isStaleNote(statement: string): boolean {
  return /\b(?:out of date|outdated|not (?:be )?up to date|veraltet|nicht (?:mehr )?aktuell)\b/i.test(statement) && !/\d/.test(statement);
}

const MARKER_RUN = String.raw`(?:\[(?:\d+|C)\][ \t]*)+`;
/** A run of markers at the start of a line (after an optional list marker), before a statement that has markers of its own. */
const LEADING_RUN = new RegExp(String.raw`^([ \t]*(?:(?:[-*•–]|\d+[.)])[ \t]+)?)${MARKER_RUN}(?=[^\n]*\[(?:\d+|C)\])`, "gm");
/** "… [2]. [1] Next sentence [3]." : a run after a cited sentence, before a sentence that is cited too. */
const MID_RUN = new RegExp(String.raw`(\][ \t]*[.!?…]["'”’)]*[ \t]+)${MARKER_RUN}(?=[\p{Lu}\d][^\n.!?]*\[(?:\d+|C)\])`, "gu");

/** "… S1 or higher [1]. [1]": a run after the full stop of a sentence that is already cited, at the end of a line. */
const TRAILING_RUN = new RegExp(String.raw`(\][ \t]*[.!?…]["'”’)]*)[ \t]+${MARKER_RUN}$`, "gm");

/**
 * Small models sometimes open a sentence with markers as well as closing it
 * with them ("[1][2] The checklist says … [2]."). The opening run is dropped
 * when the statement carries markers of its own; a run after a full stop that
 * the previous sentence needs stays with it (see statements()).
 */
function dropLeadingMarkers(text: string): string {
  return text.replace(LEADING_RUN, "$1").replace(MID_RUN, "$1").replace(TRAILING_RUN, "$1");
}

/**
 * Checks a model answer against the passages it was given (numbered
 * 1..passageCount; [C] only when crew data was given):
 * - "NO_ANSWER" (or nothing) means the passages did not answer the question;
 * - a dose, an amount or a schedule withholds the answer;
 * - markers out of range are removed; a sentence or list item that loses
 *   its only marker, more than one sentence without any marker, or no
 *   library marker at all withholds the answer;
 * - except: a statement that is, word for word (case, spacing and
 *   punctuation aside, at least VERBATIM_MIN_WORDS words), part of a passage
 *   (opts.passages[n - 1] is passage [n]): without a marker it counts as
 *   cited when that passage is cited elsewhere in the answer; when its only
 *   markers were out of range it keeps a marker to that passage (a cited
 *   one first).
 */
export function checkAnswer(raw: string, passageCount: number, opts: { crew?: boolean; passages?: string[] } = {}): AnswerCheck {
  const text = raw.trim();
  // Only an answer that IS the token (or opens with it): a sentence that quotes "NO_ANSWER" in passing is checked like any other.
  if (!text || new RegExp(`^[^\\p{L}\\d]*${NO_ANSWER_TOKEN}(?![\\p{L}\\d_])`, "u").test(text)) {
    return { ok: false, kind: "no-answer", reason: "the model found no answer in the passages", detail: "model answered NO_ANSWER" };
  }
  if (containsDose(text)) return { ok: false, kind: "dose", reason: PASSAGES_ONLY_REASON.dose, detail: "model answer contained a dose pattern" };

  const valid = (m: string) => {
    if (m === "C") return opts.crew === true;
    const i = Number(m);
    return Number.isInteger(i) && i >= 1 && i <= passageCount;
  };
  const normalised = dropNumberLines(normaliseMarkers(text));
  // Statements copied word for word from a passage (verbatimForm; at least VERBATIM_MIN_WORDS words).
  const forms = (opts.passages ?? []).slice(0, passageCount).map((p) => ` ${verbatimForm(p)} `);
  const citedNs = new Set([...normalised.matchAll(MARKER)].map((m) => m[1]).filter((m) => m !== "C" && valid(m)).map(Number));
  /** Number of the passage this statement is copied from (a cited one first; any given one when anyCited), or null. */
  const copiedFrom = (statement: string, any: boolean): number | null => {
    const form = verbatimForm(statement.replace(MARKER, " ").replace(LIST_ITEM, ""));
    if (form.split(" ").length < VERBATIM_MIN_WORDS) return null;
    const order = [...forms.keys()].map((i) => i + 1).sort((a, b) => Number(citedNs.has(b)) - Number(citedNs.has(a)));
    return order.find((n) => (any || citedNs.has(n)) && forms[n - 1].includes(` ${form} `)) ?? null;
  };
  let working = normalised;
  let unmarked = 0;
  for (const s of statements(normalised)) {
    const markers = [...s.matchAll(MARKER)].map((m) => m[1]);
    if (markers.length && !markers.some(valid)) {
      // Its only markers point nowhere: kept when it is copied from a passage, cited with that passage.
      const n = copiedFrom(s, true);
      if (n === null) {
        return { ok: false, kind: "uncited", reason: PASSAGES_ONLY_REASON.uncited, detail: "a statement of the model answer cited no passage that exists" };
      }
      let first = true;
      const fixed = s.replace(MARKER, () => (first ? ((first = false), `[${n}]`) : ""));
      if (working.includes(s)) working = working.replace(s, fixed);
      continue;
    }
    // A statement without a marker that is copied from a passage the answer cites needs none.
    if (!markers.length && !isLeadIn(s) && !isStaleNote(s) && copiedFrom(s, false) === null) unmarked++;
  }
  if (unmarked > 1) {
    return { ok: false, kind: "uncited", reason: PASSAGES_ONLY_REASON.uncited, detail: `${unmarked} statements of the model answer had no citation` };
  }

  const cleaned = dropLeadingMarkers(working.replace(MARKER, (marker, m: string) => (valid(m) ? marker : "")))
    // Tidy the gaps left by removed markers.
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/^[ \t]+/gm, "")
    .trim();
  const cited = new Set([...cleaned.matchAll(MARKER)].filter((m) => m[1] !== "C").map((m) => Number(m[1])));
  if (!cited.size) return { ok: false, kind: "uncited", reason: PASSAGES_ONLY_REASON.uncited, detail: "model answer had no valid citation" };
  return { ok: true, text: cleaned, cited: [...cited].sort((a, b) => a - b) };
}

/* ------------------------------------------------------------------------- */
/* Grounding                                                                  */
/* ------------------------------------------------------------------------- */

/** Common English and German words of five letters or more that carry no fact. */
const GROUNDING_STOPWORDS = new Set(
  (
    "about above after again against among around because before being below between could doing during each either every " +
    "further having herself himself itself might myself neither other others ourselves please shall should since their theirs " +
    "themselves there these those through under until where whether which while would yours yourself yourselves what's there's " +
    "according answer answers asked question questions passage passages library assistant onboard thanks thank tells telling " +
    "welche welcher welches welchen welchem warum wieso weshalb können könnte konnte sollen sollte sollten müssen musste werden " +
    "wurde wurden worden haben hatte hatten nicht keine keinen keiner einen einem einer eines diese dieser dieses diesen diesem " +
    "gegen unter durch zwischen bitte steht sagen sagt machen macht unsere unser unserer meine meinen meiner seine seinen seiner " +
    "ihren ihrer ihnen damit dafür dabei darüber darauf wenn weil schon immer etwas wieder sowie laut gemäß bibliothek frage"
  ).split(" "),
);

/** Lower case, diacritics folded ("Ä" -> "a", "ß" -> "ss"). */
export function foldWord(word: string): string {
  return word.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss").toLowerCase();
}

/** Light stemmer (plurals, -ing, -ed, final -e), as in the relevance gate. */
export function stemWord(word: string): string {
  let w = word;
  if (w.length <= 3) return w;
  if (w.endsWith("ies") && w.length > 4) w = `${w.slice(0, -3)}y`;
  else if (w.endsWith("sses")) w = w.slice(0, -2);
  else if (w.endsWith("s") && !/(ss|us|is)$/.test(w)) w = w.slice(0, -1);
  if (w.endsWith("ing") && w.length > 5) w = w.slice(0, -3);
  else if (w.endsWith("ed") && w.length > 4) w = w.slice(0, -2);
  if (w.endsWith("e") && w.length > 4) w = w.slice(0, -1);
  return w;
}

/** Folded words of a text (letters only). */
function foldedWords(text: string): string[] {
  return (text.match(/\p{L}+/gu) ?? []).map(foldWord);
}

/** Stems of every word of these texts. */
export function stemSet(texts: string[]): Set<string> {
  const out = new Set<string>();
  for (const t of texts) for (const w of foldedWords(t)) out.add(stemWord(w));
  return out;
}

/**
 * Words of five letters or more that the answer copied from the question
 * but that no cited passage and no crew data contains (folded, lower
 * case). The caller removes the words the library contains elsewhere; what
 * is left is not backed by the library at all (a medicine name copied from
 * the question, for example) and withholds the answer.
 */
export function groundingCandidates(answer: string, question: string, backing: string[]): string[] {
  const questionStems = new Set(
    foldedWords(question)
      .filter((w) => w.length >= 5 && !GROUNDING_STOPWORDS.has(w))
      .map(stemWord),
  );
  if (!questionStems.size) return [];
  const backed = stemSet(backing);
  const out = new Set<string>();
  for (const w of foldedWords(answer.replace(MARKER, " "))) {
    if (w.length < 5 || GROUNDING_STOPWORDS.has(w)) continue;
    const s = stemWord(w);
    if (questionStems.has(s) && !backed.has(s)) out.add(w);
  }
  return [...out];
}

/** Answer words that look like a medicine name (MEDICINE_STEM) and that no backing text contains. */
export function medicineLikeWords(answer: string, backing: string[]): string[] {
  const backed = stemSet(backing);
  const out = new Set<string>();
  for (const w of foldedWords(answer)) {
    if (w.length >= 5 && MEDICINE_STEM.test(w) && !backed.has(stemWord(w))) out.add(w);
  }
  return [...out];
}
