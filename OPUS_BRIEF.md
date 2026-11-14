# OPUS BRIEF: Demify, NASA Space Apps 2026, the final 30 hours

> **How to use:** paste this whole file as the first message of a fresh Claude Opus 5.5 session on the Demify repository and add the word **ultracode**. It is self-contained and was reviewed by three independent critics (facts, code, prompt quality); 56 findings were fixed.
>
> **Deep detail** lives on branch `test` (do not commit there): `RESEARCH.md` (964 lines, every fact with its fact-check verdict: FIX = corrected fact, REC = recommendation, OBJ = fact-checker objection, DNC = do not claim), `BUSINESS_MODEL.md`, `COMPETITORS.md`. Never read RESEARCH.md whole; read a section with `git show origin/test:RESEARCH.md | sed -n 'A,Bp'`:
>
> | Lines | Theme |
> |---|---|
> | 7-118 | Light-time contracts |
> | 119-235 | Expected Self |
> | 236-346 | Environment, radiation, cause attribution |
> | 347-467 | Regulation, ethics, privacy |
> | 468-583 | How to win Space Apps, rival 2026 teams |
> | 584-693 | Swiss next steps and funding |
> | 694-825 | Competitor fact-check |
> | 826-964 | Project-2 code map |
>
> Facts were checked on **Sat 14 Nov 2026, about 14:00 CET** against `origin/Project-2-Phase-1` at **80a24e8**. Another agent was committing to that branch then: re-check line numbers before editing.

---

## 0. Your role and the goal

You are the lead engineer, fact-checker and pitch coach for **Demify**, a two-person Swiss student team at the **NASA International Space Apps Challenge 2026**, challenge *Create health monitoring software for astronauts on space missions*.

**Goal:** by the live pitch on **Sun 15 Nov 2026, about 16:00 to 17:00 CET** (15:00 to 16:00 UTC) the team has:
1. a pitched build that is honest, legally clean and never breaks on stage;
2. **light-time contracts** (section 6.2), a differentiator we could not find in any public 2026 entry, demoed for real or presented honestly as the next build;
3. a rehearsed 5-minute pitch with a serious business part, and a project page that wins on its own with the global judges.

**Order of value:** a demo that works and says nothing false beats a new feature. Never trade honesty or stability for scope.

---

## 1. Situation

| Item | Fact |
|---|---|
| Team | 2 students in Switzerland. One speaks, one drives the laptop. They want short, plain English, one step at a time for anything they must do themselves |
| Event | Local Space Apps event in Switzerland. Local judges pick global nominees; global judges then see only the project page and its demo link |
| Pitch | Sun 15 Nov, about 16:00 to 17:00 CET, live demo, about 5 minutes (length and any local rubric: ask the Local Lead) |
| Submission | Project page submitted **before the pitch**; it can be refined until the deadline, very likely **Sun 15 Nov 23:59 local time** (2025 rule, unconfirmed for 2026). Only the last saved version counts |
| Mentors | Want a serious business side: Business Model Canvas (Strategyzer) and their flipchart questions: astronauts served in 2027, 2035 and 2050; who on Earth can use it and market size; costs and revenue; value for NASA (image, revenue, winning students); cost |
| Judging criteria | **Impact, Creativity, Validity, Relevance, Presentation**, treated as equally important. No published weights, no business criterion. Local events may add a rubric |
| Global demo | A video of **30 s or less** or **at most 7 slides including the title**, hosted publicly. English everywhere |
| Brand rule | Space Apps Brand Guide (25 June 2026): no NASA official branding (meatball, worm, seal, mission logos) in any media. 51 U.S.C. 20141 bars implying NASA connection or endorsement |
| Repo | Public. **Default branch `main` holds only an old README** (no code, no LICENSE). Global judges who click the repo land there |

### Branches

| Branch | What it is |
|---|---|
| **`Project-2-Phase-1`** (80a24e8) | **The pitched build and the only branch you commit to.** Next.js 16.4.6 App Router, React 19.3, TS strict, Tailwind 4.3, Recharts 3, Zod 4, Vitest, Docker `node:24-alpine`, offline compose profile. Real NOAA SWPC and NASA OSDR (Inspiration4) data with offline snapshots. Patient monitor, alarms, drills, check-in, body map, radiation, guidance pages. **Default mission is ISS (0.5 s)**, set by `DEMIFY_MISSION` at start |
| `test` = `Phase-3` | A separate codebase (306 files differ; `src/domain`, `src/ui`, `src/server`). Has a light-time model, an earliest-Earth-answer ledger, cross-indicator patterns, a reaction test, task go/no-go, storm-shelter procedure, SQLite with append-only audit of reading edits, `/api/v1` + OpenAPI, Playwright tests, MIT LICENSE, and the research files. **Read only** |
| `main` | Old README only. Do not touch |

**Never merge, rebase or cherry-pick `test` into Project-2.** Copy small pieces with `git show origin/test:<path>` into new files and adapt them.

---

## 2. First steps (in this order)

