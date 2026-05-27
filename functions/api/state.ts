// Pages Function backing /api/state.
//
// Authentication is handled upstream by functions/_middleware.ts: every
// request to /api/* requires the kb_auth session cookie set by /login.
// By the time we run, the caller is already authenticated, so both GET
// and PUT can act unconditionally.
//
// GET  /api/state  -> returns the saved AppState JSON (or null on a brand
//                     new database).
// PUT  /api/state  -> stores the AppState JSON. Body MUST be a JSON object.

interface Env {
  DB: D1Database;
}

// Single-row blob table; we always operate on id = 1.
const ROW_ID = 1;

// Hard cap to keep accidentally enormous payloads from being persisted.
const MAX_BODY_BYTES = 1_000_000; // 1 MB is generous for this dataset.

function json(
  body: unknown,
  init: ResponseInit = {},
): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(init.headers ?? {}),
    },
  });
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const row = await env.DB.prepare(
    "SELECT data, updated_at FROM app_state WHERE id = ?",
  )
    .bind(ROW_ID)
    .first<{ data: string; updated_at: string }>();

  if (!row) {
    return json({ state: null, updatedAt: null });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(row.data);
  } catch {
    return json(
      { error: "Stored state is not valid JSON." },
      { status: 500 },
    );
  }

  return json({ state: parsed, updatedAt: row.updated_at });
};

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    return json({ error: "Payload too large." }, { status: 413 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return json({ error: "Body must be valid JSON." }, { status: 400 });
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return json(
      { error: "Body must be a JSON object." },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO app_state (id, data, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
  )
    .bind(ROW_ID, text, now)
    .run();

  return json({ ok: true, updatedAt: now });
};

// Disallow everything else explicitly so wrong verbs get a clear 405.
export const onRequest: PagesFunction<Env> = async ({ request, next }) => {
  if (request.method === "GET" || request.method === "PUT") {
    return next();
  }
  return json({ error: `Method ${request.method} not allowed.` }, {
    status: 405,
    headers: { allow: "GET, PUT" },
  });
};
