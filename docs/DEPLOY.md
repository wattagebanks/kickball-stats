# Deploying Kickball Stats

This project deploys to Cloudflare Pages via a GitHub Actions workflow.
The Cloudflare Pages project is named **`kickball-stats`**.

- Production (`main`): https://kickball-stats.pages.dev
- Feature branches: `https://<branch-name>.kickball-stats.pages.dev`
  (Cloudflare also publishes a per-deployment URL on every push.)

Stats are persisted in a shared Cloudflare D1 database and read/written
through a Pages Function at `/api/state`. The entire site (HTML and API)
is gated behind a single shared password stored as the `WRITE_PASSWORD`
secret — visitors enter it once on a login page and the session cookie
keeps them signed in for 30 days. Anyone signed in can read and write.

## D1 setup (one-time)

Run these from your laptop with `wrangler` logged in (`npx wrangler login`):

```bash
# 1. Create the D1 database (prints a database_id you need next).
npm run db:create

# 2. Paste the printed database_id into wrangler.jsonc under
#    d1_databases[0].database_id, replacing REPLACE_WITH_YOUR_D1_DATABASE_ID.

# 3. Apply the schema both locally (for `wrangler pages dev`) and remotely.
npm run db:migrate:local
npm run db:migrate:remote

# 4. Set the shared team password as a Pages secret. Anyone who
#    knows this password can sign in to view and edit stats.
npm run db:set-password
```

If you want preview deploys to use a separate D1 database (recommended
once you have real data), create a second database and add a
`d1_databases` entry scoped to the `preview` environment in
`wrangler.jsonc`. For now both production and preview share the same
database, which is fine for a hobby team.

### Local development against the D1 binding

`npm run dev` (plain Vite) runs the frontend without `/api/state` and
without the auth middleware, so the app falls back to local-only mode
and skips the login screen — useful for UI work.

To run with the Pages Function, the login gate, and a local D1 file
backing it, use:

```bash
echo 'WRITE_PASSWORD="dev-password"' > .dev.vars
npm run db:migrate:local
npm run dev:pages
```

Then open the dev URL and sign in with `dev-password`.

## GitHub Actions

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
