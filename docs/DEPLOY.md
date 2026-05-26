# Deploying Kickball Stats

This project deploys to Cloudflare Pages via a GitHub Actions workflow.
The Cloudflare Pages project is named **`kickball-stats`**.

- Production (`main`): https://kickball-stats.pages.dev
- Feature branches: `https://<branch-name>.kickball-stats.pages.dev`
  (Cloudflare also publishes a per-deployment URL on every push.)

## One-time setup

You need to add two repository secrets in GitHub:

1. **`CLOUDFLARE_API_TOKEN`** — a Cloudflare API token with the
   `Account » Cloudflare Pages » Edit` permission.
   Create one at <https://dash.cloudflare.com/profile/api-tokens>.
2. **`CLOUDFLARE_ACCOUNT_ID`** — your Cloudflare account ID. Find it on
   the right-hand side of any zone overview or by running `wrangler whoami`.

Add them with the `gh` CLI:

```bash
gh secret set CLOUDFLARE_API_TOKEN
gh secret set CLOUDFLARE_ACCOUNT_ID
```

Or in the GitHub web UI: **Settings → Secrets and variables → Actions**.

## How it works

- The workflow runs on **every push** and on **pull requests targeting `main`**.
- For pushes to `main`, Cloudflare treats the deploy as **production**.
- For any other branch, Cloudflare creates a **preview** deployment with its
  own URL based on the branch name.
- On pull requests, the workflow posts a deployment URL comment so you can
  click straight to the preview.

## Local deploys

If you have `wrangler` installed and logged in (`npx wrangler login`), you
can deploy from your laptop:

```bash
npm run build
npx wrangler pages deploy dist --project-name=kickball-stats
```
