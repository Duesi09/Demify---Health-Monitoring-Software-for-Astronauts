# Contributing to Demify

Thank you for helping. Demify is health-adjacent software for crews far from Earth, so the bar is: correct, honest about its limits, and easy to check.

## Getting started

```bash
npm ci
```

```bash
npm run dev
```

Node.js 22.15 or newer. Open <http://localhost:3000>. Settings are described in `.env.example`.

## Before you open a pull request

Run the same checks as CI:

```bash
npm run lint && npm run typecheck && npm test && npm run e2e
```

- Add or update tests with every change in behaviour. Logic in `src/domain` and `src/server` gets unit tests next to the code; user journeys get a test in `e2e/`.
- A new indicator, threshold or pattern needs a source in its `reference` text. Values that are not from a published standard are called "project defaults".
- Simulated or illustrative values must say so on screen.
- A change to storage needs a new migration (see `docs/data.md`), never an edit of an old one.
- A change to the HTTP API goes through `src/server/api/definitions.ts`, so the OpenAPI document stays in step. A breaking change needs a new version path.
- Status is never shown by colour alone, every control works with the keyboard, and the accessibility tests stay at zero violations.

## Style

- TypeScript, no semicolons, single quotes, two spaces. `npm run format` applies it to the files you touch.
- Comments say why, not what.
- Text in the interface is plain, calm and imperative, and never presents a possibility as a diagnosis.

## Commits and pull requests

- One topic per pull request, with a description of what changed and how you checked it.
- Fill in the pull request template.

## Code of conduct

Be respectful and assume good intent. Harassment or discrimination of any kind is not tolerated. Maintainers may remove comments, commits or contributors that break this rule. Report problems to the maintainers privately.
