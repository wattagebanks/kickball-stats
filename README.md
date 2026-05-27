# Kickball Stats

A live stat sheet and lineup tool for a recreational kickball team. Track
kicking and fielding by inning, drag players around a dynamic field diagram,
and let the app suggest next week's batting order based on each player's OBP
and SLG.

Built with React + TypeScript + Vite. Deployed to Cloudflare Pages with
automatic production builds from `main` and preview deploys for every feature
branch.

## Features

- **Roster** – Add players with jersey numbers and notes.
- **Live game day** – Multi-inning game runner with a kickball field SVG.
  Drag players from the bench to any position; click a slot to send a player
  back to the bench. Carry over assignments inning-to-inning or auto-fill.
- **Stat sheet** – Per-inning kicking results (`1B`, `2B`, `3B`, `HR`, `BB`,
  `SAC`, `FC`, `ROE`, `OUT`) with RBI and runs, plus standout fielding plays
  (putouts, assists, errors).
- **Lineup** – Editable batting order with a one-click suggestion based on
  each player's season OBP / SLG.
- **Season dashboard** – Sortable stats table plus innings-by-position
  breakdown so you can see who's seeing time where.
- **Cloud sync via Cloudflare D1** – Stats are stored in a shared D1
  database so every device that visits the site sees the same data. A
  local cache keeps the UI snappy and offline-tolerant; edits push to D1
  when a shared write password is configured on the Data tab. Export to
  JSON to back up out-of-band.

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

### Production build

```bash
npm run build
npm run preview
```

## Deployment

This repo deploys to Cloudflare Pages via GitHub Actions:

- Pushes to `main` deploy to the production URL: https://kickball-stats.pages.dev
- Pushes to any other branch deploy to a preview URL of the form
  `https://<branch-name>.kickball-stats.pages.dev`

See [`docs/DEPLOY.md`](./docs/DEPLOY.md) for the one-time setup of the D1
database, the shared write password, and the Cloudflare secrets used by
GitHub Actions.
