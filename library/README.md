# Demify onboard library

This folder is the curated medical library of the Demify onboard server. The onboard assistant (library assistant, local language model) answers crew questions from these documents, and from nothing else, and cites the passages it used. It advises and never decides: the crew and, when the ground link is up, the flight surgeons make every medical decision. If the library has no good answer, the assistant says so instead of guessing.

In the onboard server stack this folder plays the Earth-side library: the sync service pulls it into PostgreSQL while the ground link is up (`DEMIFY_GROUND_LIBRARY_DIR`, a read-only bind mount of `./library` in the compose file). The copy shipped inside the Docker image seeds the database while it is still empty. Without a database, Demify reads these files directly. This README explains the library; it is not ingested.

Research prototype, not a certified medical device. Every document is project text that has not been clinically reviewed.

## Curated, not everything

The library holds a small, deliberate set of documents, not a collection of everything about space medicine. Each passage restates what Demify already uses elsewhere (the health knowledge base in `docs/research/health-knowledge-base.md` and `src/lib/health/knowledge.ts`, the drill checklists of the crew page, the alarm limits and the radiation page) with the same sources. The ISS medical operations document and the pack names of the inventory restate the team's research notes in `docs/research/iss-health-equipment.md`: only the facts the research marks as confirmed, each with its source URL. A small library that the crew can trust and check beats a large one that nobody has read.

Demify is not connected to any ISS system, device or data link; the library describes how ISS medicine is organised so the crew and trainees can place Demify's advice in that chain.

Not in this version: medicines. There are no drug names, doses, amounts or schedules anywhere in the library, and the inventory leaves the medicine packs out. The `drug-reference` category exists but stays empty until there is a licensed source and a clinical review.

## Layout

| Folder | Category | Contents |
|---|---|---|
| `protocols/` | `protocol` | Drill response checklists (STEMI, VF, hypertensive crisis, general alarm), escalation and signal delay, ground link blackout |
| `reference/` | `reference` | Vital-sign ranges and escalation rules, space radiation, spaceflight physiology, cabin environment and CO₂, ISS medical operations (crew medical officers, flight surgeons, biomedical engineers, private medical conferences, procedures with ground guidance, CPR on the Crew Medical Restraint System, ground-guided ultrasound, what the station cannot do, Crew-11 as published) |
| `inventory/` | `inventory` | `med-kit.json`: the medical-kit inventory, devices and supplies without medicines, grouped by the ISS Crew Health Care System (CHeCS) pack names (Medical Diagnostics Pack, Minor Treatment Pack, Medical Supply Pack, IV Supply Pack, Physician Equipment Pack, Emergency Medical Treatment Pack, Advanced Life Support Pack, Respiratory Support Pack) plus the emergency equipment (Crew Medical Restraint System, AED LIFEPAK 1000). A representative training inventory, not the real ISS kit: the pack names come from public NASA sources (2011/2015), the contents are not confirmed for 2026 and the pouch numbers are training examples |

Two documents are generated during every sync and are not files here:

- `crew-baselines` (category `baseline`): the pre-flight baselines from the crew table (SIMULATED crew profiles), so a question like "What is the commander's resting heart rate baseline?" can be answered with a citation. The sync service also regenerates it as soon as crew rows exist and the document is missing or older than the newest crew record, with the ground link up or down (the crew table is onboard data).
- `med-kit-inventory` (category `inventory`): a readable version of `inventory/*.json`, so the assistant can say where an item is stowed and which pack holds it.

## Front matter

Every Markdown document starts with a front matter block between `---` lines, one `key: value` per line:

```
---
id: alarm-response
title: Alarm response drill checklists
category: protocol
source: Who wrote it and where the facts come from (shown with every citation)
url: https://... (optional: the main source)
license: Project text, MIT; the cited sources keep their own terms
reviewed: Project text, not clinically reviewed
updated: 2026-11-14
---
```

- `id`: unique, lower case letters, digits and `-`. It never changes; the sync uses it to match versions. `crew-baselines` and `med-kit-inventory` are reserved.
- `category`: one of `protocol`, `reference`, `baseline`, `inventory`, `drug-reference`.
- `id`, `title`, `category`, `source` and `license` are required; a file without them stops the sync with an error that names the file.
- `reviewed`: the review status shown to the crew with every passage.
- `updated`: the document date (YYYY-MM-DD).

The inventory file is JSON: `{ "updated": "YYYY-MM-DD", "items": [ { "id", "name", "category", "location", "quantity", "unit", "expiresOn", "notes" } ] }`. The `category` of an item is its pack, its `location` reads "Medical kit, <pack>, pouch <n>" (or "Emergency equipment, ..."), and every `notes` starts with "Representative training inventory; pack names from public NASA sources (2011/2015), contents not confirmed for 2026."

## How the library is stored and checked

Each document is split at its Markdown headings into passages of at most about 1,200 characters (with a small overlap, never in the middle of a word). Every passage keeps its heading path, for example "Alarm response drill checklists › Cardiac arrest (ventricular fibrillation)", which the assistant shows with the citation. The SHA-256 of a document's body is its version: a sync replaces a document when its version changes, so unchanged documents are not embedded again. Every passage stores the SHA-256 of its text, and the app checks it again before the passage is shown; a passage that fails the check is never shown.

## How to add or change a document

1. Write the facts from an existing, named source. Add nothing medical that is not already in the sources above, and no drug name, dose or amount.
2. Create a Markdown file in the matching folder with the front matter above and a new `id`. Use headings (`##`) to split the text into self-contained sections: each section becomes a passage that must make sense on its own.
3. Use the project's wording: "ground link" for the connection to the ground, the data labels REAL, SNAPSHOT, SIMULATED and DEVICE, training framing ("in a real mission this prompts a call to the flight surgeon").
4. Run the tests: `npx vitest run tests/library.test.ts` checks that every document parses, that the categories are valid and that the wording and safety rules hold.
5. Ingest: the sync service picks the change up at its next scheduled sync while the ground link is up, or run `npm run library:ingest` (add `--search "your question"` to see which passages a question finds).

To remove a document, delete its file; the next sync removes it from the onboard library.

## Safety guards of the sync

- A ground folder without any Markdown document (an empty or missing bind mount, a copy that has not started) never empties the onboard library: the sync fails with the reason and changes nothing.
- A sync that would remove more than half of the documents (a half-copied folder) fails the same way. To accept a large removal on purpose, run `npm run library:ingest -- --force`.
- A failed sync is rolled back and recorded with its reason in the sync history; `library-ingest` prints the reason and exits with 1.
- The sync history keeps the last 30 days, and at least the last 100 runs.
