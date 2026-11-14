# Security policy

Demify handles health data. Please report security problems privately.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting on this repository (Security tab, "Report a vulnerability"). Do not open a public issue.

Please include what is affected, how to reproduce it, and the impact you expect. We aim to acknowledge a report within a week.

## Scope

In scope: the web app, the HTTP API under `/api/v1`, the storage layer, the container image and the CI workflows.

## Deployment notes

- The crew endpoints of the HTTP API are off unless `DEMIFY_API_TOKEN` is set. Treat the token like a password and serve the app over HTTPS.
- There are no user accounts yet: anyone who can reach the web app can read and change readings. Run it on a trusted network.
- The rate limit of the API is kept in memory per process.
- Back up the data directory with `node scripts/backup.mjs`.

## Not a certified medical device

Demify is a research prototype and is not placed on the market. Its triage functions (rating vital signs, naming possible conditions, saying when to call a doctor) would be medical device software under EU MDR and the Swiss Medical Devices Ordinance, and are not certified. Its thresholds are demo defaults. Not for clinical use.
