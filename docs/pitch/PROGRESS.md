# Pitch progress log

Live pitch: **Sunday 15 November 2026, about 15:00 UTC** (NASA International
Space Apps Challenge 2026). Work branch: `Project-2-Phase-1`.

This log records what changed for the pitch, how each change was checked,
and what the team still has to decide. Newest entries go on top of each
section.

## Baseline

| Name | Commit | What it is |
|---|---|---|
| `pitch-baseline-0` | `b48f66b` (`b48f66b425880a963986458bdfbd4b051e54c7a2`, 2026-11-14 15:08 UTC) | "Add the Demify logo: sidebar, mobile bar and browser icon". The state before pitch work started |
| Baseline fix | `270f2b2` (2026-11-14 15:18 UTC) | "Help diagram: status chips fit inside the 'Demify rates each value' box" |

Pushing git tags to GitHub is blocked from the environment the pitch work
runs in, so the tag `pitch-baseline-0` exists only locally and this table
lists the commit SHAs instead. To publish the tag yourself:

```bash
git tag pitch-baseline-0 b48f66b
git push origin pitch-baseline-0
```

To see everything that changed since the baseline:
`git diff b48f66b..Project-2-Phase-1 --stat`.

## Done

### Legal, security, build hygiene (ops)

Changes in the working tree, to be committed by the lead.

| Item | What changed |
|---|---|
| P0.3 License | `LICENSE` (MIT, "Copyright (c) 2026 The Demify team", same text as branch `test`). `package.json` has `"license": "MIT"` and stays `"private": true` |
| P0.4 Typecheck on a clean checkout | `npm run typecheck` is now `next typegen && tsc --noEmit`. Before, a fresh clone failed with `Cannot find name 'PageProps'` / `'LayoutProps'` because those types are generated. CI runs the typecheck after lint, before tests and build |
| P0.5 Stage protection | `docker-compose.yml` publishes both the app and the air-gapped relay on `${DEMIFY_BIND:-127.0.0.1}` (was `0.0.0.0`). New optional `DEMIFY_ADMIN_TOKEN`: when set, `POST`/`DELETE /api/scenarios` and `POST /api/readings` answer `401` unless the request sends `x-demify-admin: <token>` or the httpOnly `SameSite=Strict` cookie from `GET /unlock?token=<token>`. Unset means no change. Check in `src/lib/http.ts` (`requireAdmin`), unlock route in `src/app/unlock/route.ts`. Documented in `.env.example`, `docs/OPERATIONS.md` §3.7 and `docs/DEPLOYMENT.md` §3 and §8 |
| P0.9 Accuracy | Mission profiles document `commDelaySeconds` as one-way signal delay and carry a `delayBasis` each: ISS 0.5 s is relay through TDRS plus network latency (straight-line light time from 400 km is about 1.3 ms), Moon 1.3 s is light time at about 384,400 km, Mars 750 s is a fixed mid-range value. Lunar dose rate 1.3 → 1.4 mSv/day (Chang'e-4, 1,369 µSv/day dose equivalent, Zhang et al. 2020, Sci. Adv. 6, eaaz1334) |
| P0.8 README | Intro rewritten in training framing; new "Intended purpose" section with the agreed statement word for word and the short disclaimer; the two medical-device trigger phrases are gone from README, `docs/OPERATIONS.md` and `docs/research/health-knowledge-base.md`; Mars delay now "about 3 to 22 minutes one way"; data labels REAL / SNAPSHOT / SIMULATED / DEVICE; stage binding and admin token; all endpoints including `/api/osdr/mission` and `/unlock`; License section |

### Clinical logic, wording, labels (other areas)

Committed by the lead as work-in-progress checkpoints; their owners update
this section when they finish.

| Commit | Message |
|---|---|
| `c559816` | WIP checkpoint: offline snapshots for common OSDR searches |
| `c22f30e` | WIP checkpoint: pitch phase A (clinical logic, wording, labels) in progress. Adds `src/lib/disclaimer.ts`, `tests/wording.test.ts`, `tests/clinical-safety.test.ts` |

## Verified with

| Check | Result (2026-11-14, ops changes) |
|---|---|
| `npx tsc --noEmit` (working tree) | 0 errors |
| `npm run typecheck` in a fresh copy of the working tree with no `.next` and no `next-env.d.ts` | Passes. The old script (`tsc --noEmit` alone) fails there with 5 `PageProps` / `LayoutProps` errors |
| `npx eslint` on the changed source and test files | Clean |
| `npx vitest run` | 14 files, 232 tests passed, including the new `tests/admin-guard.test.ts` (token unset: unchanged; token set: 401 without it, 201/200 with header or unlock cookie, wrong or forged cookie refused, cookie marked `Secure` behind TLS, rotating the token logs browsers out) |
| `docker compose config -q`, with and without `--profile offline` | Valid. Resolved ports: `127.0.0.1:3000` and `127.0.0.1:3001`; `DEMIFY_BIND=0.0.0.0` gives `0.0.0.0` |
| Separate dev instance with a token set (own port and data dir) | `curl`: 401 without token, 201 with header; `/unlock` answers 303 to `/` with `HttpOnly; SameSite=Strict`. Browser (Playwright): drill start refused with "Admin token required" before unlocking, starts after `/unlock`, then ended |
| Team dev server (token unset) | `/unlock` redirects to `/`; write APIs behave as before |

## Open decisions (questions for the team)

1. **Who speaks, who drives the demo?** One person talks, one clicks; who
   is the backup if the laptop fails?
2. **Pitch length and the local rubric.** How many minutes do we get, and
   which judging criteria does the local event use? That decides what we
   cut.
3. **Light-time contracts: build or slide?** Build them into the app before
   Sunday, or show the idea on a slide only?
4. **Anyone under 18?** The intended purpose names adult volunteers who gave
   informed consent. Is anyone on the team, or anyone we would show as a demo
   volunteer, under 18?
5. **Swiss university link.** Do we have a Swiss university or lab contact we
   may name (supervision, ethics, analog-mission research)? If not, we leave
   it out.
6. **Default branch.** Keep `main` as the GitHub default branch, or point
   judges at the pitch branch?
7. **Stage settings.** Run the pitch laptop with the loopback default only, or
   also set `DEMIFY_ADMIN_TOKEN`? (Recommended: both; unlock the presenter's
   browser once with `/unlock?token=...` before going on stage.)

## Current state

- Branch `Project-2-Phase-1`, last commit `c559816`; ops changes above are in
  the working tree and not committed yet.
- Typecheck, lint and all tests pass on the working tree (see above).
- Known gaps, owned outside the ops area:
  - `npm run sensor:demo` does not send `x-demify-admin`, so it gets `401`
    while a token is set (it stops on 4xx). Until it reads
    `DEMIFY_ADMIN_TOKEN`, leave the token empty while using it.
  - The daily check-in saves through a server action, which the admin token
    does not cover (by design for now); the loopback default protects it on
    stage.
