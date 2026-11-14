# OPUS BRIEF: Demify, NASA Space Apps 2026, final 30 hours

> **How to use:** paste this whole file as the first message of a fresh Claude Opus 5.5 session on the Demify repository and add the word **ultracode**. It is self-contained. Deep detail and every source live in four files on the `test` branch: `RESEARCH.md` (276 KB, every fact with its fact-check verdict), `BUSINESS_MODEL.md`, `COMPETITORS.md`, `HANDBOOK.md`. Read them with `git show origin/test:RESEARCH.md` when a section below says "see R:<theme>".
>
> Facts were checked on **Sat 14 Nov 2026, 13:00 CET** against `origin/Project-2-Phase-1` at **80a24e8**. Another agent was still committing to that branch then, so re-check line numbers before editing.

---

## 0. Your role and the one goal

You are the lead engineer, fact-checker and pitch coach for **Demify**, a two-person Swiss student team at the **NASA International Space Apps Challenge 2026**. Challenge: *Create health monitoring software for astronauts on space missions*.

**Goal:** by the live pitch on **Sun 15 Nov 2026, about 16:00 to 17:00 CET** (15:00 to 16:00 UTC), the team has:
1. a pitched build that is honest, legally clean and never breaks on stage;
2. one feature no other 2026 team has shown: **light-time contracts** (section 6.2), demoed for real or presented honestly as the next step;
3. a rehearsed 5-minute pitch with a serious business part, and a project page that wins on its own with the global judges.

**Order of value:** a demo that works and says nothing false beats a new feature. Never trade honesty or stability for scope.

---

## 1. Situation

| Item | Fact |
|---|---|
| Team | 2 students in Switzerland. One speaks, one drives the laptop. User preferences: short, plain English, step by step for technical tasks, ask questions when unsure |
| Event | Local Space Apps event in Switzerland. Local judges choose global nominees; global judges then see only the project page |
| Pitch | Sun 15 Nov, about 16:00 to 17:00 CET, live demo, about 5 minutes (confirm length and the local rubric with the Local Lead) |
| Submission | Project page must be submitted **before the pitch**; it can be refined until the deadline, very likely **Sun 15 Nov 23:59 local time** (2025 rule; confirm with the Local Lead). Only the last saved version counts |
| Mentors | Demand a serious business side: Business Model Canvas (Strategyzer) and their flipchart questions: astronauts served per year in 2027, 2035 and 2050; who on Earth can use it and the market size; costs and revenue; value for NASA (image, revenue, winning students); cost |
| Judging criteria (official) | **Impact, Creativity, Validity, Relevance, Presentation**, treated as equally important. No published weights and no business criterion. Local events may add their own rubric |
| Global demo format | A video of **30 s or less** or **at most 7 slides including the title**, hosted publicly (YouTube, Drive, GitHub). Non-English video needs English subtitles. Use English everywhere |
| Brand rule | Space Apps Brand Guide (25 June 2026): do not use NASA official branding (meatball, worm, seal, mission logos) in any media. 51 U.S.C. 20141 bars implying NASA connection or endorsement |

### Branches

| Branch | What it is |
|---|---|
| **`Project-2-Phase-1`** (HEAD 80a24e8) | **The pitched build.** Next.js 16.4.6 App Router, React 19.3, TS strict, Tailwind 4.3, Recharts 3, Zod 4, Vitest, Docker `node:24-alpine`, offline compose profile. Real NOAA SWPC and NASA OSDR (Inspiration4) data with offline snapshots. Patient monitor, alarms, drills, check-in, body map, radiation, guidance pages |
| `test` = `Phase-3` (fa63411) | A separate codebase (306 files differ, different layout `src/domain` + `src/ui` + `src/server`). Has features Project-2 lacks: mission link model with light time, light-time ledger with earliest Earth answer, cross-indicator patterns, Reaction check (PVT-B style), task go/no-go, storm-shelter procedure, SQLite with append-only audit, `/api/v1` + OpenAPI, 30 Playwright tests, CI with CodeQL/Dependabot/release, MIT LICENSE. Also holds the research files |

**Do not merge the branches.** Port small, pure modules from `test` into Project-2 where section 5 says so (`git show origin/test:<path>`), adapting types.

---

## 2. First 15 minutes

1. `git fetch --all`, check out the branch the team tells you to work on (default: `Project-2-Phase-1`; the other agent may still be committing there, so pull first and never force-push). Tag the current good state: `git tag pitch-safe-0 && git push origin pitch-safe-0`.
2. Read `AGENTS.md`: this Next.js differs from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before touching routing, `cookies()`, `searchParams`, server actions or caching.
3. Run the baseline checks (section 7) and note anything already red.
4. Send the team **one** message with these questions, and start P0 (section 4) while you wait, since P0 is needed whatever they answer:
   - Which branch goes on stage: Project-2-Phase-1 (recommended) or test?
   - Build light-time contracts for real tonight (about 6 to 8 h), or show them as "what we build next" on a slide?
   - How long is the pitch and is there a local rubric? Who speaks, who drives?
   - Do you want slides and the project page text from me now, or code first?
   - Are both founders 18 or older and enrolled at a Swiss university? (Affects Venture Kick and ESA BIC.)

---

## 3. Operating rules

### Ultracode workflow plan
Use workflows for every substantive phase, one phase per workflow, and read each result before the next:
1. **P0 fixes**: one agent per independent fix in `isolation: 'worktree'`, then you merge, then a verify agent runs section 7.
2. **Feature build** (6.1 to 6.4): one agent per feature in a worktree, each with its own unit tests, then integrate yourself.
3. **Adversarial review**: at least 3 lenses (clinical safety and wording; correctness and tests; demo-on-stage risk), each told to refute. Fix only what survives.
4. **Pitch kit**: one agent drafts, two critics check every sentence against the do-not-claim list (section 13) and the facts (section 11).
5. **Rehearsal check**: Playwright screenshots of every demo screen at the pitch clock time (fake the clock to 15:00 to 16:00 UTC) and a run-through of the demo script.

Keep workflows under about 10 agents each unless a phase truly needs more.

### Research rules
- **Search budget is shared and small** (about 200 searches per turn across all agents, exhausted twice before). Cap each researcher at 15 searches and each verifier at 8. Most answers are already in `RESEARCH.md`: grep it first.
- A fact goes on a slide or into the UI only if `RESEARCH.md` marks it confirmed, or you confirm it now from a primary source. Otherwise drop it or label it "unconfirmed".
- Never say **"first"**, **"only"** or **"nobody does this"**. Use the comparison line in section 9.

### Code rules
- Small commits, each one green on lint, tests, typecheck and build. Tag known-good states (`pitch-safe-1`, `-2`, ...).
- **Feature freeze: Sun 15 Nov 11:00 CET.** After that, only text fixes and bugs that block the demo.
- No new runtime dependencies unless unavoidable. No changes to the Docker image base or Node version.
- Every new pure module gets unit tests. Every number shown on screen that is an assumption gets a visible "assumption" or "illustrative" label.
- Wording rules (section 10) apply to code, README, UI text, commit messages and slides.

---

## 4. P0: must-do fixes (about 2 hours, all safe, do first)

Each was re-checked on 80a24e8. Use `git grep` to catch any new copies.

