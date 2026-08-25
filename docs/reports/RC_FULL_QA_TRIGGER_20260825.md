# UrTruck RC full QA trigger — 2026-08-25

Purpose: run the repository's pull-request release gates against the current `main` application state before employee field testing.

Base application SHA: `81d1ccc64c69c0ee574416b1d61b8aaffa4b5c3f`

This file intentionally changes documentation only. No application, backend, database, map, GPS, auth, chat, or release behavior is modified by this branch.

Required evidence from the PR checks:

- full backend/API regression;
- frontend unit regressions and web production build;
- desktop and mobile Playwright visual audit;
- Design/FSM/UX gate;
- Maestro scenario/contract validation;
- localization and GPS-consent contracts.

The PR must not be merged merely to obtain test results. Any failing P0/P1 check blocks the employee pilot until the root cause is fixed and the affected gate is rerun.