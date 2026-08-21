import crypto from 'node:crypto';

// Shared between /demo/login's form handler, /demo/protected's session
// check, /api/demo-logout, and /api/demo-login-storage-state - a single
// source of truth for the cookie name, hardcoded demo credentials, and
// session-token crypto, so a typo in one file can't silently make the
// others disagree about who's signed in. These credentials are
// intentionally trivial and public: this login wall exists only to give
// the Playwright storageState feature (see lib/resolveStorageState.ts)
// something real to demonstrate scanning behind, not to protect anything.
//
// Named "accessToken" (not some app-specific name) to match the single
// most common real-world convention for a JWT/opaque-token cookie - but
// the name is purely cosmetic: storageState captures and replays whatever
// cookie name+value a site actually uses, so this could be named anything
// without changing how the feature works.
export const DEMO_SESSION_COOKIE = 'accessToken';
export const DEMO_USERNAME = 'demo';
export const DEMO_PASSWORD = 'demo1234';

// A small sessionStorage marker /demo/login seeds on load (see that page)
// and /api/demo-login-storage-state then captures alongside storageState
// (see lib/sessionStorageState.ts) - purely so "🔑 Try a login-protected
// demo" fills in BOTH the storageState and sessionStorageState fields,
// giving a template of the shape a real SSO-style site's session split
// across cookies + sessionStorage would need (see the README's "Sites that
// also need sessionStorage" section). /demo/protected's own redirect above
// still only checks DEMO_SESSION_COOKIE - this marker doesn't gate
// anything, so it can't turn into a second, silently-required login step.
export const DEMO_SESSION_STORAGE_KEY = 'demoSessionMarker';
export const DEMO_SESSION_STORAGE_VALUE = 'demo-session-active';

// The cookie value itself is AES-256-GCM ciphertext, not a plain flag - so
// this demo also proves the storageState feature works against a real
// encrypted-token session (JWT-in-a-cookie, NextAuth, Rails' encrypted
// cookie store, ...), not just a trivial one. Playwright's storageState
// never has to understand what's inside the value: it captures and replays
// the exact ciphertext byte-for-byte, which is why encryption on the
// target site doesn't change anything about how the feature is used.
//
// The key is a fixed, hardcoded demo value - fine here because this cookie
// never protects anything real (see the file comment above), but a real
// app must pull this from a secret manager / env var and never hardcode it.
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const ENCRYPTION_KEY = crypto.createHash('sha256').update('viewport-doctor-demo-secret').digest();
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export function createEncryptedSessionToken(username: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, ENCRYPTION_KEY, iv);
  const payload = JSON.stringify({ sub: username, iat: Date.now() });
  const ciphertext = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64url');
}

// Returns the signed-in username on a valid, untampered token; null on any
// failure (wrong shape, bad auth tag, wrong key) - deliberately one bucket
// for every failure mode, the same way a real encrypted-token check
// shouldn't distinguish "expired" from "forged" in what it tells a caller.
export function verifyEncryptedSessionToken(token: string | undefined): string | null {
  if (!token) return null;
  try {
    const raw = Buffer.from(token, 'base64url');
    const iv = raw.subarray(0, IV_LENGTH);
    const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    const payload = JSON.parse(decrypted) as { sub?: string };
    return payload.sub ?? null;
  } catch {
    return null;
  }
}