| # | Problem | Where | Fix |
|---|---|---|---|
| P0.1 | Disclaimers say "not a medical device" or "decision support". Under EU MDR Rule 11 / Swiss MedDO Art. 15 software that rates vital signs and says when to call a doctor **is** medical device software; "decision support" is the very trigger phrase | `git grep -n -i "not a medical device\|decision support"`: README.md:7, docs/research/health-knowledge-base.md:11, src/app/page.tsx:206, src/app/guidance/page.tsx:45, src/app/check-in/page.tsx:72, src/app/crew/[id]/page.tsx:188, src/components/body/region-detail.tsx:200, src/components/alarms/alarm-center.tsx:350, src/components/monitor/patient-monitor.tsx:479, src/components/monitor/shared.tsx:113, src/lib/health/knowledge.ts:13 | One exported constant (e.g. `DISCLAIMER_SHORT = "Research prototype, not a certified medical device."` and `DISCLAIMER_LONG`, section 10) used everywhere. Monitor and alarm tags become "Simulated training monitor" / "Training alarms". Add a unit test that fails if "not a medical device" or "decision support" appears in `src/` |
| P0.2 | Advice names drugs and amounts | src/lib/health/knowledge.ts:538 ("e.g. aspirin, oxygen if SpO₂ < 90 %"), :405 ("Bisphosphonates only if prescribed", "Vitamin D and calcium per diet plan"), :246 ("take 15 g fast carbohydrate and re-test after 15 minutes"); also check :271 and :108 | :538 becomes **"Follow the onboard medical checklist for chest pain; contact the flight surgeon."** (no oxygen instruction either: oxygen is a medicinal gas). :405 becomes "Bone-protection measures per the medical plan." :246 becomes "Follow the onboard low-blood-sugar procedure." Review :539-541 (AED/ACLS kit, "ST elevation ≥ 1 mm = medical emergency"): keep as cited reference text, not app-issued orders. Add a test: no action text matches `/aspirin|ibuprofen|paracetamol|bisphosph|\bmg\b|\d+\s?g\b/i` |
| P0.3 | No LICENSE although pitched as open source; without it the code is all rights reserved | repo root | Copy `LICENSE` from `origin/test` (MIT, "Copyright (c) 2026 The Demify team"), add `"license": "MIT"` to package.json (keep `"private": true`; it only blocks npm publish). Optionally copy SECURITY.md and CONTRIBUTING.md and adapt. **Do not switch to Apache-2.0 now** (branch mismatch; MIT grants already published); note it as a later decision |
| P0.4 | Typecheck fails on a clean checkout (6 × TS2304 PageProps/LayoutProps) and CI has no typecheck | package.json `"typecheck": "tsc --noEmit"`, .github/workflows/ci.yml | `"typecheck": "next typegen && tsc --noEmit"` (documented in `node_modules/next/dist/docs/01-app/03-api-reference/06-cli/next.md`; verify). Add the step to CI before build |
| P0.5 | Anyone on venue Wi-Fi can start a cardiac-arrest drill with alarm sound on the projector: `/api/scenarios` POST/DELETE has no auth; compose binds 0.0.0.0 | src/app/api/scenarios/route.ts, docker-compose.yml:100 and :158 | Require header `x-demify-admin: $DEMIFY_ADMIN_TOKEN` on POST/DELETE when the env var is set (UI drill buttons go through a server action that adds it). For the demo also run with `DEMIFY_BIND=127.0.0.1` |
| P0.6 | Labels: judges must always know what is real | all pages | Every data panel shows **REAL** (live fetch), **SNAPSHOT <date>** (offline cache) or **SIMULATED**. Never say "live" for a snapshot. Rename tab "NASA Data" to "Open data (NASA OSDR)"; threshold tag "NASA" reads "NASA-STD-3001" in tooltips |
| P0.7 | NASA attribution and non-endorsement | footer | Footer: "Built for the NASA International Space Apps Challenge 2026. Uses public data from NASA OSDR and NOAA SWPC. Not affiliated with or endorsed by NASA or NOAA." No NASA logos anywhere |
| P0.8 | README drift | README.md:18, :44-46, tables | "20 indicators" (not 19), add stDeviation to the table, add Crew Monitor and drills, list `/api/vitals/live`, `/api/alarms`, `/api/scenarios`, `/api/crew`, `/api/osdr/mission`; remove the duplicated Docker line; add the intended-purpose statement (section 10) |
| P0.9 | Small accuracy fixes | src/lib/types.ts:110 calls 0.5 s ISS "one-way light time" (it is relay latency; light time from 400 km is about 1.3 ms); src/app/radiation/page.tsx:15 cites Rev B while knowledge.ts cites Rev C; knowledge.ts CO2 text "headaches start around 2.8 mmHg" and "emergency > 4.5 mmHg" are unsourced | "one-way signal delay" with a basis per profile; cite "NASA-STD-3001 Vol. 1 Rev C"; CO2: 1-hour average above 3 mmHg (NASA-STD-3001 Vol. 2, V2 6004, no revision letter) and 7-day average target below 2.5 mmHg (OCHMO-TB-004); "headache odds roughly double per +1 mmHg (Law 2014)" |
| P0.10 | Rename the reaction test if ported | test branch calls it "Reaction Self-Test", the name of NASA's own ISS tool | "Reaction check: modelled on the PVT-B used in NASA's Reaction Self Test". Never "validated" or "equivalent" |
| ✓ | Exercise samples judged as resting vitals | fixed in 80a24e8 ("Never judge live exercise samples as resting vitals") | Verify with a test that freezes the clock inside ms1's exercise slot (11:00 to 12:30 UTC) and asserts heart rate is not flagged |

Commit P0 as 3 to 5 focused commits, run section 7, tag `pitch-safe-1`.

---

## 5. P1 and P2: the work plan with time boxes

| Prio | Item | Time box | Why |
|---|---|---|---|
| P1.1 | **Fix over-triage** (6.1) | 1.5 h | A clinician judge will see "critical, act now" for BP 142/92 and one 4.9 h night. Undercuts "published rules" |
| P1.2 | **Link model + mission switch without restart** (6.2a) | 2 h | Makes "escalation adapts to the delay" real and switchable on stage. Foundation of contracts |
| P1.3 | **Light-time contracts, minimal** (6.2b to 6.2f) | 4 to 6 h | The differentiator. Only if the team says yes; otherwise one honest slide |
| P1.4 | **Temperature: NEWS2 bands + Expected Self context** (6.3) | 1.5 h | The app currently calls normal in-flight warming a fever, contradicting its own text |
| P2.1 | **Flight recorder** (6.4), JSONL with hash chain | 3 h | Makes "every piece of advice is logged with rule and version" true |
| P2.2 | **Cause lines** (6.5): activity, cabin CO₂, sleep, solar particle event | 2 to 3 h | "One explanation across body and environment" |
| P2.3 | Demo smoke e2e: load all 8 pages, start and end a drill, save a check-in | 1.5 h | Protects the live demo |
| P3 | Port from test only after the pitch: Reaction check, task go/no-go, storm-shelter procedure, cross-indicator patterns, SQLite + audit, `/api/v1` + OpenAPI | n/a | Mention as roadmap; never show a test-branch feature as if it were in the pitched build |

Suggested schedule (CET): Sat 14:00 to 16:00 P0. Sat 16:00 to 23:00 P1. Sat 23:00 to 24:00 review workflow. Sun 08:00 to 11:00 P2 only if everything is green, else polish. **Sun 11:00 freeze**, tag `pitch-final`. Sun 11:00 to 15:00 project page submitted, three timed rehearsals, backup recording. After the pitch until 23:59: refine the project page and the 7 global slides.

---

## 6. Feature specifications

