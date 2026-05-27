// POST /api/logout — clears the auth cookie and points the client back at
// the login page. Whitelisted by the middleware so it works even with an
// expired/invalid session.

import { buildClearCookie } from "../_auth";

export const onRequestPost: PagesFunction = async ({ request }) => {
  const url = new URL(request.url);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "set-cookie": buildClearCookie(url),
      "cache-control": "no-store",
    },
  });
};

export const onRequest: PagesFunction = async ({ request, next }) => {
  if (request.method === "POST") return next();
  return new Response(JSON.stringify({ error: "Method not allowed." }), {
    status: 405,
    headers: {
      "content-type": "application/json; charset=utf-8",
      allow: "POST",
    },
  });
};
