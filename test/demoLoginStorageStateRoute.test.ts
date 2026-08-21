import path from 'path';
import { fileURLToPath } from 'url';
import { NextRequest } from 'next/server';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startNextServer, type NextServerHandle } from '../lib/nextServer';
import { DEMO_SESSION_COOKIE, DEMO_SESSION_STORAGE_KEY, DEMO_SESSION_STORAGE_VALUE } from '../lib/demoAuth';
import { POST } from '../app/api/demo-login-storage-state/route';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');

// Exercises the actual /api/demo-login-storage-state route handler (not
// just the captureLoginStorageState helper it delegates to - see
// loginStorageState.test.ts for that) against a real running Next.js
// server, the same way route.test.ts covers /api/scan. This is the
// contract the "🔑 Try a login-protected demo" button in app/page.tsx
// actually depends on: a { storageState, sessionStorageState } response
// it can drop straight into both fields.
describe('POST /api/demo-login-storage-state (route handler, real browser + real Next.js server)', () => {
  let nextServer: NextServerHandle;
  let baseUrl: string;

  beforeAll(async () => {
    nextServer = await startNextServer(PROJECT_ROOT);
    baseUrl = `http://localhost:${nextServer.port}`;
  }, 30000);

  afterAll(async () => {
    await nextServer.close();
  });

  it('returns both storageState (with the session cookie) and sessionStorageState (with the demo marker)', async () => {
    const response = await POST(new NextRequest(`${baseUrl}/api/demo-login-storage-state`, { method: 'POST' }));
    expect(response.status).toBe(200);

    const data = await response.json();

    const cookie = data.storageState?.cookies?.find((c: { name: string }) => c.name === DEMO_SESSION_COOKIE);
    expect(cookie).toBeDefined();
    expect(cookie.value.length).toBeGreaterThan(20);

    // Same shape /api/login-storage-state returns for a real site - an
    // array of { origin, sessionStorage: [{ name, value }] } objects - now
    // non-empty for the bundled demo too, instead of always being "" in
    // the app's "Session storage state" field (see app/page.tsx).
    expect(Array.isArray(data.sessionStorageState)).toBe(true);
    expect(data.sessionStorageState.length).toBeGreaterThan(0);
    const origin = data.sessionStorageState.find((o: { origin: string }) => o.origin === baseUrl);
    const marker = origin?.sessionStorage.find((e: { name: string }) => e.name === DEMO_SESSION_STORAGE_KEY);
    expect(marker?.value).toBe(DEMO_SESSION_STORAGE_VALUE);
  }, 30000);
});