### 6.1 Over-triage fix (P1.1)
**Now:** `evaluateValue()` at src/lib/health/knowledge.ts:604 sets `escalate = status === "critical" || needsEscalation(...)`, so every critical band pages the flight surgeon, while the escalation texts and the Guidance "Automatic flag" table (src/components/guidance/escalation-protocol.tsx:95) promise other limits. Examples: systolic says "> 180" but escalates at ≥ 140; diastolic "> 120" but escalates at ≥ 90; temperature "> 38.5" but escalates at 38.0; stress "8 or more on two days" escalates on one day; sleep "7+ days of debt" escalates on one night under 5 h; hydration < 1.5 L escalates.
**Fix:**
- Separate band status from escalation. Escalate only on (a) explicit `escalateAbove/Below`, (b) a persistence rule, new field `escalateAfterDays?: number` (e.g. stress ≥ 8 on 2 days, sleep debt 7 days, mood ≤ 2 on 2 days), (c) symptom-type indicators where any critical value is an emergency (stDeviation, vision, SpO₂ ≤ 90).
- Stage-2 BP (140 to 179 / 90 to 119) becomes caution with "re-check in 15 minutes"; escalate at ≥ 180 / ≥ 120 (AHA hypertensive crisis).
- Generate the Guidance "Automatic flag" table from the same rule objects so text and code cannot drift. Update `tests/knowledge.test.ts`.
- **Then re-check the demo state** at the pitch time (15:00 to 16:00 UTC): the banner must still have one honest escalation story. The STEMI drill is the showpiece and must still escalate.

### 6.2 Light-time contracts (P1.2 + P1.3)
**One-line idea:** the flight surgeon approves care plans before an emergency; the crew acts at once; Earth keeps a veto window computed from the signal delay; replies written for an older situation are flagged as stale.
**Honest framing:** this makes existing practice explicit, computed and audited: ISS medical checklists and flight rules, weekly private medical conferences, standing orders, the Navy UNODIR convention ("unless otherwise directed"), and JPL loading about two weeks of commands before each Mars solar conjunction. Computable guidelines already exist (HL7 CPG-on-FHIR, WHO SMART). We found no public 2026 entry with pre-approved plans plus a veto deadline computed from light time plus stale-reply detection. That is the claim, and only that.

#### 6.2a Link model (port, P1.2)
Port the pure math from `origin/test:src/domain/missionContext.ts` (321 lines; only external import is `MISSION_DAYS`) into a new `src/lib/link.ts`, plus its tests. Replace `MissionProfile.commDelaySeconds` usage and the six duplicated `>= 60` branches (src/app/page.tsx:99/111/153, src/components/overview/escalation-banner.tsx:235/252, src/components/check-in/check-in-form.tsx:412/436, src/components/crew/findings.tsx:41, src/components/crew/protocols.ts:58-66 `surgeonStep()`, src/components/guidance/escalation-protocol.tsx:135; plus the duplicate `formatDelay` in overview/format.ts and escalation-protocol.tsx:48) with one `linkPolicy(oneWayS) → { mode, roundTripS, earliestAnswerS }`.

Profiles (one-way signal delay; physics: τ = distance_km / 299,792.458; 1 AU = 149,597,870.7 km ≈ 499.0 light-seconds):

| Profile | Basis | One way |
|---|---|---|
| ISS | relay and network latency (light time is about 1.3 ms) | 0.5 s (illustrative) |
| Moon | about 384,400 km | about 1.3 s |
| Mars, nearest | 0.37 AU | about 3.1 min |
| Mars transit (current default) | fixed 750 s on Project-2 | 12.5 min |
| Mars, far side (upper bound with contact) | about 2.5 AU, just outside conjunction | about 20.8 min |
| Solar conjunction | no contact | blackout, length a parameter (recent command pauses: about 11 to 18 days; default 14) |

Never show live contact at 2.67 AU / 22.2 min: that geometry is the conjunction itself. Say "about 3 to 22 minutes one way" for Mars in general.

**Switch on stage without restart:** cheapest safe option is a profile selector **inside the contract card and the escalation banner** (client state, default = server profile). Bigger option: a `?mission=` search param or a cookie read on the server (check the Next 16 docs for async `cookies()` / `searchParams`). Fallback if both fail: a second container `docker run -e DEMIFY_MISSION=mars-transit -e DEMIFY_OFFLINE=true -p 3001:3000 <image>` and two browser tabs. Note the compose file pins `container_name`, so two compose instances clash.

#### 6.2b Types (new pure module `src/lib/health/contracts.ts`, Zod-validated)
```ts
type StepClass = 'ACT_NOW' | 'ACT_UNLESS_VETOED' | 'GROUND_APPROVAL' | 'INFORM';
interface PlanAction { id; title; text; stepClass: StepClass; clinicalDeadlineMin?: number;
  earliestStartMin?: number; fallback?: string; selfAdministrable?: boolean;
  requiresReceipt?: boolean; allowEscalateToActNow?: boolean; }
interface CarePlan { id; version /* semver */; status: 'draft'|'active'|'retired';
  approvedBy /* "Demify team (example, not reviewed by a flight surgeon)" */; approvalDate;
  effectivePeriod: { start; end }; contentHash /* SHA-256 of canonical JSON, show 8 hex */;
  trigger: { indicator?: IndicatorId; scenario?: ScenarioType; condition: 'critical'|'escalate' };
  action: PlanAction[]; }
interface Activation { planId; planVersion; contentHash; crewId; activatedAt /* ship clock */;
  oneWayS; handlingS; marginS; vetoClosesAt; stateSeq; }
interface Reply { inReplyTo; basedOnStateSeq; planVersion; sentAtEarth; kind: 'veto'|'confirm'|'amend'; text; simulated: true; }
```
Field names mirror FHIR R4 PlanDefinition/ActivityDefinition so export is mechanical later. Say "FHIR-aligned field names", never "FHIR-compliant". No CQL engine, no CDS Hooks (it assumes an online EHR). Plans are immutable: an edit is a new version.

#### 6.2c The math
- τ = one-way delay. Ground handling H = **600 s by message** or **5 s by live voice** (voice when one way ≤ 5 s). Margin M = max(60 s, 0.05 × round trip). All three are **labelled assumptions** on screen, not NASA figures.
- **T_veto = activatedAt + 2τ + H + M** (with continuous contact; `wait_downlink` and `next_uplink_window` default 0 so the same model works for Antarctic or maritime contact windows).
- Worked values (illustrative): Moon 2.6 s + 5 s + 60 s ≈ **68 s**. Mars nearest 6.2 + 10 + 1 ≈ **17.2 min**. Mars transit 25 + 10 + 1.25 ≈ **36.3 min**. Mars far side 41.6 + 10 + 2.1 ≈ **53.7 min**.
- **Effective class is computed:** if an ACT_UNLESS_VETOED step's T_veto is later than its clinical deadline D_clin, it becomes ACT_NOW when `allowEscalateToActNow` is true, otherwise GROUND_APPROVAL with fallback. With no contact, ACT_UNLESS_VETOED follows the same rule and GROUND_APPROVAL goes straight to fallback. Show both labels: *"Authored: act unless vetoed. Today: act now (Earth cannot answer before the 30-min deadline)."*
- **Stale replies:** every activation increments `stateSeq` (also on each new finding and each executed step). A reply is **STALE** if `basedOnStateSeq < current stateSeq` or its planVersion differs. Show the diff: "Written on data up to 14:35; since then 2 steps done, heart rate 112 → 96". A veto after a step is done shows **LATE VETO**, is never dropped and never auto-reverses.
- **Lost messages:** expect an automatic Earth receipt by send + 2τ + 60 s. Without it: "receipt unconfirmed". A step done without receipt is logged "done under pre-approval; Earth had no opportunity to veto". Silence counts as consent only after a confirmed receipt.
- Unit tests for T_veto, effective class at each profile, stale and late rules.

#### 6.2d Seed plans (example plans, written by the team, labelled on screen)
1. **P-CHEST v1, suspected cardiac chest pain** (trigger: STEMI drill or stDeviation critical):
   1. Stop all activity, rest, call the Crew Medical Officer **[ACT_NOW]**
   2. Record and send a 12-lead ECG; recheck vital signs every 5 min **[ACT_NOW]**
   3. Prepare the defibrillator (AED) **[ACT_NOW]**
   4. Start the treatment section of the onboard chest-pain checklist, D_clin 30 min, allowEscalateToActNow **[ACT_UNLESS_VETOED]**. This is the step that flips: Mars nearest 17.2 < 30 min stays act-unless-vetoed with a countdown; Mars far side 53.7 > 30 min becomes act now, with the reason shown
   5. Return to normal duties **[GROUND_APPROVAL, fallback: light duty, keep monitoring, commander and CMO decide]**
