// Shared auth helpers for the Pages middleware and login endpoint.
//
// Authentication model:
//   - A single WRITE_PASSWORD secret gates the whole site (read + write).
//     The name is kept from the original "write-only" design so existing
//     deploys don't need to rotate secrets.
//   - On a successful login we set a single cookie whose value is the hex
//     HMAC-SHA256 of a fixed session string, keyed by the password.
//   - On every request the middleware recomputes that HMAC and compares it
//     in constant time. If the password is rotated, all existing sessions
//     invalidate naturally because their HMACs no longer match.
//
// Anything that needs to be the *same* on both the login route and the
// middleware lives here. Files starting with `_` are not routed by Pages.

export const COOKIE_NAME = "kb_auth";
export const SESSION_PAYLOAD = "kickball-stats:v1:session";
// 30 days. The cookie is HttpOnly, so the only way to extend a session is
// to log in again; this strikes a balance between convenience and the
// blast radius of a leaked laptop.
export const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export interface AuthEnv {
  WRITE_PASSWORD?: string;
}

export async function signSessionToken(password: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(SESSION_PAYLOAD),
  );
  return bytesToHex(new Uint8Array(sig));
}

export async function isValidSessionToken(
  token: string | undefined,
  password: string | undefined,
): Promise<boolean> {
  if (!token || !password) return false;
  const expected = await signSessionToken(password);
  return timingSafeEqualHex(token, expected);
}

export function parseCookie(
  header: string | null,
  name: string,
): string | undefined {
  if (!header) return undefined;
  const parts = header.split(";");
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim();
    if (k === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}

export function buildSessionCookie(
  token: string,
  origin: URL,
): string {
  const attrs = [
    `${COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${COOKIE_MAX_AGE_SECONDS}`,
  ];
  // `Secure` is required by browsers when SameSite=None, and is good
  // practice for any prod deploy. Drop it on plain-HTTP localhost dev so
  // `wrangler pages dev` over http://127.0.0.1 still accepts the cookie.
  if (origin.protocol === "https:") attrs.push("Secure");
  return attrs.join("; ");
}

export function buildClearCookie(origin: URL): string {
  const attrs = [
    `${COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (origin.protocol === "https:") attrs.push("Secure");
  return attrs.join("; ");
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

// Constant-time equality for two equal-length hex strings. Length mismatch
// short-circuits to false, which is fine because expected length is fixed
// by the HMAC output size.
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