1. `git fetch --all`, check out `Project-2-Phase-1`, `git pull --rebase`.
2. `npm ci` (the working tree may hold the other branch's `node_modules`).
3. Read `AGENTS.md`: this Next.js differs from your training data. Before touching routing, `searchParams`, `cookies()`, server actions, caching or `output: standalone`, read the matching guide in `node_modules/next/dist/docs/`.
4. Run the baseline checks (section 7). Tag the starting point `pitch-baseline-0` and write which checks are red into `docs/pitch/PROGRESS.md`. Use `pitch-safe-N` tags only for fully green states.
5. Put these questions in your **first reply** and keep working on P0, which does not depend on the answers:
   1. Has the other agent stopped committing to Project-2-Phase-1? (Until it has, see the concurrency rules in section 3.)
   2. Build light-time contracts for real tonight (about 5 to 6 h), or present them as "our next build" on a slide?
   3. How long is the pitch, is there a local rubric, who speaks and who drives?
   4. Slides, demo script and project-page text from me now, or code first?
   5. Is either of you under 18 (may affect who appears in demo media; rule unconfirmed)? Are you enrolled at or linked to a Swiss university (Venture Kick expects a university link)?
   6. Should the GitHub default branch stay `main` (README only)? (You change that in GitHub settings, not me.)

   **Defaults if there is no answer by Sat 16:00 CET:** branch Project-2-Phase-1; build P1.2 then a minimal P1.3 behind the flag `DEMIFY_CONTRACTS` (default off), and fall back to the slide if it is not green by Sun 08:00; pitch 5 min; slides and page text after the 11:00 freeze, deck v1 by 14:00. Ask new questions only at phase boundaries. In every other unclear case choose the safer, reversible option, log it in PROGRESS.md and report it.

---

## 3. Operating rules

### Hard limits
- **Commit only to `Project-2-Phase-1`.** Never commit or push to `test`, `Phase-3` or `main`; never push `worktree-agent-*` branches; never rewrite pushed history; never force-push.
- **No outward actions** unless the team asks in this session: no email, calendar events, messages, decks or sites published in third-party tools, GitHub settings changes, PRs or merges. Write drafts as files in `docs/pitch/`; the team sends them.
- Never claim a human step is done (rehearsal, recording, laptop setup, submission on the Space Apps site). Give the team a checklist instead (section 7).

### Working next to the other agent
`git pull --rebase` before every push. If a rebase conflicts in files you did not change, stop and report; do not resolve someone else's work. Keep each commit small and focused so rebases stay easy.

### Ultracode workflow plan
One workflow per phase; read each result before starting the next:
1. **P0 fixes**: one agent per independent fix with `isolation: 'worktree'`; you integrate; a verify agent runs section 7.
2. **P1 build**: one agent per feature in a worktree, each with unit tests; you integrate in the order of section 5.
3. **Adversarial review** after P1: at least three lenses (clinical safety and wording; correctness and tests; on-stage demo risk), each told to refute. Fix only what survives.
4. **Pitch kit**: one agent drafts into `docs/pitch/`; two critics check every sentence against sections 10, 12 and 13.
5. **Pitch-time check**: section 7.

Keep each workflow under about 10 agents unless a phase truly needs more.

### Research rules
- The shared web-search budget is small (about 200 searches per turn across all agents; it ran out twice). Cap each researcher at 15 and each verifier at 8 searches. Grep RESEARCH.md first; most answers are there.
- A fact goes on a slide or into the UI only if RESEARCH.md marks it confirmed or you confirm it now from a primary source. Otherwise drop it or label it "unconfirmed".
- Never say **"first"**, **"only"** or **"nobody does this"** (section 9 has the safe comparison line).

### Code rules
- Small commits, each green on lint, tests, typecheck and build. Tag green states `pitch-safe-1`, `-2`, ...
- New features ship behind an env flag, default off, until rehearsed (`DEMIFY_CONTRACTS`, `DEMIFY_EXPECTED_SELF`). Add new env vars to `x-demify-env` in `docker-compose.yml` and to `.env.example`, or the container never sees them.
- No new runtime dependencies. Dev tools (Playwright) go in a scratch directory, not in Project-2's `package.json`.
- Every new pure module gets unit tests. Every assumption shown on screen gets a visible "assumption" or "illustrative" label.
- Nothing that imports `node:` modules may be imported by a `"use client"` file. Compute hashes in a server-only file and pass strings as props.
- The wording rules in section 10 apply to code, README, UI text, commit messages and slides.

### Freeze and rollback
- **Sun 11:00 CET: feature freeze.** Anything not merged and green stays on its worktree branch and is never merged afterwards. Merged but unrehearsed features stay behind their flag (off), and the demo uses the "if not built" path.
- After freeze: only text fixes and demo-blocking bugs. If the head is red, `pitch-final` = the last green `pitch-safe-N`.
- **After Sun 14:00: no code changes** except reverting to a tag.
- Keep `docs/pitch/PROGRESS.md` (done, verified with what, open decisions, current tag) updated at the end of every phase; re-read it after any context compaction.

---

## 4. P0: must-do fixes (about 2 to 3 hours, all safe, do first)

Re-checked on 80a24e8. Run `git grep` for new copies before editing.

| # | Problem | Where | Fix |
|---|---|---|---|
| P0.1 | Disclaimers say "not a medical device" or "decision support". Under EU MDR Rule 11 / Swiss MedDO Art. 15, software that rates vital signs and says when to call a doctor **is** medical device software; "decision support" is the very trigger phrase | `git grep -n -i "not a medical device\|decision support"`: README.md:7, docs/research/health-knowledge-base.md:11, src/app/page.tsx:206, src/app/guidance/page.tsx:45, src/app/check-in/page.tsx:72, src/app/crew/[id]/page.tsx:188, src/components/body/region-detail.tsx:200, src/components/alarms/alarm-center.tsx:350, src/components/monitor/patient-monitor.tsx:479, src/components/monitor/shared.tsx:113, src/lib/health/knowledge.ts:13 | Exported constants `DISCLAIMER_SHORT` and `DISCLAIMER_LONG` (section 10) used everywhere. Monitor and alarm tags read "Simulated training monitor" and "Training alarms". Unit test: no file in `src/` contains "not a medical device" or "decision support" |
| P0.2 | Advice names drugs and amounts | knowledge.ts:538 ("e.g. aspirin, oxygen if SpO₂ < 90 %"), :405 ("Bisphosphonates only if prescribed", "Vitamin D and calcium per diet plan"), :246 ("take 15 g fast carbohydrate…"), :109 (fluid and salt loading), :271 (sleep medication) | :538 → **"Follow the onboard medical checklist for chest pain; contact the flight surgeon."** (no oxygen instruction: oxygen is a medicinal gas). :405 → "Bone-protection measures per the medical plan." :246 → "Follow the onboard low-blood-sugar procedure." :109 → name the procedure, no amounts. :539-541 (AED/ACLS kit, "ST elevation ≥ 1 mm = medical emergency") become cited reference text, not app-issued actions. Test every `INDICATORS[*].actions` string and every step text of `buildProtocol()` for all protocol ids (src/components/crew/protocols.ts:80-126) against `/aspirin|ibuprofen|paracetamol|bisphosph|oxygen\b|\b\d+\s?(mg|g|ml|mL)\b/i`. Do not apply it to range or escalation text, which legitimately contains mg/dL |
| P0.3 | No LICENSE although pitched as open source; without one the code is all rights reserved | repo root | Copy `LICENSE` from `origin/test` (MIT, "Copyright (c) 2026 The Demify team"); add `"license": "MIT"` to package.json (keep `"private": true`, it only blocks npm publish). Optionally adapt SECURITY.md and CONTRIBUTING.md from test. **Keep MIT**; Apache-2.0 is a later decision that needs every contributor's consent |
| P0.4 | `npm run typecheck` fails on a clean checkout (6 × TS2304 PageProps/LayoutProps); CI has no typecheck | package.json `"typecheck": "tsc --noEmit"`; .github/workflows/ci.yml | `"typecheck": "next typegen && tsc --noEmit"` (check `next typegen` in `node_modules/next/dist/docs/01-app/03-api-reference/06-cli/next.md`); add the step to CI before build |
| P0.5 | Anyone on venue Wi-Fi can start a cardiac-arrest drill with alarm sound, or POST critical readings: `/api/scenarios` POST/DELETE and `/api/readings` POST have no auth; compose binds 0.0.0.0 (`isCrossOrigin` passes requests with no Origin header, e.g. curl) | src/app/api/scenarios/route.ts, src/app/api/readings/route.ts, docker-compose.yml:100 and :158 | **Stage protection = loopback binding:** run with `DEMIFY_BIND=127.0.0.1`. Optional token on top: the route handlers check an `x-demify-admin` header or an httpOnly cookie set by a one-time `/unlock?token=…` visit; no server-action wrapper (a server action is itself a public POST). Add `DEMIFY_ADMIN_TOKEN` to `x-demify-env` and `.env.example`. Test: with the token set, a request without it gets 401 and the drill button in the Docker build still works |
| P0.6 | Judges must always know what is real | every data panel | Labels: **REAL** (live fetch), **SNAPSHOT <date>** (offline cache), **SIMULATED**, **DEVICE** (posted by a sensor or gateway). Never "live" for a snapshot. Tab "NASA Data" → "Open data (NASA OSDR)". The NASA source-tag tooltip names the indicator's own first source (e.g. "NASA OCHMO-TB-041"), never a blanket "NASA-STD-3001" (sleep and hydration cite only OCHMO briefs) |
| P0.7 | Attribution and non-endorsement | footer | "Built for the NASA International Space Apps Challenge 2026. Uses public data from NASA OSDR and NOAA SWPC. Not affiliated with or endorsed by NASA or NOAA." No NASA logos anywhere |
| P0.8 | README drift and wording | README.md:5, :7, :20, :25, :46/:48, tables | :5 says it "tells the crew what to do and when to call the flight surgeon": rewrite in training framing (section 10). :7 disclaimer. :20 "19 indicators" → 20, add stDeviation to the table. :25 "≥ 25 %" baseline text must match the code after P1. Remove the duplicated Docker line (:46/:48). Add Crew Monitor and drills, the APIs `/api/vitals/live`, `/api/alarms`, `/api/scenarios`, `/api/crew`, `/api/osdr/mission`, and the intended-purpose statement. "Up to 20 minutes" → "about 3 to 22 minutes one way" |
| P0.9 | Small accuracy fixes | src/lib/types.ts:110; src/app/radiation/page.tsx:15; knowledge.ts cabinCO2 | types.ts: the ISS 0.5 s is relay latency, not light time (about 1.3 ms from 400 km): call the field "one-way signal delay" with a basis per profile. radiation page: cite "NASA-STD-3001 Vol. 1 Rev C" (it says Rev B). cabinCO2: source entry "NASA-STD-3001 Vol. 2, V2 6004" (no revision letter) plus OCHMO-TB-004; 1-hour average limit 3 mmHg; 7-day target below 2.5 mmHg (OCHMO-TB-004); delete "headaches start around 2.8 mmHg" and "emergency > 4.5 mmHg"; add "headache odds roughly double per +1 mmHg (Law 2014)" |
| ✓ | Exercise samples judged as resting vitals | fixed in 80a24e8 | Confirm a test freezes the clock inside ms1's exercise slot (11:00 to 12:30 UTC) and asserts heart rate is not flagged; add it if missing |

Commit P0 as 3 to 5 focused commits, run section 7, tag `pitch-safe-1`, push.

---

## 5. Work plan: order, time boxes, cut lines

| Order | Item | Time box | Cut rule |
|---|---|---|---|
| 1 | **P0** (section 4) | 2 to 3 h | Mandatory |
| 2 | **P1.0 Pitch-time safety net**: a Vitest test at `2026-11-15T15:30:00Z` (section 7) plus a demo smoke script with Playwright installed in a scratch directory | 1 h | Mandatory, do right after P0 while the network is good |
| 3 | **P1.1 Over-triage fix** (6.1) | 1.5 h | Mandatory |
| 4 | **P1.2 Link model and `?link=` switch** (6.2a) | 2 h | Strongly wanted; fallback is two containers |
| 5 | **P1.3 Light-time contracts, minimal** (6.2b to 6.2e): one plan (P-CHEST), no new API, behind `DEMIFY_CONTRACTS` | 3 to 4 h | **Hard stop Sat 23:00 CET.** Not green by Sun 08:00 → flag off, slide instead |
| 6 | **P1.4 Temperature: NEWS2 bands + Expected Self** (6.3) | 1.5 h | Only if time remains Sun morning; all of 6.3 lands in one commit or none of it |
| post-pitch | Flight recorder (6.4), cause lines (6.5), other plans, ports from test (reaction check renamed "Reaction check: modelled on the PVT-B used in NASA's Reaction Self Test", task go/no-go, storm-shelter procedure, cross-indicator patterns, SQLite audit, `/api/v1`) | n/a | Roadmap slide only. Never show a test-branch feature as if it were in the pitched build |

**Schedule (CET):** Sat 14:00-17:00 P0 and P1.0 · Sat 17:00-23:00 P1.1, P1.2, P1.3 · Sat 23:00-24:00 review workflow and fixes · Sun 08:00-11:00 fixes from the review, P1.4 if time, pitch kit drafts · **Sun 11:00 freeze**, tag `pitch-final`, hand the team checklist over · Sun 11:00-14:00 deck v1 PDF, project-page text, demo script final; the team rehearses · Sun 14:00 no more code · pitch · until 23:59 refine the project page and the 7 global slides.

---

## 6. Feature specifications

### 6.1 Over-triage fix (P1.1)
**Now:** `evaluateValue()` (knowledge.ts:604) sets `escalate = status === "critical" || needsEscalation(...)`, so every critical band pages the flight surgeon, while the escalation texts and the Guidance "Automatic flag" table (src/components/guidance/escalation-protocol.tsx:95) promise other limits. Examples: systolic says "> 180" but escalates at ≥ 140; diastolic "> 120" but at ≥ 90; temperature "> 38.5" but at 38.0; stress "8 or more on two days" on one day; sleep "7+ days of debt" on one night under 5 h; hydration < 1.5 L escalates. And assess.ts:177/:186 turns every critical status into the finding text "critical, act now", escalating or not.

**Fix:**
- Escalate only on (a) explicit `escalateAbove/Below` with the existing strict `>`/`<` semantics; (b) persistence rules (e.g. stress ≥ 8 on 2 days, sleep debt 7 days, mood ≤ 2 on 2 days), implemented in assess.ts next to `trendFlag()` because only it has history; (c) symptom-type indicators where any critical value is an emergency (stDeviation, vision, SpO₂ ≤ 90).
- BP: 140-179 / 90-119 becomes caution with "re-check in 15 minutes"; escalate **above 180 systolic or above 120 diastolic** (AHA hypertensive crisis; matches protocols.ts:114/:121/:159 and alarms.ts:48).
- Finding text follows `escalate`, not `status`: critical + escalate → "critical: contact the flight surgeon"; critical without escalate → "outside the critical band: re-check and log". The check-in result for a single value says "single value; repeated values escalate" instead of claiming an escalation.
- Generate the Guidance "Automatic flag" table from the same rule objects so text and code cannot drift.
- Update `tests/knowledge.test.ts` **and** `tests/review-health.test.ts` (around :139-148); add boundary tests (179/119 caution, 181/121 escalate).
- Re-run the pitch-time test: the banner must still tell one honest story, ms2's single short night must not say "act now", and the STEMI drill must still escalate.

### 6.2 Light-time contracts (P1.2 + P1.3)
**Idea in one line:** care plans are approved before an emergency; emergency steps run at once; non-urgent steps carry an Earth veto window computed from the signal delay; replies written for an older situation are flagged as stale.

**Honest framing:** this makes existing practice explicit, computed and checkable: ISS medical checklists and flight rules, weekly private medical conferences, standing orders, the Navy's UNODIR convention ("unless otherwise directed"), and JPL loading about two weeks of commands before each Mars solar conjunction. Computable guidelines already exist (HL7 CPG-on-FHIR, WHO SMART). We found no public 2026 entry with pre-approved plans plus a veto deadline computed from the delay plus stale-reply detection. That is the whole claim.

**Safety rules (non-negotiable):** emergency and clinical steps are always ACT_NOW; only operational, non-urgent steps carry a veto window. Nothing runs automatically: a step "becomes due", the **crew** executes and ticks it, and the actor is recorded. Example plans are labelled "example training plan, written by the Demify team, not reviewed by a flight surgeon". No drug names, doses or amounts.

#### 6.2a Link model and switch (P1.2)
Do **not** port `missionContext.ts` as it is (its iss is 400 km, its transit is a day-dependent curve, its mars-far is the 2.67 AU conjunction geometry, it has no Mars-nearest, its type names clash). Write a new `src/lib/link.ts` with an explicit table and copy only `lightTimeS`, the constants, and `ShipClock` / `startClock` / `shipNow` / `withRate` from `origin/test:src/domain/consult.ts` (about lines 250-270). Type name `LinkProfileId`. Keep the existing `DEMIFY_MISSION` values valid.

| `LinkProfileId` | Basis | One way |
|---|---|---|
| `iss` (existing) | relay and network latency; light time is about 1.3 ms | 0.5 s (illustrative) |
| `artemis-lunar` (existing) | about 384,400 km | about 1.3 s |
| `mars-nearest` | 0.37 AU | about 3.1 min |
| `mars-transit` (existing) | fixed 750 s | 12.5 min |
| `mars-far` | about 2.5 AU, just outside conjunction (upper bound with contact) | about 20.8 min |
| `conjunction` | no contact; length a parameter (recent command pauses about 11 to 18 days; default 14) | blackout |

Physics: τ = distance_km / 299,792.458; 1 AU = 149,597,870.7 km ≈ 499.0 light-seconds. Never show live contact at 2.67 AU / 22.2 min. For Mars in general say "about 3 to 22 minutes one way".

One `linkPolicy(oneWayS) → { mode, roundTripS, earliestAnswerS }` replaces the duplicated `>= 60` branches: src/app/page.tsx:102, :114-116, :153-156; src/components/overview/escalation-banner.tsx:40, :78, :84; src/components/check-in/check-in-form.tsx:412, :436; src/components/crew/findings.tsx:44; protocols.ts:58-66 `surgeonStep()`; escalation-protocol.tsx:135-149; plus the three delay formatters (overview/format.ts:7, escalation-protocol.tsx:48, `formatCommDelay` in protocols.ts:52).

**Switch on stage:** a `?link=<LinkProfileId>` search param read on the server (pages are force-dynamic; check how Next 16 passes `searchParams`, it may be a Promise), so every server-rendered delay string changes together. The selector is plain links that keep the param. Unknown values fall back to the `DEMIFY_MISSION` profile. Avoid client-only state for the profile: EscalationBanner and the page headers are server components and would show a different delay.

**Fallback if `?link=` is not done:** a second container, `docker run -d --name demify-iss -e DEMIFY_MISSION=iss -e DEMIFY_OFFLINE=true -p 127.0.0.1:3002:3000 demify:latest`, opened in a second tab (3001 is taken by the offline gateway).

#### 6.2b Types (new pure module `src/lib/health/contracts.ts`, Zod-validated, no `node:` imports)
```ts
type StepClass = 'ACT_NOW' | 'ACT_UNLESS_VETOED' | 'GROUND_APPROVAL' | 'INFORM';
interface PlanAction { id: string; title: string; text: string; stepClass: StepClass;
  clinicalDeadlineMin?: number; fallback?: string; selfAdministrable?: boolean;
  requiresReceipt?: boolean; allowEscalateToActNow?: boolean; }
interface CarePlan { id: string; version: string /* semver */; status: 'draft'|'active'|'retired';
  approvedBy: string /* "Demify team (example training plan, not reviewed by a flight surgeon)" */;
  approvalDate: string; effectivePeriod: { start: string; end: string };
  trigger: { scenario?: ScenarioType; indicator?: IndicatorId; condition: 'critical'|'escalate' };
  action: PlanAction[]; }
interface Activation { planId: string; planVersion: string; crewId: string;
  activatedAt: number /* = the drill's server-side start time */; oneWayS: number;
  handlingS: number; marginS: number; vetoClosesAt: number; stateSeq: number; }
interface Reply { inReplyTo: string; basedOnStateSeq: number; planVersion: string;
  sentAtEarth: number; kind: 'veto'|'confirm'|'amend'; text: string; simulated: true; }
```
Field names mirror FHIR R4 PlanDefinition/ActivityDefinition: say "FHIR-aligned field names", never "FHIR-compliant". No CQL engine, no CDS Hooks. Plans are immutable; an edit is a new version. The plan fingerprint (SHA-256 of canonical JSON, 8 hex shown, called a "version fingerprint", never a signature) is computed in a server-only file (e.g. `src/lib/health/fingerprint.ts`) and passed as a prop. Derive `activatedAt` from the active drill's start time in the scenarios store, so a `?link=` switch keeps the countdown consistent without new persistence.

#### 6.2c The math (unit-tested)
- τ = one-way delay. Ground handling H = **600 s by message**, or **5 s by live voice** when τ ≤ 5 s. Margin M = max(60 s, 0.05 × round trip). All three are **labelled assumptions** on screen, not NASA figures.
- **T_veto = activatedAt + 2τ + H + M** (continuous contact; contact-window terms default to 0 so the model also fits Antarctic or maritime windows later).
- Worked values (illustrative): ISS ≈ 66 s; Moon ≈ 68 s; Mars nearest ≈ 17.2 min; Mars transit ≈ 36.3 min; Mars far ≈ 53.7 min.
- **Effective class is computed:** an ACT_UNLESS_VETOED step whose T_veto is later than its deadline D_clin becomes ACT_NOW if `allowEscalateToActNow`, otherwise GROUND_APPROVAL with fallback. With no contact, ACT_UNLESS_VETOED follows the same rule and GROUND_APPROVAL goes straight to fallback. Show both labels: "Authored: act unless vetoed. Today: act now (Earth cannot answer before the 30-min deadline)."
- **Stale reply:** `stateSeq` increments on activation, each new finding and each ticked step. A reply is STALE if `basedOnStateSeq < stateSeq` or its planVersion differs; show the diff ("written on data up to 14:35; since then 2 steps done"). A veto after a step is done shows **LATE VETO**; never dropped, never auto-reversed.
- **Receipt:** expect an automatic Earth receipt by send + 2τ + 60 s; without one show "receipt unconfirmed", and a step done without receipt is labelled "done under pre-approval; Earth had no opportunity to veto". Silence counts as consent only after a confirmed receipt.

#### 6.2d The demo plan: P-CHEST v1, "chest pain or ST-change alarm (example training plan)"
Trigger: the STEMI drill (and later stDeviation critical). Steps:
1. Stop activity, rest, call the Crew Medical Officer **[ACT_NOW]**
2. Open the onboard chest-pain checklist and follow it **[ACT_NOW]**
3. Record and send an ECG; recheck vital signs every 5 min **[ACT_NOW]**
4. Hand today's robotic-arm session (starts in 30 min) to the backup operator **[ACT_UNLESS_VETOED, D_clin 30 min, allowEscalateToActNow]**. This operational step is the one that flips: at Mars nearest T_veto ≈ 17.2 min < 30, so it waits for a possible veto with a live countdown; at Mars transit or far, T_veto > 30, so it becomes act now, with the reason shown
5. Return the crew member to normal duties, including EVA **[GROUND_APPROVAL, fallback: light duty, keep monitoring, commander and CMO decide]**

The AED and treatment live inside the onboard checklist; Demify does not list them as its own steps. Roadmap plans (slide only): VF (all ACT_NOW), hypertensive crisis, solar particle event (shelter now [ACT_NOW]; postpone today's EVA, deadline hours away, stays act-unless-vetoed even at Mars, which shows that most decisions are not time-critical; leave shelter [GROUND_APPROVAL, fallback: stay until proton flux has been below 10 pfu for 1 h, project default]).

#### 6.2e UI (behind `DEMIFY_CONTRACTS`)
- **Contract header** on the existing checklist (src/components/crew/response-checklist.tsx and emergency-console.tsx, opened through `activeProtocol()` in protocols.ts): "P-CHEST v1 · #a3f9c2e1 · example training plan, not reviewed by a flight surgeon · Earth can veto step 4 until 14:52 ship time (round trip 6.2 min + 10 min handling + 1 min margin; assumptions)". Per-step chips: authored class and today's class.
- Profile links (6.2a) visible in the header.
- Fast-forward ×60 ship clock so a Mars window plays out in under a minute; a **SIMULATED** Earth reply arrives with a red STALE badge.
- Patient-is-the-medic (CMO is the patient → steps addressed to a helper; second crew member confirms non-ACT_NOW steps) and the pre-blackout plan review (the medical twin of JPL's pre-conjunction command load) are roadmap slides.

### 6.3 Temperature and Expected Self (P1.4, only if time)
**Now:** bodyTemp (knowledge.ts ~:189) is tagged CLIN with NEWS2 as its source, but its bands are not NEWS2: nominal 36.1-37.2, caution 37.3-37.9, critical ≥ 38 (escalates). Its own `spaceflightEffect` says core temperature rises up to about 1 °C in long missions. The relative 25 % baseline rule cannot catch temperature (needs about 9 °C) or SpO₂. Measurement in the code: "Thermometer; CSA Bio-Monitor skin temperature".

**Fix (one commit, all or nothing, behind `DEMIFY_EXPECTED_SELF`):**
1. Bands use NEWS2 cut-offs (confirmed): ≤ 35.0 critical (NEWS2 3 points); 35.1-36.0 caution (1); **36.1-38.0 nominal (0)**; 38.1-39.0 caution (1); ≥ 39.1 critical (NEWS2 2 points, mapped to critical by us, labelled). Temperature escalates at ≥ 39.1 or at ≥ 38.1 persisting 24 h, not at 38.5.
2. Replace the 25 % rule with per-indicator absolute deltas (tagged App, our own): HR ±15 bpm, SBP ±20 mmHg, temperature ±0.5 °C, SpO₂ −3 points. Update the "≥ 25 %" text in check-in-form.tsx:61 and README.md:25.
3. Expected Self for temperature: expected = pre-flight baseline + w × Δ(day), Δ = +1.0 °C × min(day/75, 1), w = 0.5 (one study, Stahn 2017), plateau +0.5 °C. **Only for resting readings tagged as core or heat-flux sensor** (Stahn used a forehead heat-flux sensor); any other thermometer shows "curve not applicable" and uses baseline mode. Within expected ± 0.5 °C → "nominal: typical in-flight warming for day N (early evidence: 1 study)".
4. **Safety invariants (unit-tested):** Expected Self may only reclassify a caution raised by the App baseline rule, never a NASA- or CLIN-tagged threshold; the "typical in-flight warming" label never appears at ≥ 37.8 °C (test that 38.0 °C never shows it).
5. `evaluateValue` gets an optional context `{ missionDay, microgravity }`, passed from the server to the check-in form as props and used identically in actions.ts and assess.ts, so the preview and the saved result never disagree.
6. simulator.ts follows the same curve (its comment says 0.5-1 °C, the code adds 0.2). If 6.3 is cut, keep the simulator at 0.2 and leave the temperature baseline rule off; otherwise readings at pitch time straddle the 0.5 °C limit and flicker.
7. Curves apply only to microgravity profiles (ISS, transit). Analog and surface profiles run with curves off: the first real users (analog crews at 1 g) use baseline mode. Say so.

Roadmap slide: **SHIFT** (band moves: body mass −3 % × min(day/30, 1) ± 2 %, same device only; core temperature), **CONTEXT** (shown as "typical in spaceflight", threshold unchanged: sleep about 6.1 h on ISS, glucose, reaction time, exercise capacity), **BASELINE** (no curve: resting HR, HRV, SpO₂, mood, stress, hydration, vision/SANS, radiation). "Expected" never means "acceptable".

### 6.4 Flight recorder (post-pitch)
Append-only JSONL `<dataDir>/demify-recorder.jsonl` with a SHA-256 hash chain (`hash = sha256(prevHash + canonical(entry))`), written from a server-only module. Entry: seq, time, crew, kind (assessment, check-in, checklist tick, contract), indicator, inputs with source, status, escalate, rule and ruleset version, mission profile, one-way delay, advice text, actor. Edge-triggered (log only when a status, escalation or ruleset version changes). `GET /api/recorder?crewId=` and `/api/recorder/verify`. Until it exists, never claim "every piece of advice is logged".

### 6.5 Cause lines (post-pitch)
"Possible contributors" (at most 3) under a finding, each with presence in the time window, evidence tier (observed in spaceflight / ground or analog / clinical / NASA standard / App assumption), source and "what would rule it out", ending with "Other causes Demify does not measure: illness, medication, personal events." Wording "coincides with" or "possibly related", never "caused by". Rules: R-ACT-1 (high HR/BP/RR in the exercise slot → expected), R-CO2-1 (1-h > 3 mmHg or 7-day > 2.5 mmHg; always list "fluid shift to the head" as the competing explanation), R-SLEEP-1 (sleep ≤ 6 h → reaction lapses, mood, stress; Jones 2022; the 2-hour timing-shift trigger is an App assumption), R-SEP-1 (≥ 10 MeV ≥ 10 pfu → dose directly; sleep and stress only through the shelter procedure).

### 6.6 Radiation page corrections (P0 if quick, else post-pitch)
Tag `estimateDoseRate` coefficients "App (illustrative)" (the ×0.05 factor applies only when `mission.id === 'iss'`) and add "Estimate from GOES flux at geosynchronous orbit, not a measurement at your location. Your dosimeter is the reference." Flares are an early warning, not a dose ("protons, if any, may follow, sometimes within minutes"). Never add mSv and mGy; the OSDR EDA cross-check reads "0.31 mGy/day absorbed dose, ISS area dosimetry (OSDR, Rodent Research missions), not crew dose". Lunar surface 1.4 mSv/day (Chang'e-4, 1,369 µSv/day dose equivalent); config.ts's 1.3 has no source. Never ship `DEMO_KEY` (30 requests per hour per IP); on HTTP 429 fall back to the snapshot. Offline, OSDR search works only for the default query: snapshot 3 to 4 likely queries or hide the search box offline.

---

## 7. Verification

### After every merge
```bash
npm ci && npm run lint && npm test && npm run typecheck && npm run build
cp -r .next/static .next/standalone/.next/ && { [ -d public ] && cp -r public .next/standalone/ || true; }
DEMIFY_OFFLINE=true DEMIFY_DATA_DIR=$(mktemp -d) PORT=3000 HOSTNAME=127.0.0.1 node .next/standalone/server.js
```
(The standalone server serves no CSS or JS unless `.next/static` and `public` are copied in; it also `chdir`s into `.next/standalone`, so keep its data dir outside with `DEMIFY_DATA_DIR` (src/lib/config.ts:91). Never use `next start` with `output: standalone`.) First check that one `/_next/static/*.css` URL returns 200.

Smoke: `/`, `/crew/plt`, `/body`, `/body?crew=ms2`, `/check-in`, `/radiation`, `/research`, `/guidance` → 200; `/crew` → 307; `/crew/xyz` → 404; `/api/space-weather`, `/api/osdr/inspiration4?summary=1`, `/api/osdr/eda` → freshness `snapshot`; a POST to `/api/readings` updates the board (label DEVICE); a STEMI drill raises an alarm within 30 s and opens the checklist; with `DEMIFY_ADMIN_TOKEN=smoke` set, drill and readings POSTs without the token get 401.

### Pitch-time state (P1.0)
The server computes every simulated value and assessment from the real `Date.now()`; Playwright's clock only fakes the browser. So: a Vitest test with `vi.setSystemTime(new Date('2026-11-15T15:30:00Z'))` that asserts on `assessAllCrew()`: which crew escalate, the banner count, that the STEMI drill escalates, that no single-night or single-value finding says "act now". Take Playwright screenshots during a real 15:00-16:00 UTC window (Sat 16:00-17:00 CET is the best one) or run the container under libfaketime. Never put exact vital values in the script: they move with the clock.

### Docker (the build that goes on stage)
```bash
docker compose --profile offline build            # Sat night, Wi-Fi ON (needs the npm registry)
docker compose --profile offline down -v           # fresh volumes = the reset
DEMIFY_BIND=127.0.0.1 DEMIFY_MISSION=mars-transit docker compose --profile offline up -d demify-offline demify-offline-gateway
docker compose --profile offline ps                 # demify-offline healthy; "demify" (port 3000) NOT running
```
Then open http://127.0.0.1:3001 only. Run the smoke against it with Wi-Fi off before tagging `pitch-final`.

### Done
- **Agent done:** checks green; `pitch-final` tagged and pushed; `docs/pitch/` contains PROGRESS.md, DEMO_SCRIPT.md (speaker, driver, cues), PROJECT_PAGE.md (paste-ready), DECK.pdf (7 slides) or its source, TEAM_CHECKLIST.md; the pitch-time test passes.
- **Team does (hand over TEAM_CHECKLIST.md at 11:00):** build the image on the laptop Sat night; charger and display adapter; Do Not Disturb on, sleep off; decide alarm sound volume; browser zoom 125-150 %; bookmarks for every demo URL (with `?link=`); slides as a local PDF plus a USB copy; a 60-90 s screen recording of the whole demo saved as a local file; three timed rehearsals; submit the project page on the Space Apps site before 16:00. **Plan B:** Docker fails → play the recording; laptop fails → PDF from the USB stick on any machine.

---

## 8. The demo (about 2 minutes inside 5)

**Setup:** offline compose as in section 7, `DEMIFY_MISSION=mars-transit` (the screen then shows 12.5 min), fresh volumes, check the mission day on screen (`DEMIFY_MISSION_START` defaults to 92 days ago).

| Beat | Driver does | Speaker says (gist) |
|---|---|---|
| 1 Overview | Opens `/` | Mission day, crew status, signal delay 12.5 min. "Vital signs are simulated and labelled; space weather is a NOAA snapshot from <date>; blood data are real Inspiration4 crew data." |
| 2 Check-in | Types one out-of-range value | It is rated as you type, with its source tag (NASA / Clinical / App) |
| 3 Delay changes the advice | Clicks `?link=iss`, then back to Mars (or switches to the 3002 tab) | ISS: "request a private medical conference now"; Mars: "act first, then report" |
| 4 Light-time contract (if built and rehearsed) | `?link=mars-nearest`, starts the STEMI drill, then switches to `mars-transit`, then fast-forwards | Steps 1-3 run at once. Step 4 waits for a possible veto, 17 min at Mars nearest; at 12.5 min one way it becomes act now because Earth cannot answer within 30 min. A simulated Earth reply arrives marked STALE. "Emergency steps never wait; Earth keeps a veto over what can wait." If not built: show the delay-aware checklist and say "our next build", then the slide |
| 5 Real data | Opens Inspiration4 biomarkers and the radiation dose budget | Real crew biomarkers (OSDR OSD-569, OSD-575); dose budget against NASA's 600 mSv career limit |

Optional proof for "any device or gateway that can POST our JSON": one rehearsed `curl` to `/api/readings` (on the laptop itself, since the app binds to 127.0.0.1), and the board updates.

---

## 9. The pitch

### Five-minute plan (local judges)
| Time | Who | Content |
|---|---|---|
| 0:00-0:25 | Speaker | Hook: "On the way to Mars, a message to the flight surgeon takes about 3 to 22 minutes to arrive, depending on where the planets are, and as long to come back. Crews already train for that with checklists and flight rules. Demify builds the delay into its escalation advice." |
| 0:25-0:45 | Speaker | User and problem: one crew, the Crew Medical Officer may be the patient, five hazards (radiation, isolation, distance, gravity, closed environment) |
| 0:45-2:45 | Driver + Speaker | Demo, five beats (section 8) |
| 2:45-3:20 | Speaker | Validity: every threshold carries a visible source tag (NASA, Clinical, or App-derived, our own and labelled); tests and CI; research prototype |
| 3:20-4:30 | Speaker | **Business, 60-75 s, one canvas slide** (section 11) |
| 4:30-5:00 | Speaker | Three sentences + the ask: an analog-mission pilot partner and a space-medicine advisor |

3-minute fallback: hook 20 s, problem 15 s, demo 80 s, trust 30 s, business 25 s, close 10 s. Cut any demo beat that runs over 30 s in rehearsal. Q&A split: driver answers technical and data questions, speaker answers business, regulation and science.

### Three sentences
1. Built: "When Earth is minutes away, Demify's light-time contracts run emergency steps at once and give Earth a veto window, computed from the signal delay, over the steps that can wait. Our example plans are team-written and not yet reviewed by a flight surgeon." Not built: "We designed light-time contracts: plans approved in advance, emergency steps at once, and an Earth veto window computed from the delay for what can wait. It is our next build."
2. "Every rating shows its source: a NASA standard, a clinical guideline or our own rule, labelled as ours." (Add "and every piece of advice is logged with its rule version" only once 6.4 exists.)
3. "It runs offline with cached snapshots of its outside data, and shows real Inspiration4 crew blood biomarkers from NASA's open science archive next to simulated crew vitals."

### Criteria mapping
Impact: emergency steps never wait on Earth; first analog users targeted for 2027. Creativity: light-time contracts, Expected Self. Validity: source tags, tests, honest scope. Relevance: show the challenge objectives (indicators, guidance, clickable body figure, charts, colour coding, prompts to measure) within the demo. Presentation: rehearsed hand-off, large font.

### Comparison lines (never name other Space Apps teams)
- Instead of any "first/only": **"Of the 59 agency, commercial and research systems in our review, we found none that combines a visible source tag on every threshold, escalation that adapts to the signal delay, and offline operation in one open tool."** Use "offline operation" only after the OSDR search is snapshotted or hidden offline (6.6).
- **NASA/Google CMO-DA:** "CMO-DA answers a crew member's question once something already hurts; early tests on simulated cases scored 74 to 88 % (secondary reporting), and since June 2026 it runs offline in ground tests. Demify is built to rate every reading as it arrives (today's vitals are simulated and labelled), and each alert traces to a visible rule and source. A free-text AI answer has no fixed rule you can check line by line; each of these does." Never call CMO-DA cloud-only, flying, peer-reviewed or open source (only its RamaLama runtime is).
- **Oura + Booz Allen (Ax-4, launched 25 June 2025):** "flew a demo that processed ring data on the station without Oura's cloud; no results published. Demify takes readings from any device or gateway that can POST our JSON, and adds symptoms, radiation and sourced thresholds."
- **Astroskin (Hexoskin/CSA):** sensor shirt on the ISS since 2019; had a six-month CSA Phase 0 for Gateway crew monitoring (Nov 2024 to May 2025); Gateway paused March 2026. "A garment like this could feed Demify."
- **ARCHeR:** NASA's Artemis II study (flight 1-10 April 2026) with wrist actigraphs; results not yet published. A data source, not a rival.
- **Apple Vitals / Oura / WHOOP:** personal baselines already exist, so never present baselines as new. WHOOP's FDA warning letter (14 July 2025, closed 17 June 2026 after wording and dial changes) is why we say "research prototype, not a certified medical device".
- **Biofourmis:** its Biovitals Analytics Engine received FDA 510(k) clearance in 2019, showing this category can be certified later.
- **Current Health:** Best Buy wrote down USD 475 M on its health unit in early 2025 and sold Current Health back in June 2025. Earth remote monitoring is crowded; we start where the hospital and the cloud are missing.
- **Spacelabs:** founded in 1958 to build astronaut vital-sign monitoring for NASA and the US Air Force; now sells hospital monitors. Space monitoring can become an Earth business.

### Q&A (one sentence each)
- *Medical device?* "Research prototype, not a certified medical device. Under EU MDR Rule 11 and Swiss MedDO the triage functions would be class IIa to IIb, possibly III for cardiac emergencies, and pre-approved care plans would likely raise the class further; we would confirm with a notified body before any pilot. We give no drug doses."
- *Are the data real?* "Inspiration4 biomarkers, NOAA space weather and OSDR dosimetry are real; vital signs are simulated and labelled until a device posts readings."
- *Why not NASA's own tools?* "ISS checklists, flight rules and standing orders are the precedent; we make the delay explicit, computed and checkable. We have not yet compared our design with NASA's 2024 EIMO concept of operations."
- *Business with about 25 people a year in orbit?* "Astronauts give credibility, not revenue: analog crews first; research pilots and agency contracts pay first."
- *Does the veto delay care?* "No. Emergency steps run at once; only steps that can wait carry a veto window, and the flight surgeon remains the medical authority."
- *Why trust two students?* "Every rule is open and names its source, and we start in analog missions, not in space."

### Global 7-slide deck (v1 by Sun 14:00, linked from the project page)
1. Title + "research prototype, not a certified medical device". 2. Problem: about 3 to 22 min one way to Mars; the CMO may be the patient. 3. Light-time contracts diagram (or "our next build"). 4. Two screenshots (escalation, check-in with source tags). 5. Science and data: 20 indicators with source tags, Inspiration4, real vs simulated. 6. What we add to existing approaches (no team names). 7. Path to crews (analogs 2027 if accepted, agencies, open source). 8 slides is over the limit. Save as `docs/pitch/DECK.pdf` on the pitched branch (public via GitHub); the local deck reuses it plus the canvas slide.

### Project page checklist (`docs/pitch/PROJECT_PAGE.md`)
2-3 sentence summary; public link without login pointing to the **`pitch-final` tag or the Project-2-Phase-1 branch**, not the bare repo (main is empty); NASA data with links (OSDR OSD-569, OSD-575, OSDR ISS dosimetry, HRP risks); other data (NOAA SWPC); each AI tool used, what it did, and that the team reviewed the output; LICENSE present; English; no NASA logos; demo link (DECK.pdf or a ≤ 30 s video).

---

## 10. Regulation and exact wording

**`DISCLAIMER_SHORT`:** "Research prototype, not a certified medical device."

**`DISCLAIMER_LONG`** (footer on every page + first-run acknowledgement): "Research prototype – not a certified medical device. Not for diagnosis, treatment or emergency decisions. Vital signs are simulated unless labelled REAL or DEVICE. Thresholds come from NASA standards, clinical guidelines or our own project rules, and each carries its source tag. In a real situation follow your mission's medical procedures and contact your flight surgeon or emergency service." (Use typographic quotes or none inside TS strings.)

**Intended purpose** (README, About, closing slide, word for word): "Demify is open-source research and training software for analog and simulated space missions. It records self-reported wellbeing data and readings from connected sensors, shows them next to public space-weather and NASA open-science data, and indicates which reference ranges (published or project-defined, each tagged) a value falls outside. It is intended for research, education and mission-operations training with adult volunteers who have given informed consent. It is a research and training simulation: it shows how published and project-defined thresholds would flag values and how pre-approved procedures would be timed under signal delay. It must not be used for the medical care of any individual."

**Training framing everywhere:** monitor = "simulated training monitor"; alarms = "training alarms"; banner = "Training: in a real mission this prompts a call to the flight surgeon"; plans = "example training plan"; pitch sentence 1 describes the concept for a future certified version.

**Class slide:** "Today: research prototype, not placed on the market, not a certified medical device. Target product: medical device software under MDR Annex VIII Rule 11 / Swiss MedDO Art. 15, expected class IIa to IIb (vital-sign monitoring = IIb), possibly III for cardiac-emergency escalation; pre-approved care plans would likely raise the class; to be confirmed with a notified body."

**Other rules:**
- Free or open source does not take software out of the MDR; what keeps the prototype out is no commercial supply and a research and training intended purpose (which counts slides, README and UI).
- **AI Act:** the engine is rule-based, not an AI system; never "AI-powered" or "AI triage". The Digital Omnibus has been in force since 27 July 2026; an ML component in an MDR class IIa+ device would be high-risk under Art. 6(1) from 2 Aug 2028.
- **CRA:** pure SaaS is outside it; commercially supplying the downloadable or self-hosted software (the Docker image) is inside. **PLD:** strict liability for products placed on the EU market after 9 Dec 2026, once commercial.
- **Privacy:** Swiss revFADP plus the Human Research Act for any study with identifiable health data; pseudonymised is not anonymised. GDPR only if people located in the EU are monitored. Design: pseudonymous crew IDs kept apart from identities, encryption at rest, Swiss hosting, export and delete, consent capture, an audit trail free of direct identifiers, a DPIA before any real crew data.
- **Ethics in the product:** the crew member owns the data and sees everything first; outputs are never used for crew selection or careers; "Advice, not a decision. The commander and the crew member decide."
- **Trademark:** IGE e-trademark CHF 350 for 3 classes (9, 42, 44) after a clash search (Swissreg, WIPO, EUIPO). Use ™ or nothing, never ®.
- **Compliance roadmap slide:** (0) now, CHF 0: wording, licence, disclaimer, attribution. (1) Nov 2026 to Q1 2027: Asclepios proposal, ethics route, DPIA, trademark. (2) 2027: analog study, publish usability and feasibility, stay research prototype. (3) 2028+ only if certifying: ISO 13485, IEC 62304, ISO 14971, IEC 62366-1, IEC 81001-5-1, notified body, EU authorised representative (needed since the EU-Swiss agreement lapsed in May 2021), Swissmedic registration. No cost figure until notified-body quotes exist.

---

## 11. Business model (version 2.1; full text in BUSINESS_MODEL.md on test)

**Line:** "Built to space standards, proven with Earth crews."

| Flipchart question | Answer |
|---|---|
| People to orbit per year | 21 to 28 (21 in 2023, 28 in 2024, 28 in 2025, about 21 in 2026); about 10 in orbit at any time (7 ISS, 3 Tiangong); record 19 (Sept 2024) |
| Demify users 2027 | **0 astronauts.** Target, only if our Asclepios VII proposal is accepted: 10 to 20 analog crew (Swiss lunar analog, summer 2027, crews of 6 to 10). MDRS only through a crew whose institution provides ethics review (about USD 2,000-3,500 per person) |
| 2028-2029 | Goal: an in-flight research demonstration through a Swiss partner with ISS experience. Not a commitment |
| 2030-2035 | 4 to 10 astronauts a year if one operator adopts it (estimate) |
| 2040+ / 2050 | 10 to 30 a year: a vision, not a forecast |
| Benchmark | Hexoskin: founded 2006, first CSA contract 2011, Astroskin on the ISS since Jan 2019, about 12 years |
| Earth users | Analog and polar research teams first (grant-funded); 34 national Antarctic programmes (about 1,100 people in winter, 4,400-5,000 in summer); offshore through medical providers (UK about 24,000 FTE offshore workers in 2025; International SOS supports 900+ remote sites) |
| Market (bottom-up; CHF 40 per person per month and 100 % share are estimates) | All Antarctica about CHF 1.1 M a year; UK offshore about CHF 11.5 M a year. An honest niche of a few million CHF a year |
| Value for NASA | Image: an open, checkable research and training tool built by students on NASA open data. Value: NASA prices crew time at about USD 130,000 per hour (2021 price list), so any tool must replace parts of existing checks; this is a price, not a saving we claim. Students: open code to learn from. Cost: NASA pays nothing; we seek a no-money collaboration (data, flight-surgeon feedback) |
| Revenue, most realistic first | (1) agency and research contracts; (2) paid research pilots, CHF 5,000-15,000 per study (estimate); (3) integration and support per programme; (4) site licences, CHF 6,000-15,000 per site per year, only after certification and through remote-medicine providers (estimate). One McMurdo evacuation flight cost about USD 286,000 |
| Costs, 3 years (estimates) | Y1 81,600 · Y2 228,100 · Y3 299,600 = **CHF 609,300** (founders part-time in Y1, medical advisor 20 % from Y2, regulatory strategy then quality system, pilots, security, insurance, 10 % contingency). Certification comes after year 3 and is the dominant future cost; amount only from notified-body quotes |
| Money in | Base case: Venture Kick Stage 1 grant CHF 10,000 + pilots and integration CHF 76,000 = **CHF 86,000**, gap **−523,300**. Funded case without any ESA money: + Venture Kick Stages 2-3 CHF 140,000 as **convertible loans** = **CHF 226,000**, gap **−383,300**, which ESA BIC Switzerland (up to EUR 200,000 if selected; never converted to CHF) would largely close. ESA Kick-Start is only "if eligible, being checked with SERI; 75 % funded, we co-fund 25 %". No break-even within 3 years, said openly |
| Open source | MIT now; Apache-2.0 later only with every contributor's consent. Ours: the name (trademark), the validated threshold library, the certified build, being the maintainers |

**Canvas (one slide):** Segments: analog and polar research teams → national polar programmes → offshore through medical providers; agencies and commercial operators as research partners. Value: rates each value against sourced thresholds and the person's own baseline, adapts who to call and when to the distance to help, open, checkable, offline, any device or gateway. Channels: Space Apps, Asclepios, MDRS, Swiss space partners, ESA, later remote-medicine providers. Relationships: research partnership, open-source community, support contracts. Revenue: as above. Key activities: software, threshold library, pilots under ethics approval, regulatory path. Key resources: the open engine with sourced thresholds, tests, team, trademark. Partners: space-medicine advisor, Swiss university or hospital, device makers, analog and polar programmes, NASA and NOAA open data. Costs: people, advisor, regulatory, pilots, security, insurance.

**Funding ladder:** Venture Kick Stage 1 CHF 10,000 grant (no company needed) → Stages 2 and 3 CHF 40,000 and 100,000 as convertible loans (5 %), Stage 3 needs a company → Swiss GmbH (CHF 20,000 paid in + about CHF 2,000-6,000 fees; not before Stage 3 or ESA BIC) → ESA BIC Switzerland, up to EUR 200,000 (Venturelab), Swiss company under 5 years (possibly only by contract signature; ask Venturelab), the 31 Oct 2026 cut-off has passed → SPI Exploratory Grant only with a postdoc or professor as main applicant. Innosuisse Initial Coaching is a voucher up to CHF 10,000 with accredited coaches, not cash.

**Next 90 days slide:** "We are submitting a proposal to the Asclepios VII Call for Projects (lunar analogue mission, summer 2027). Venture Kick Stage 1 (CHF 10k grant). Innosuisse Initial Coaching (coaching voucher up to CHF 10k)." Use "submitted" only once true. The team's own Monday-to-Friday outreach list is in BUSINESS_MODEL.md and RESEARCH.md lines 584-693; you may draft emails into `docs/pitch/`, never send them.

---

## 12. Science and facts sheet

Confirmed in RESEARCH.md unless marked *(unconfirmed)*.

**Light time and operations**
- Mars one way about 3 to 22 min; Moon about 1.3 s. Mars solar conjunction command pauses: about 11 days (2019), about 14 days (2023), about 2 to 3 weeks (Dec 2025-Jan 2026, dates conflict).
- Mosier and Fischer, Human Factors 65(6):1235-1250, 2023: in NASA analog simulations (NEEMO, HERA), crews trained in delay protocols (thread labels, send time and earliest reply on each message) rated communication under delay on a par with no-delay days. Not "NASA-funded", not "adopted in flight".
- CMO training: "on the order of 15 to 40 hours, depending on source".
- CHAPEA Mission 2: a second year-long NASA Mars analog with Mars-like delays; ended about 31 Oct 2026 *(secondary)*. Quote no delay maximum.

**Radiation**
- Mars cruise about 1.8 mSv/day (Zeitlin 2013, low-to-moderate solar activity, not a constant). Transit to Mars and back about 660 mSv dose equivalent (0.66 ± 0.12 Sv), **comparable to** NASA's 600 mSv career limit (effective dose, same for all ages and sexes, NASA-STD-3001). Solar particle events were about 5 % of the cruise dose.
- NOAA S1 starts at ≥ 10 MeV ≥ 10 pfu. Paraphrase the S3-S5 astronaut effects *(only third-party copies seen)*.
- Snapshot 14 Nov 08:52 UTC: ≥ 10 MeV flux about 0.2 pfu (quiet), 5 % S1 chance 14-16 Nov.
- Crew Active Dosimeter: "Demify accepts time-stamped personal dose like the CAD records". Never "integrates with". CAD on Artemis II *(per Mirion only)*.

**Cabin air:** CO₂ 1-hour limit 3 mmHg (NASA-STD-3001 Vol. 2, V2 6004); 7-day target below 2.5 mmHg (OCHMO-TB-004); headache odds roughly double per +1 mmHg (Law 2014).

**Expected Self evidence**
- Body mass: 25 ISS crew, −4.4 % (BMMD) and −2.8 % (SLAMMD) against a pre-flight scale; 2-5 % in the first month, then stable (Zwart 2014). Devices differ by about 1.1 kg: same device only.
- Core temperature: rises about 1 °C over about 2.5 months (Stahn 2017, forehead heat-flux sensor; sample size *unconfirmed*); exercise peak about 1.39 °C higher than on the ground, above 40 °C in some individuals.
- BP: −8 to −10 mmHg over 24 h (Norsk, 8 men; *not re-checked*) versus no change (Hughson 2012, 6 men): conflicting and all-male.
- Sleep: ISS crews average about 6.1 h (Barger 2014, 21 astronauts): common, not healthy.
- SANS: Frisén grade 1 edema in about 17 % of retinal images (62 crew); OCT shows disc edema developing in about 70 % of 6-month ISS crew. Never hide vision symptoms.
- Reaction: early-flight slowing is typical (Dev et al., Nov 2024, 25 astronauts; *not re-checked*), no millisecond figure. PVT-B: 3 min, lapse ≥ 355 ms (Basner, Mollicone and Dinges 2011); inter-stimulus interval 1-4 s *(2-5 s also reported)*; false start < 100 ms is a common PVT convention. Sleep ≤ 6 h linked to slower Reaction Self Test results (Jones 2022).
- Post-flight exercise capacity −15 % on day 1 after landing, within 2 % by day 30 (Moore 2014, n = 14).
- Third-quarter effect: often cited, not supported (Antarctic meta-analysis, Hawkes and Norris 2017).

**Other:** WHOOP warning letter 14 Jul 2025, closed 17 Jun 2026. Artemis II 1-10 April 2026 (Wiseman, Glover, Koch, Hansen). Space Apps 2025: 18,860 teams, 11,500+ projects; SpaceGenes+ won Best Use of Science 2025 *(details unconfirmed)*. 2024: 940+ global nominees, 40 finalists.

### Missions to 2050: an unverified planning list (verify each date before a slide)
Nov 2026 Shenzhou-24 · Jan 2027 Ax-5 · early 2027 Haven-1 (Vast) · summer 2027 Vast ISS mission; Artemis III docking test in Earth orbit · 2027 first crewed Gaganyaan · early 2028 Artemis IV, first Moon landing since 1972 · late 2028 Artemis V, start of the Moon base · 2028 Starlab / Orbital Reef (disputed); first Indian station module · before 2030 Chinese Moon landing · about 2030 Russian station · 2030-2031 ISS retired · 2029-2036 NASA Moon base (Gateway paused March 2026) · 2032 Haven-2 · 2035 Indian station · 2040 Indian on the Moon (goal) · 2040s Mars, no official year. Pitch use: until 2030 few people and short trips; the 2030s bring Moon bases and long stays, where crew autonomy matters.

---

## 13. Master do-not-claim list (check every slide, UI string and README line)

**Product state**
- Light-time contracts, care plans, veto windows, the flight recorder or cause lines as built, unless merged and shown in the build on stage.
- The delay as "live": it is a profile constant (Project-2) or an illustrative trajectory (test). "Mars delay is 22 minutes" while the screen shows 12.5.
- Test-branch features (earliest-answer ledger, reaction test, go/no-go, storm shelter, `/api/v1`, SQLite audit) as part of the pitched build.
- Rule versioning or advice logging before 6.4 exists; on test the audit log covers only edits to readings.
- "Every threshold has a published source": some are App-derived; say "every threshold carries a visible source tag".
- "Watches continuously": vitals are simulated until a device posts readings. "Works with any device": say "any device or gateway that can POST our JSON". "Fully offline" while OSDR search fails offline.
- Accuracy, detection rates, confidence percentages, "10 times better" or "zero delay"; the 152 vs 8 and 19 vs 17 scratch experiments were circular on simulated data.
- "The crew never waits" without "for emergency steps".

**Regulation and branding**
- "Not a medical device", "decision support", "CE-marked", "MDR/MedDO compliant", "Swissmedic approved", "FDA cleared", "clinically validated", "medical-grade", "diagnoses", "detects heart attack", "early warning", "real patient monitor", "clinical alarms".
- "Outside the MDR because it is free or open source". "MDCG 2025-4 covers our GitHub release".
- "AI-powered" / "AI triage".
- "GDPR compliant", "GDPR applies to our Swiss pilot", "CRA applies to our hosted service", "revFADP compliant" before a DPIA. Ethics "category A" as settled; "ethics approval obtained".
- "Open source" for a branch without a LICENSE.
- "Demify®" / "registered trademark".
- "NASA-approved", "NASA partner", "endorsed by NASA", NASA logos, "NASA-inspired/themed is allowed", "thresholds certified by NASA" (say "taken from NASA-STD-3001 or NASA OCHMO briefs and cited").
- Any drug name, dose or amount in advice; "the software executes" a step (the crew executes, the software tracks).
- "Signed" or "approved by a flight surgeon" for the example plans; the hash as a signature.
- Silence after the veto deadline as consent without a confirmed receipt.
- Linking Demify to the Crew-11 evacuation (Jan 2026; condition undisclosed, a heart attack was ruled out).

**Firsts and competitors**
- "First" or "only" anything: pre-approved care (standing orders, ISS checklists and flight rules, UNODIR, JPL pre-conjunction loads, CPG-on-FHIR, WHO SMART); offline astronaut AI (CMO-DA ground tests, Ax-4 edge demo); personal baselines (Apple, Oura); audit ledgers (other 2026 teams have a hash-chained ledger and a "flight recorder" archive); real NASA data (others use OSDR RadLab, GOES, Apollo 15); "only open-source astronaut health tool". Claim only "real Inspiration4 crew blood biomarkers (OSDR OSD-569 and OSD-575)".
- That NASA's 2024 EIMO ConOps lacks our approach (say "not yet compared"); any autonomy level or quote from it.
- CMO-DA as cloud-only, flying, peer-reviewed, open source, or using a named model. The Ax-4 Oura demo as a proven result. ARCHeR results. Astroskin going to Gateway; Gateway as a market.
- Current Health still owned by Best Buy or FDA-cleared; the 161 layoffs at Current Health (they were Best Buy Health staff). Biofourmis status in 2025-26.

**Science**
- "Space fever" or 38 °C as normal; BP falls in all astronauts; resting HR drops in space; HRV reliably falls; the third-quarter effect as established; any in-flight SpO₂ value; µm figures for optic-nerve changes; post-landing +5-6 bpm; a Stahn sample size; "1.84 mSv/day"; the Mars transit dose "exceeds" the career limit; 600 mSv as per mission or in mGy; flares irradiate the crew; Demify measures crew radiation dose; NOAA S3-S5 wording verbatim; a Vol. 2 revision letter; lunar 1.3 mSv/day as sourced; OSDR EDA 0.31 mGy/day as crew dose; "caused by" in any cause line.
- Expected Self as a personalised prediction or validated (say "what spaceflight typically does to crews on mission day N, starting from your own baseline"); "Demify does not page for what spaceflight does to everybody".
- Demify's 5-step autonomy scale as NASA's or as NASA-STD-3001 Levels of Care; "more autonomy improves outcomes".
- The browser reaction test as "Reaction Self Test", validated or equivalent to the PVT-B.

**Business and funding**
- Partnership, acceptance or endorsement by Asclepios, UZH Space Hub, HSLU/BIOTESC, EPFL, SERI, ESA, NASA or SPI. BIOTESC is an ESA ISS user support centre, not a space-medicine partner.
- Asclepios as a customer or funder; its 29 Nov closing date as confirmed; students able to apply without an institution; 2027 analog users as certain.
- Venture Kick Stage 2 as CHF 50,000, all stages as grants, or a minimum age. ESA BIC open now, EUR 500,000, in CHF, or requiring matching funds. Switzerland in ESA Kick-Start; Kick-Start covering full cost. SPI open to students or open now. Concordia in 2027.
- The Innosuisse voucher as cash; pseudonymised data as anonymous; the analog study as exempt from the HRA; any certification cost or ethics fee; CHF 600 register fee.
- Judging weights, a 1-to-5 scale, the 3 Dec / 17 Dec / January announcement dates, a local nomination cap, a "Most Inspirational" award, 1,294 nominees (2025), 9,996 submissions (2024).
- Quoting the official challenge text from memory.

---

## 14. Still unconfirmed (check only if it matters for a slide)
The 2026 submission deadline time; pitch length and local rubric; Asclepios VII closing date and student eligibility; ESA BIC pre-incorporation; Swiss ESA Kick-Start participation; whether a pre-approved step that "becomes due" changes the MDR risk class (ask a notified body); exact NOAA S-scale astronaut text; NASA-STD-3001 Vol. 2 revision letter; DONKI SEP route and field names; Stahn 2017 sample size; PVT-B inter-stimulus interval.

---

## 15. Reporting to the team
Short, plain English, no jargon. Each report: what is done, what is verified and how (paste the check output), what is not done and why, the current tag, and the next decision you need from them. For anything they must do on their laptop, give one step at a time: the exact command, then what they should see, then wait for "done".