2. **P-VF v1** (VF drill): all ACT_NOW (emergency; the crew never waits).
3. **P-BP v1, hypertensive crisis** (≥ 180/120): rest, re-measure in 5 min [ACT_NOW]; postpone exertion [ACT_UNLESS_VETOED, D_clin hours]; clear for EVA [GROUND_APPROVAL].
4. **P-SPE v1, solar particle event S3+**: go to storm shelter [ACT_NOW]; recheck dosimeter in 15 min [ACT_NOW]; postpone today's EVA, deadline "before EVA prep" (hours) [ACT_UNLESS_VETOED: stays so even at Mars, which is the honest point that most decisions are not time-critical]; leave the shelter [GROUND_APPROVAL, fallback: stay until proton flux has been below 10 pfu for 1 h (project default)].

No drug names, doses or fluid-loading amounts in any plan.

#### 6.2e UI
- **Contract header** on the existing checklist (src/components/crew/response-checklist.tsx, emergency-console.tsx, opened through `activeProtocol()` in src/components/crew/protocols.ts): "Plan P-CHEST v1 · #a3f9c2e1 · example plan, not reviewed by a flight surgeon · Earth can veto until 14:52 ship time (round trip 6.2 min + 10 min handling + 1 min margin, assumptions)". Per-step class chips, authored vs today.
- Profile selector (6.2a) in the header.
- Fast-forward ×60 ship clock (port `ShipClock` from `origin/test:src/domain/consult.ts`) so a Mars window plays in about 30 to 60 s. A **SIMULATED** Earth reply arrives with a red STALE badge.
- Persist activations like drills are persisted (src/lib/store/scenarios.ts pattern: globalThis plus JSON mirror) and expose `GET/POST /api/contracts` (activate | veto | confirm), guarded like P0.5.
- Wording: steps "become due"; the **crew** executes and ticks; nothing runs automatically; the actor of every tick is logged.

#### 6.2f Patient is the medic (show on a slide or as one line if time is short)
Mark the CMO in crew data. If the patient is the CMO (or impaired), steps are addressed to "helper" and ACT_UNLESS_VETOED / GROUND_APPROVAL steps need a second crew member to confirm. Alone: only `selfAdministrable` steps, logged "self-treatment, unverified".

#### Pre-blackout review (roadmap slide)
Before conjunction, list every plan whose approval expires during the blackout plus every GROUND_APPROVAL fallback, and ask the flight surgeon to re-approve: the medical twin of JPL's pre-conjunction command load. During blackout: "Earth cannot veto for N days; acting under plans approved on <date>". After: the first downlink is the recorder delta.

### 6.3 Temperature and Expected Self (P1.4)
**Now:** bodyTemp (knowledge.ts ~line 189) is tagged CLIN with NEWS2 as source, but its bands are not NEWS2: nominal 36.1 to 37.2, caution 37.3 to 37.9, critical ≥ 38 (escalates). Its own `spaceflightEffect` says core temperature rises up to about 1 °C in long missions. The relative 25 % baseline rule cannot catch temperature (would need about 9 °C) or SpO₂.
**Fix:**
1. Make the CLIN bands match NEWS2 exactly (verify on the RCP NEWS2 chart): ≤ 35.0 critical; 35.1 to 36.0 caution; **36.1 to 38.0 nominal**; 38.1 to 39.0 caution; ≥ 39.1 critical. Escalation per 6.1.
2. Replace the 25 % rule with per-indicator absolute deltas (APP, labelled ours): HR ±15 bpm, SBP ±20 mmHg, temperature ±0.5 °C, SpO₂ −3 points.
3. **Expected Self, temperature only for the pitch:** expected = pre-flight baseline + w × Δ(day), Δ = +1.0 °C × min(day/75, 1), weight w = 0.5 (one study, Stahn 2017), so the plateau is +0.5 °C. Resting readings only. A reading within expected ± 0.5 °C reads "nominal: typical in-flight warming for day 92 (early evidence: 1 study)".
4. **Safety invariant (unit-tested):** Expected Self may only reclassify a caution raised by the APP baseline rule. It never relaxes a NASA- or CLIN-tagged absolute threshold. 38.1 °C stays at least caution whatever the curve says.
5. Make simulator.ts follow the same curve (its comment says 0.5 to 1 °C but the code adds 0.2).
6. Curves apply only to microgravity profiles (ISS, transit). Analog and surface profiles (1 g or partial g) run with curves off. Say so: the first real users (analog crews) run in baseline mode.

Roadmap classes (show on a slide, do not build now): **SHIFT** (band moves: body mass −3 % × min(day/30, 1) ± 2 %, same device only; core temperature; BP only lower margin, weight 0 until better data), **CONTEXT** (shown as "typical in spaceflight", threshold unchanged: sleep about 6.1 h on ISS per Barger 2014, glucose, reaction time, exercise capacity), **BASELINE** (no curve: resting HR, HRV, SpO₂, mood, stress, hydration, vision/SANS, radiation). "Expected" never means "acceptable".

### 6.4 Flight recorder (P2.1)
- `export const RULESET_VERSION` = sha256 of serialised INDICATORS + package version; ruleId = `${id}@${hash8}`.
- New `src/lib/store/recorder.ts`: append-only JSONL `<dataDir>/demify-recorder.jsonl`, fsync like `store/readings.ts persist()`. Entry: `{seq, at, crewId, kind: 'assessment'|'checkin'|'checklist-tick'|'contract', indicator, inputs:[{readingId, value, source, takenAt}], status, escalate, rule:{basis, steps, escalateAbove, escalateBelow, sources}, rulesetVersion, missionProfile, oneWayS, adviceText, actions, drill, actor, prevHash, hash}`. `hash = sha256(prevHash + canonical(entry))`. `GET /api/recorder?crewId=` and `GET /api/recorder/verify`.
- Edge-triggered: `assessCrewMember` runs on every poll, so log only when (crew, indicator) status, escalate or rulesetVersion changes; keep the last state in memory, re-seed from the file tail. Check-ins, checklist ticks (response-checklist.tsx `toggle()`, today only in browser state) and contract events are always logged.
- UI: "Flight recorder" table on /crew/[id] (time, rule@version, advice, delay at the time) and RULESET_VERSION in the Guidance footer.
- Words: "version fingerprint", never "signature" or "signed".

### 6.5 Cause lines (P2.2)
New pure `src/lib/health/causes.ts`, rendered as "Possible contributors" (at most 3) under a finding. Each: status (present in window / outside window / not present), evidence tier (observed in spaceflight / ground or analog study / clinical / NASA standard / App assumption), source, "what would rule it out". Always end with "Other causes Demify does not measure: illness, medication, personal events." Wording "coincides with" or "possibly related", **never "caused by"**. Rules carry an id and version and go to the recorder.
- **R-ACT-1** activity: HR, BP or respiratory rate high during the scheduled exercise slot → "expected: exercise session".
- **R-CO2-1**: 1-h ppCO₂ > 3 mmHg or 7-day average > 2.5 mmHg, same time to 24 h after → headache, reaction time, mood, respiratory rate. Always list the competing explanation "fluid shift to the head (common early in flight)" (OCHMO brief). Store ppCO₂ in mmHg, not ppm.
- **R-SLEEP-1**: sleep ≤ 6 h → next 24 to 72 h: reaction lapses, mood, stress (Jones 2022 for the duration rule, "observed in spaceflight"). The 2-hour timing-shift trigger is an **App assumption**, not Flynn-Evans.
- **R-SEP-1**: GOES ≥ 10 MeV flux ≥ 10 pfu (S1+) → from onset to 24 h after it falls below 10 pfu: dose rate and cumulative dose directly; sleep and stress only indirectly through the shelter procedure, not radiation biology.
- R-HRV-1 (roadmap): lnRMSSD 7-day mean below baseline − 0.5 SD (sports-science practice, not a NASA standard), never escalates alone.

