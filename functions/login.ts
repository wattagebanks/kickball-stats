// GET  /login -> serves a small login form.
// POST /login -> verifies the password, sets the session cookie, then
//                redirects to `from` (sanitized to a same-site path) or `/`.
//
// The middleware whitelists this route, so it's always reachable. The page
// itself is server-rendered HTML — kept independent of the React bundle so
// it works even if the SPA fails to load.

import {
  type AuthEnv,
  buildSessionCookie,
  signSessionToken,
} from "./_auth";

export const onRequestGet: PagesFunction<AuthEnv> = async ({ request }) => {
  const url = new URL(request.url);
  const from = sanitizeFrom(url.searchParams.get("from"));
  return htmlResponse(renderLoginPage({ from, error: null }), 200);
};

export const onRequestPost: PagesFunction<AuthEnv> = async ({
  request,
  env,
}) => {
  if (!env.WRITE_PASSWORD) {
    return htmlResponse(
      renderLoginPage({
        from: "/",
        error:
          "Server is missing the WRITE_PASSWORD secret. " +
          "Set it with `wrangler pages secret put WRITE_PASSWORD` and redeploy.",
      }),
      503,
    );
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return htmlResponse(
      renderLoginPage({ from: "/", error: "Could not read login form." }),
      400,
    );
  }

  const password = String(form.get("password") ?? "");
  const from = sanitizeFrom(String(form.get("from") ?? ""));

  if (!timingSafeEqual(password, env.WRITE_PASSWORD)) {
    // Re-render the form with an error. 401 so curl/logs make the failure
    // visible, but the browser still renders the body.
    return htmlResponse(
      renderLoginPage({ from, error: "That password is incorrect." }),
      401,
    );
  }

  const url = new URL(request.url);
  const token = await signSessionToken(env.WRITE_PASSWORD);
  return new Response(null, {
    status: 303, // See Other — switches the POST to a GET on the redirect.
    headers: {
      location: from,
      "set-cookie": buildSessionCookie(token, url),
      "cache-control": "no-store",
    },
  });
};

interface LoginViewProps {
  from: string;
  error: string | null;
}

function renderLoginPage({ from, error }: LoginViewProps): string {
  const escFrom = escapeHtml(from);
  const errorBlock = error
    ? `<p class="error" role="alert">${escapeHtml(error)}</p>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Sign in · Kickball Stats</title>
<style>
  :root {
    --bg: #0b1220;
    --bg-elev: #111c33;
    --bg-elev-2: #18233f;
    --line: #233054;
    --line-strong: #344675;
    --text: #e6ecff;
    --text-dim: #9aa7c7;
    --accent: #ffcc4d;
    --accent-strong: #ffb000;
    --danger: #ef5454;
    color-scheme: dark;
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body {
    background:
      radial-gradient(1200px 600px at 20% -10%, #1a2a55 0%, transparent 60%),
      radial-gradient(1000px 500px at 110% 10%, #2a1a4d 0%, transparent 55%),
      var(--bg);
    color: var(--text);
    font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
      "Helvetica Neue", Arial, sans-serif;
    display: grid;
    place-items: center;
    padding: 24px;
  }
  .card {
    width: 100%;
    max-width: 380px;
    background: linear-gradient(180deg, var(--bg-elev), var(--bg-elev-2));
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 24px;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 18px;
  }
  .logo {
    width: 38px;
    height: 38px;
    border-radius: 10px;
    background: radial-gradient(circle at 30% 30%, #ffd97a, var(--accent-strong));
    box-shadow: inset 0 -8px 16px rgba(0, 0, 0, 0.2);
  }
  h1 { margin: 0; font-size: 18px; letter-spacing: 0.2px; }
  small { color: var(--text-dim); }
  label {
    display: block;
    color: var(--text-dim);
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 14px 0 6px;
  }
  input[type="password"] {
    font: inherit;
    color: var(--text);
    background: #0d1730;
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 10px 12px;
    outline: none;
    width: 100%;
  }
  input[type="password"]:focus { border-color: var(--accent); }
  button {
    width: 100%;
    margin-top: 16px;
    font: inherit;
    background: var(--accent);
    color: #1a1300;
    border: 1px solid var(--accent-strong);
    padding: 10px 12px;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 600;
  }
  button:hover { background: var(--accent-strong); }
  .error {
    margin: 14px 0 0;
    padding: 8px 10px;
    border-radius: 8px;
    background: rgba(239, 84, 84, 0.1);
    border: 1px solid rgba(239, 84, 84, 0.45);
    color: #ffd2d2;
    font-size: 13px;
  }
  .hint {
    margin: 14px 0 0;
    color: var(--text-dim);
    font-size: 12px;
  }
</style>
</head>
<body>
  <main class="card">
    <div class="brand">
      <div class="logo" aria-hidden="true"></div>
      <div>
        <h1>Kickball Stats</h1>
        <small>Enter the team password to continue</small>
      </div>
    </div>
    <form method="POST" action="/login" autocomplete="on">
      <input type="hidden" name="from" value="${escFrom}" />
      <label for="password">Password</label>
      <input
        id="password"
        name="password"
        type="password"
        autocomplete="current-password"
        autofocus
        required
      />
      <button type="submit">Sign in</button>
      ${errorBlock}
      <p class="hint">Once you're in, every change is saved to the shared database.</p>
    </form>
  </main>
</body>
</html>`;
}

// Only allow same-site, absolute paths so a malicious `from=` param can't
// turn the login flow into an open redirect.
function sanitizeFrom(raw: string | null): string {
  if (!raw) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  if (raw.startsWith("/login")) return "/";
  return raw;
}

function htmlResponse(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.byteLength !== bb.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < ab.byteLength; i++) {
    diff |= ab[i] ^ bb[i];
  }
  return diff === 0;
}
