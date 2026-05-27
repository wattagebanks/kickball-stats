// Site-wide auth gate. Runs for every request to the Pages project.
//
// Allowed without a session:
//   - GET/POST /login           — the login form and its submit handler
//   - POST    /api/logout       — clears the cookie
//   - Any non-HTML, non-API path (CSS, JS, images, fonts, source maps).
//     Those files don't expose any team data on their own; the protection
//     is provided by /api/state returning 401 without a valid cookie, and
//     by HTML navigations being redirected to /login.
//
// Everything else requires a valid kb_auth cookie:
//   - HTML navigations    → 302 to /login (with ?from= for return-to)
//   - /api/* JSON requests → 401 JSON
//
// The WRITE_PASSWORD secret is set per-environment via
// `wrangler pages secret put WRITE_PASSWORD`.

import {
  type AuthEnv,
  COOKIE_NAME,
  isValidSessionToken,
  parseCookie,
} from "./_auth";

export const onRequest: PagesFunction<AuthEnv> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const path = url.pathname;

  // Routes that must always be reachable without auth.
  if (path === "/login" || path === "/api/logout") {
    return ctx.next();
  }

  // Missing secret in production is a deploy bug; we'd rather fail closed
  // than silently let everyone in. /login itself handles the secret being
  // missing separately so the operator can still see the error UI.
  if (!ctx.env.WRITE_PASSWORD) {
    return new Response(
      "Server is missing WRITE_PASSWORD secret. " +
        "Run `wrangler pages secret put WRITE_PASSWORD` and redeploy.",
      { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }

  const token = parseCookie(ctx.request.headers.get("cookie"), COOKIE_NAME);
  const ok = await isValidSessionToken(token, ctx.env.WRITE_PASSWORD);

  if (ok) {
    return ctx.next();
  }

  const accept = ctx.request.headers.get("accept") ?? "";
  const isApi = path.startsWith("/api/");

  if (isApi) {
    return new Response(
      JSON.stringify({ error: "Not authenticated." }),
      {
        status: 401,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
        },
      },
    );
  }

  // Browser navigations carry `Accept: text/html,...`. For those, bounce to
  // the login page and remember where the user was headed.
  if (accept.includes("text/html")) {
    const from = encodeURIComponent(path + url.search);
    return Response.redirect(`${url.origin}/login?from=${from}`, 302);
  }

  // Subresource (script, stylesheet, image, etc.) — let it through.
  // These are non-sensitive build artifacts and the SPA will surface the
  // 401 from /api/state by redirecting to /login on its own.
  return ctx.next();
};