### 6.6 Radiation page corrections (do with P0 if quick)
- Tag `estimateDoseRate` coefficients (0.01 mSv/day per pfu above 1; the ×0.05 factor applies only when `mission.id === 'iss'`) "App (illustrative)". Line: "Estimate from GOES flux at geosynchronous orbit, not a measurement at your location. Your dosimeter is the reference."
- Flares are an **early warning**, not a dose: "X-ray flare: protons, if any, may follow, sometimes within minutes."
- Never add mSv and mGy. OSDR EDA cross-check label: "0.31 mGy/day absorbed dose, ISS area dosimetry (OSDR, Rodent Research missions), not crew dose."
- Lunar baseline: 1.4 mSv/day "lunar surface" (Chang'e-4, 1,369 µSv/day dose equivalent, Science Advances 2020); config.ts's 1.3 has no source.
- If `NASA_API_KEY` is used anywhere, never ship `DEMO_KEY` (30 requests per hour, 50 per day per IP; the venue shares one IP). Handle HTTP 429 by falling back to the snapshot and showing "cached <time>".
- Offline the OSDR search only works for the default query: either snapshot 3 to 4 likely queries (bone, radiation, Inspiration4) or hide the search box offline.

---

## 7. Verification and definition of done

Run after every merge:
```bash
npm ci && npm run lint && npm test && npm run typecheck && npm run build
DEMIFY_OFFLINE=true node .next/standalone/server.js   # not "next start": it warns with output: standalone
```
Smoke (all must pass): `/`, `/crew/plt`, `/body`, `/body?crew=ms2`, `/check-in`, `/radiation`, `/research`, `/guidance` → 200; `/crew` → 307; `/crew/xyz` → 404; `/api/space-weather`, `/api/osdr/inspiration4?summary=1`, `/api/osdr/eda` → freshness `snapshot` offline; a POST to `/api/readings` updates the board; a STEMI drill raises an alarm within 30 s and opens the checklist; the drill API refuses without the admin token.

Before freeze: `docker compose --profile offline up -d --build` on the presenting laptop with Wi-Fi **off**, then Playwright screenshots of every demo screen at the faked pitch time, reviewed by a fresh agent against section 13.

Done means: green checks, tagged, pushed, demo script rehearsed on the real laptop, backup recording made, project page submitted.

---

## 8. The demo (live, about 2 minutes inside a 5-minute pitch)

**Setup:** offline Docker profile on the laptop (port 3001), `DEMIFY_BIND=127.0.0.1`, fresh data volume (there is no reset button; restart from a clean volume), check the mission day on screen (`DEMIFY_MISSION_START` defaults to 92 days ago), browser zoom 125 to 150 %, a 60 to 90 s screen recording of the whole demo open in a second tab as backup. One speaks, one drives.

**Known demo state at pitch time (before 6.1):** banner "Contact the flight surgeon: 3 crew members need medical review"; plt BP 142/92 "critical, act now"; ms2 one 4.9 h night "critical, act now"; cdr vision 1/3 escalates; radiationCumulative and wbc "unknown". Re-check after 6.1 and 6.3.

**Five beats:**
1. Overview: mission day, crew status, signal delay. Say "simulated vital signs, real NOAA snapshot from <date>, real Inspiration4 blood data".
2. Check-in: type an out-of-range value; it is rated as you type with its source tag (NASA-STD-3001 / Clinical / App).
3. Escalation adapts: switch the profile; the wording changes from "request a private medical conference now" to "act first, then report".
4. **Light-time contract** (if built): start the STEMI drill. Contract header, step 4 "act unless vetoed, Earth can veto for 17 min" at Mars nearest. Switch to Mars far side: step 4 flips to "act now, Earth cannot answer before the 30-min deadline". Fast-forward: a simulated Earth reply arrives marked STALE. Close: "Earth keeps oversight; the crew never waits on the speed of light." If not built: show the existing delay-aware checklist and put contracts on the next slide as "what we build next".
5. Real data: Inspiration4 biomarkers (OSDR OSD-569, OSD-575) and the radiation dose budget against 600 mSv.

Optional proof of "works with any device or gateway that can POST our JSON": one rehearsed `curl` to `/api/readings` and the board updates.

---

## 9. The pitch

### Five-minute plan (local judges)
| Time | Content |
|---|---|
| 0:00 to 0:25 | Hook: "On the way to Mars a question to the flight surgeon takes up to about 20 minutes to arrive and as long to come back. Today's tools assume Earth answers in time." (Match the number on screen: 12.5 min on the default Mars transit profile.) |
| 0:25 to 0:45 | User and problem: one crew, the Crew Medical Officer may be the patient, five hazards |
| 0:45 to 2:45 | Demo, five beats (section 8) |
| 2:45 to 3:20 | Validity: every threshold carries a visible source tag (NASA, Clinical or App-derived, our own and labelled), tests and CI, scope sentence, research prototype |
| 3:20 to 4:30 | **Business, 60 to 75 s, one canvas slide** (mentors asked for it): first users, who pays, costs, market, funding (section 11) |
| 4:30 to 5:00 | Three sentences + the ask: an analog-mission pilot partner and a space-medicine advisor |

3-minute fallback: hook 20 s, problem 15 s, demo 80 s, trust 30 s, business 25 s, close 10 s. Rehearse three times with a timer; cut any demo beat over 30 s.

### Three sentences to remember (adjust to what is built)
1. "When Earth is minutes away, Demify lets the crew act at once on care plans the flight surgeon approved in advance, and gives Earth a veto window computed from the mission's distance to Earth."
2. "Every rating shows its source (NASA standard, clinical guideline or our own, labelled) and every piece of advice is logged with the rule and version that produced it." (Second half only if 6.4 is built.)
3. "It runs fully offline with cached snapshots of every outside source, on real Inspiration4 crew blood data from NASA's open science archive."

### Criteria mapping
Impact: crew acts before Earth can answer; analog users in 2027. Creativity: light-time contracts, Expected Self. Validity: source tags, tests, honest scope. Relevance: walk through the challenge objectives (indicators, guidance, clickable body figure, charts, colour coding, prompts to measure) in under 20 s. Presentation: rehearsed hand-off, large font.

### Competitor sentences (never name other Space Apps teams)
- Replace every "first/only" with: **"Of the 59 systems we reviewed, none combines a visible source tag on every threshold, escalation that adapts to the signal delay, and fully offline operation in one open tool."**
- **NASA/Google CMO-DA:** "CMO-DA answers a crew member's question once something already hurts; early tests on simulated cases scored 74 to 88 % (secondary reporting) and since June 2026 it runs offline in ground tests. Demify rates every reading as it arrives, and each alert traces to a visible rule and source. A free-text AI answer has no fixed rule you can check line by line; each of these does." Never say CMO-DA is cloud-only, flying, or open source (only its RamaLama runtime is).
- **Oura + Booz Allen (Ax-4, launched 25 June 2025):** "flew a demo that processed ring data on the station without Oura's cloud; no results published. Demify takes readings from any device or gateway that can POST our JSON and adds symptoms, radiation and sourced thresholds."
- **Astroskin (Hexoskin/CSA):** sensor shirt on the ISS since 2019, had a six-month CSA Phase 0 for Gateway (Nov 2024 to May 2025); Gateway paused March 2026. "A garment like this could feed Demify."
- **ARCHeR:** NASA's Artemis II study (flight 1 to 10 April 2026) with wrist actigraphs; results not yet published. A data source, not a rival.
- **Apple Vitals / Oura / WHOOP:** personal baselines exist, so never claim baselines are new. WHOOP: FDA warning letter 14 July 2025, closed 17 June 2026 after wording and dial changes. That is why we say "research prototype, not a certified medical device".
- **Biofourmis:** FDA 510(k) clearances prove this category can be certified later.
- **Current Health:** Best Buy wrote down USD 475 M on its health unit in early 2025 and sold Current Health back in June 2025: Earth remote monitoring is crowded; we start where the hospital and the cloud are missing.
- **Spacelabs:** began monitoring astronauts for NASA in 1958, sells hospital monitors: space monitoring can become an Earth business.

### Q&A (one sentence each)
- *Medical device?* "Research prototype, not a certified medical device; under EU MDR Rule 11 and Swiss MedDO the triage functions would be class IIa to IIb, possibly III for cardiac emergencies, to be confirmed with a notified body; we give no drug doses."
- *Are the data real?* "Inspiration4 biomarkers, NOAA space weather and OSDR dosimetry are real; vital signs are simulated and labelled until a device posts readings."
- *Why not NASA's own tools?* "ISS checklists, flight rules and standing orders are the precedent; we make the delay explicit, computed and audited."
- *Business with about 25 people a year in orbit?* "Astronauts give credibility, not revenue: analog crews first, research pilots and agency contracts pay first."
- *Does the veto delay care?* "Never: emergency steps run at once; a veto can only stop or change what happens next; the flight surgeon remains the medical authority."
- *Why trust two students?* "Every rule is open and names its source, and we start in analog missions, not in space."

### Global 7-slide deck (after the pitch, before 23:59)
1. Title + "research prototype, not a certified medical device". 2. Problem: about 3 to 22 min one way to Mars; the CMO may be the patient. 3. Light-time contracts diagram (or "what we build next" if not built). 4. Two screenshots (escalation, check-in with source tags). 5. Science and data: 20 indicators with sources, the NASA/Clinical/App tags, Inspiration4, real vs simulated. 6. What we add to existing approaches (no team names). 7. Path to crews (analogs 2027, agencies, open source). Count: 8 slides is over the limit.

### Project page checklist
2 to 3 sentence summary; public link without login (repo or deployed app); NASA data with links (OSDR OSD-569, OSD-575, OSDR ISS dosimetry, HRP risks); other data (NOAA SWPC); a statement naming each AI tool used, what it did and that the team reviewed the output; LICENSE present; everything in English; no NASA logos; demo link (7 slides or ≤ 30 s video).

---

## 10. Regulation and exact wording

**Short disclaimer (badges, footers):** "Research prototype, not a certified medical device."

**Long disclaimer (footer on every page + first-run acknowledgement):** "Research prototype – not a certified medical device. Not for diagnosis, treatment or emergency decisions. Vital signs are simulated unless marked "device". Thresholds are published reference values shown for research and training. In a real situation follow your mission's medical procedures and contact your flight surgeon or emergency service."

**Intended purpose (README, About, closing slide, word for word):** "Demify is open-source research and training software for analog and simulated space missions. It records self-reported wellbeing data and readings from connected sensors, shows them next to public space-weather and NASA open-science data, and indicates which published reference ranges a value falls outside. It is intended for research, education and mission-operations training with adult volunteers who have given informed consent. It is not intended to diagnose, prevent, monitor, predict, treat or alleviate any disease or injury, nor to inform the medical care of any individual." Because the UI has a patient monitor and alarms, call them **"simulated training monitor"** and **"training alarms"**, otherwise the statement contradicts the product.

**Class slide:** "Today: research prototype, not placed on the market, not a certified medical device. Target product: medical device software under MDR Annex VIII Rule 11 / Swiss MedDO Art. 15, expected class IIa to IIb (vital-sign monitoring = IIb), possibly III for cardiac-emergency escalation, to be confirmed with a notified body."

**Other rules:**
- Free or open source does **not** take software out of the MDR; what keeps the prototype out is no commercial supply and a research/training intended purpose.
- **AI Act:** the engine is rule-based, not an AI system. Never say "AI-powered" or "AI triage". The Digital Omnibus has been in force since 27 July 2026; an ML component in an MDR class IIa+ device would be high-risk under Art. 6(1) from 2 Aug 2028.
- **CRA:** pure SaaS is outside it; commercially supplying the downloadable or self-hosted software (Docker image) is inside. **PLD:** strict liability for products placed on the EU market after 9 Dec 2026, once commercial.
- **Privacy:** Swiss revFADP plus the Human Research Act (HRA) for any study with identifiable health data; pseudonymised is not anonymised. GDPR only if people located in the EU are monitored. Engineering: pseudonymous crew IDs kept apart from identities, encryption at rest, Swiss hosting, export/delete, consent capture, audit trail free of direct identifiers (crypto-shred the identity key for erasure), DPIA before any real crew data.
- **Ethics in the product:** the crew member owns the data and sees everything first; outputs are never used for crew selection or careers; "Advice, not a decision. The commander and the crew member decide."
- **Trademark:** IGE e-trademark CHF 350 for 3 classes (9, 42, 44); run a clash search first (Swissreg, WIPO, EUIPO). Use ™ or nothing, never ®, before registration.
- **Compliance roadmap slide:** (0) now, CHF 0: wording, licence, disclaimer, attribution. (1) Nov 2026 to Q1 2027: Asclepios proposal, ethics route, DPIA, trademark. (2) 2027: analog study, publish usability and feasibility, stay research prototype. (3) 2028+, only if certifying: ISO 13485, IEC 62304, ISO 14971, IEC 62366-1, IEC 81001-5-1, notified body, EU authorised representative (needed since the EU-Swiss MRA lapsed in May 2021), Swissmedic registration. Get notified-body quotes before showing a cost.

---

## 11. Business model (version 2, reality-checked; full text in BUSINESS_MODEL.md on test)

**Line:** "Built to space standards, proven with Earth crews."

**Flipchart answers**
| Question | Answer |
|---|---|
| People to orbit per year | 21 to 28 (21 in 2023, 28 in 2024, 28 in 2025, about 21 in 2026); about 10 in orbit at any time (7 ISS, 3 Tiangong); record 19 (Sept 2024) |
| Demify users 2027 | **0 astronauts; 10 to 20 analog crew** (Asclepios VII Swiss lunar analog, summer 2027, crews of 6 to 10; 1 to 2 MDRS rotations of about 6) |
| 2028 to 2029 | Goal: first in-flight research demo through a Swiss partner with ISS experience (BIOTESC at HSLU, ESA's Swiss user support centre; or UZH Space Hub). Not a commitment |
| 2030 to 2035 | 4 to 10 astronauts a year if one operator adopts it (estimate) |
| 2040+ / 2050 | 10 to 30 a year: a vision, not a forecast |
| Benchmark | Hexoskin: founded 2006, first CSA contract 2011, Astroskin on the ISS since Jan 2019 (about 12 years) |
| Earth users | Analog and polar research teams first (grant-funded); 34 national Antarctic programmes (about 1,100 people in winter, 4,400 to 5,000 in summer); offshore via medical providers (UK about 24,000 FTE offshore workers, 2025; International SOS supports 900+ remote sites) |
| Market (bottom-up, CHF 40 per person per month and 100 % share, both estimates) | All Antarctica about CHF 1.1 M/yr; UK offshore about CHF 11.5 M/yr. An honest niche of a few million CHF a year |
| Value for NASA | Image: open, checkable early-warning tool (Jan 2026: first medical evacuation in ISS history, Crew-11; condition undisclosed, never link it to delay). Value: NASA prices crew time at about USD 130,000 per hour (2021 price list), so Demify must replace parts of existing checks; it is a price, not a saving we claim. Students: open code to learn from. Cost: NASA pays nothing; we seek a no-money collaboration (data, flight-surgeon feedback) |
| Revenue, most realistic first | (1) Agency and research contracts (ESA, Swiss Space Office); (2) paid research pilots CHF 5,000 to 15,000 per study (estimate); (3) integration and support per programme; (4) site licences CHF 6,000 to 15,000 per site per year only after certification, sold through remote-medicine providers (estimate). One McMurdo evacuation flight cost about USD 286,000 |
| Costs, 3 years (estimates) | Y1 81,600 · Y2 228,100 · Y3 299,600 = **CHF 609,300** (founders part-time Y1, medical advisor 20 % from Y2, regulatory, pilots, security, insurance, 10 % contingency). Certification (MDR IIa) itself comes after year 3: name it as the dominant future cost, amount to be quoted |
| Money in | Base case CHF 86,000 → gap −523,300. Funded case (Venture Kick loans, ESA BIC, an ESA feasibility contract) CHF 486,000 → gap −123,300, closed by a small seed round or lower salaries. No break-even within 3 years, said openly |
| Open source | MIT now (Apache-2.0 later if the patent grant matters; needs every contributor's consent). Ours: the name (trademark), the validated threshold library, the certified build, being the maintainers |

**Canvas (one slide):** Segments: analog and polar research teams → national polar programmes → offshore via medical providers; space agencies and commercial operators as research partners. Value: own baseline, likely contributors, who must act given the distance to help; open, checkable, offline, any device. Channels: Space Apps, Asclepios, MDRS, Swiss space partners, ESA, later remote-medicine providers. Relationships: research partnership, open-source community, support contracts. Revenue: as above. Key activities: software, threshold library, pilots under ethics, regulatory path. Key resources: open engine with sourced thresholds, tests, team, trademark. Partners: space-medicine advisor, Swiss university or hospital, device makers, analog and polar programmes, NASA and NOAA open data. Costs: people, advisor, regulatory, pilots, security, insurance.

**Corrections to BUSINESS_MODEL.md** (apply if you edit it): CMO-DA is not "cloud-only" any more (offline in ground tests since June 2026); Gateway is paused (March 2026); keep MIT for now rather than "move to Apache 2.0 now"; never call Demify "decision support" (COMPETITORS.md also says so once; fix it); Innosuisse Initial Coaching is a voucher, not cash; SPI grants need a postdoc main applicant.

**Funding ladder (Switzerland):** Venture Kick Stage 1 CHF 10,000 grant (no company needed) → Stages 2 and 3 CHF 40,000 and CHF 100,000 as **convertible loans** (5 %), Stage 3 needs a company → Swiss GmbH (CHF 20,000 paid-in plus about CHF 2,000 to 6,000 fees; not before Stage 3 or ESA BIC) → ESA BIC Switzerland, up to EUR 200,000 (Venturelab figure only), Swiss company under 5 years (possibly only by contract signature; ask Venturelab), 31 Oct 2026 cut-off passed → SPI Exploratory Grant only with a postdoc or professor as main applicant. Innosuisse Initial Coaching: voucher up to CHF 10,000 with accredited coaches, not cash. ESA Kick-Start: fixed 75 % (ESA pays at most EUR 75,000), Swiss participation contradictory: "being checked with SERI".

**Next 90 days (slide wording):** "We are submitting a proposal to the Asclepios VII Call for Projects (lunar analogue mission, summer 2027). Venture Kick Stage 1 (CHF 10k grant). Innosuisse Initial Coaching (coaching voucher up to CHF 10k)." Use "submitted" only once true.

**Concrete actions after the pitch:** Mon 16 Nov: email Asclepios (can a two-student team apply directly or via a host institute; Phase A format; ethics and data rules; fee) and confirm the closing date on asclepios.ch (opened 26 Oct 2026; 29 Nov 2026 23:59 CET is unconfirmed). Tue 17 Nov: ask an academic host for a support letter (UZH Space Hub, HSLU space biology / BIOTESC, EPFL eSpace) and their ethics office about the HRA route. Wed 18 Nov: one email to the Swiss Space Office (ESA Kick-Start participation, next ESA BIC cut-off and pre-incorporation, Concordia contacts) and to the Swiss Polar Institute. Thu 19 Nov: Innosuisse Initial Coaching. Fri 20 Nov: Venture Kick application. Do not found the GmbH this week. Asclepios proposal title idea: "Delay-adaptive crew health log and light-time contracts: a feasibility and usability study during Asclepios VII"; data-only, offline, pseudonymised, no diagnosis, no doses; measures: daily completion rate, time from flag to decision, System Usability Scale; ethics route via the Ticino committee, category to be determined.

---

## 12. Science and facts sheet (confirmed unless marked)

**Light time and operations**
- Mars one way about 3 to 22 min; Moon about 1.3 s. Mars solar conjunction command pauses: about 11 days (2019), about 14 days (2023), about 2 to 3 weeks (Dec 2025 to Jan 2026, dates conflict).
- Mosier and Fischer, Human Factors 65(6):1235-1250, 2023 (PMID 34663105): delay protocols (thread labels, send time and earliest reply stamped on each message) were feasible, usable and effective in NASA analog simulations (NEEMO, HERA); trained crews rated delay days on a par with no-delay days. Do not say "NASA-funded" or "adopted in flight".
- CMO training: "on the order of 15 to 40 hours, depending on source". No single figure.
- CHAPEA Mission 2: a second year-long NASA Mars analog with Mars-like delays; it ended about 31 Oct 2026 (secondary). Quote no delay maximum.

**Radiation**
- Mars cruise about 1.8 mSv/day (Zeitlin 2013, MSL RAD, low-to-moderate solar activity; not a constant). Transit to Mars and back about 660 mSv dose equivalent (0.66 ± 0.12 Sv), **comparable to** NASA's 600 mSv career limit (which is effective dose, same for all ages and sexes, NASA-STD-3001, based on 3 % REID for a 35-year-old female). Solar particle events were about 5 % of the cruise dose.
- NOAA S-scale: S1 at ≥ 10 MeV ≥ 10 pfu. Paraphrase astronaut effects (S3 avoidance recommended on EVA, S4 unavoidable hazard on EVA, S5 unavoidable high hazard) until checked on swpc.noaa.gov.
- Snapshot 14 Nov 08:52 UTC: ≥ 10 MeV flux about 0.2 pfu (quiet), 5 % S1 chance 14 to 16 Nov. If quiet during the demo, a "REPLAY of <date>" button for a past event, always labelled.
- Crew Active Dosimeter (Mirion and NASA, ISS since 2020, Artemis II): "Demify accepts time-stamped personal dose like the CAD records". Never "integrates with".

**Cabin air:** CO₂ 1-hour average limit 3 mmHg (NASA-STD-3001 Vol. 2, V2 6004); 7-day target below 2.5 mmHg (OCHMO-TB-004); headache odds roughly double per +1 mmHg (Law 2014).

**Expected Self evidence**
- Body mass: 25 ISS crew, −4.4 % (BMMD) and −2.8 % (SLAMMD) vs pre-flight scale; 2 to 5 % in the first month, then stable (Zwart 2014, Aviat Space Environ Med 85(9):897-904). Devices differ by about 1.1 kg: same device only.
- Core temperature: rises about 1 °C over about 2.5 months (Stahn 2017, forehead heat-flux sensor; sample size unconfirmed); exercise peak about 1.39 °C higher than on the ground, above 40 °C in some individuals.
- BP: −8 to −10 mmHg over 24 h (8 men) vs no change (Hughson 2012, 6 men): conflicting, all-male.
- Sleep: ISS crews average about 6.1 h (Barger 2014, 21 astronauts): common, not healthy.
- SANS: Frisén grade 1 edema in about 17 % of retinal images (62 crew); OCT shows disc edema developing in about 70 % of 6-month ISS crew. Never hide vision symptoms.
- Reaction: early-flight slowing in processing speed and attention is typical (Dev et al., Nov 2024, 25 astronauts); no millisecond figure. PVT-B: 3 min, 1 to 4 s gaps, lapse ≥ 355 ms (Basner, Mollicone and Dinges 2011); false start < 100 ms is a common PVT convention. Sleep ≤ 6 h linked to slower Reaction Self Test (Jones 2022).
- Post-flight exercise capacity −15 % on day 1 after landing, within 2 % by day 30 (Moore 2014, n = 14).
- Third-quarter effect: often cited, not supported (Antarctic meta-analysis, Hawkes and Norris 2017). Do not warn about it.

**Regulatory and market facts:** WHOOP warning letter 14 Jul 2025, closed 17 Jun 2026. Artemis II: 1 to 10 April 2026 (Wiseman, Glover, Koch, Hansen). Space Apps 2025: 18,860 teams, 11,500+ projects; 2025 Best Use of Science winner SpaceGenes+ (astronaut-health dashboard for a named user; country and data source unconfirmed). 2024: 940+ global nominees, 40 finalists.

### Missions to 2050 (targets slip; say "by current plans")
Nov 2026 Shenzhou-24 (China, 3) · Jan 2027 Ax-5 (Axiom, 4) · early 2027 Haven-1 (Vast) · summer 2027 Vast ISS mission; Artemis III docking test in Earth orbit · 2027 first crewed Gaganyaan (India) · **early 2028 Artemis IV, first Moon landing since 1972** · late 2028 Artemis V, start of the Moon base · 2028 Starlab / Orbital Reef (disputed), first Indian station module · **before 2030 Chinese Moon landing** · about 2030 Russian station · **2030 to 2031 ISS retired** · 2029 to 2036 NASA Moon base (Gateway paused March 2026) · 2032 Haven-2 (up to 12) · 2035 Indian station complete · 2040 Indian on the Moon (goal) · **2040s Mars, no official year**. Pitch: until 2030 few people and short trips; the 2030s bring Moon bases and long stays, where crew autonomy and Demify matter. Re-verify any single date before putting it on a slide.

---

## 13. Master do-not-claim list (check every slide, UI string and README line)

**Product state**
- Light-time contracts, care plans, veto windows or the flight recorder as built or demoed, unless merged into the build on stage.
- Light time or delay as "live": it is a fixed profile constant (Project-2) or an illustrative trajectory (test).
- "Mars delay is 22 minutes" while the screen shows 12.5 minutes.
- Test-branch features (earliest-answer ledger, Reaction check, go/no-go, storm shelter, `/api/v1`, SQLite audit) as part of the pitched build.
- Rule versioning or advice logging on Project-2 before 6.4 exists; on test the audit log covers only edits to readings.
- "Every threshold has a published source": some are App-derived; say "every threshold carries a visible source tag".
- "Watches continuously": vitals are simulated until a device posts readings.
- "Works with any device": say "any device or gateway that can POST our JSON".
- Accuracy, detection rates, confidence percentages or "10 times better" as measured results; the 152 vs 8 and 19 vs 17 scratch experiments were circular on simulated data.

**Regulation and branding**
- "Not a medical device", "decision support", "CE-marked", "MDR/MedDO compliant", "Swissmedic approved", "FDA cleared", "clinically validated", "medical-grade", "diagnoses", "detects heart attack".
- "Outside the MDR because it is free or open source".
- "AI-powered" / "AI triage".
- "GDPR compliant", "GDPR applies to our Swiss pilot", "CRA applies to our hosted service", "revFADP compliant" before a DPIA exists.
- "Open source" for a branch without a LICENSE file.
- "Demify®" / "registered trademark".
- "NASA-approved", "NASA partner", "endorsed by NASA", NASA logos, "thresholds certified by NASA" (say "taken from NASA-STD-3001 and cited").
- Any drug name or dose in advice; "the software executes" any step (the crew executes, the software tracks).
- "Signed by a flight surgeon": example plans are written by the team and unreviewed; the hash is a version fingerprint, not a signature.
- Silence after the veto deadline as consent when no receipt was confirmed.

**Firsts and competitors**
- "First" or "only" anything: pre-approved care (standing orders, ISS checklists and flight rules, UNODIR, JPL pre-conjunction loads, CPG-on-FHIR, WHO SMART), offline astronaut AI (CMO-DA ground tests, Ax-4 edge demo), personal baselines (Apple, Oura), audit ledgers (other 2026 teams have a hash-chained ledger and a "flight recorder" archive), real NASA data (others use OSDR RadLab, GOES, Apollo 15). Claim only "real Inspiration4 crew blood biomarkers (OSDR OSD-569 and OSD-575)".
- CMO-DA as cloud-only, flying, peer-reviewed, open source, or using a named model.
- Ax-4 Oura demo as a proven result; ARCHeR results; Astroskin going to Gateway; Gateway as a market.
- Current Health still owned by Best Buy or FDA-cleared; the 161 layoffs at Current Health (they were Best Buy Health staff).

**Science**
- "Space fever" or 38 °C as normal; BP falls in all astronauts; resting HR drops in space; HRV reliably falls; third-quarter effect as established; any in-flight SpO₂ value; µm figures for optic nerve changes; post-landing +5 to 6 bpm; Stahn sample size; "1.84 mSv/day"; Mars transit dose "exceeds" the career limit; 600 mSv as per mission or in mGy; flares irradiate the crew; Demify measures crew radiation dose; DEMO_KEY in production; quoting NOAA S3 to S5 wording verbatim; the Vol. 2 revision letter; lunar 1.3 mSv/day as sourced; OSDR EDA 0.31 mGy/day as crew dose; "caused by" for any cause line; Expected Self as a personalised prediction or validated (say "what spaceflight typically does to crews on mission day N, starting from your own baseline"); "Demify does not page for what spaceflight does to everybody" (it still flags short sleep and SANS).
- Any autonomy level or quote from NASA's 2024 EIMO ConOps (not retrieved); Demify's 5-step autonomy scale as NASA's or as NASA-STD-3001 Levels of Care; "more autonomy improves outcomes".
- The browser reaction test as "Reaction Self Test", validated, or equivalent to PVT-B.

**Business and funding**
- Any partnership, acceptance or endorsement by Asclepios, UZH Space Hub, HSLU/BIOTESC, EPFL, SERI, ESA, NASA or SPI. BIOTESC is an ESA ISS user support centre, not a space-medicine partner.
- Asclepios as a customer or funder; its 29 Nov closing date as confirmed; students can apply without an institution.
- Venture Kick Stage 2 as CHF 50,000, all stages as grants, or a minimum age.
- ESA BIC open now, EUR 500,000, in CHF, or requiring matching funds; Switzerland in ESA Kick-Start; Kick-Start covering full cost.
- SPI grants open to students or open now; Concordia in 2027.
- Innosuisse voucher as cash; pseudonymised data as anonymous; the analog study as exempt from the HRA; any certification cost or ethics fee figure; CHF 600 register fee.
- Judging weights, a 1-to-5 scale, the 3 Dec / 17 Dec / January announcement dates, a local nomination cap, a "Most Inspirational" award, 1,294 nominees (2025) or 9,996 submissions (2024).
- Quoting the official challenge text from memory.

---

## 14. Still unconfirmed (check only if it matters for a slide)
Space Apps 2026 submission deadline time; local pitch length and rubric; Asclepios VII closing date and student eligibility; ESA BIC pre-incorporation; Swiss ESA Kick-Start participation; NEWS2 temperature bands (verify on the RCP chart before shipping 6.3); exact NOAA S-scale astronaut text; NASA-STD-3001 Vol. 2 revision letter; DONKI SEP route and field names; Stahn 2017 sample size.

---

## 15. When you report back to the team
Short, plain English, no jargon. Say what is done, what is verified (with the check output), what is not done and why, and the next decision you need from them. For technical steps they must do on their laptop, give one step at a time with the exact command and what they should see.
