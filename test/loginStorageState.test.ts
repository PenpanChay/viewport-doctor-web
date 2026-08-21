import path from 'path';
import { fileURLToPath } from 'url';
import { chromium, type Browser } from 'playwright';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { captureLoginStorageState } from '../lib/loginStorageState';
import { startNextServer, type NextServerHandle } from '../lib/nextServer';
import {
  DEMO_PASSWORD,
  DEMO_SESSION_COOKIE,
  DEMO_SESSION_STORAGE_KEY,
  DEMO_SESSION_STORAGE_VALUE,
  DEMO_USERNAME,
} from '../lib/demoAuth';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');

// Exercises captureLoginStorageState against the bundled /demo/login wall -
// the same real login form /api/demo-login-storage-state already logs into
// (see that route) - rather than /api/demo-login-storage-state itself,
// since the whole point here is the *generic*, selector-driven path a real
// third-party site (e.g. a UAT app with its own login form) would go
// through via /api/login-storage-state.
describe('captureLoginStorageState (real browser, real Next.js server, no mocking)', () => {
  let nextServer: NextServerHandle;
  let baseUrl: string;
  let browser: Browser;

  beforeAll(async () => {
    nextServer = await startNextServer(PROJECT_ROOT);
    baseUrl = `http://localhost:${nextServer.port}`;
    browser = await chromium.launch();
  }, 30000);

  afterAll(async () => {
    await browser.close();
    await nextServer.close();
  });

  it('logs into /demo/login with correct credentials and returns a storageState carrying the session cookie', async () => {
    const result = await captureLoginStorageState(browser, {
      loginUrl: `${baseUrl}/demo/login`,
      fields: [
        { selector: 'input[name=username]', value: DEMO_USERNAME },
        { selector: 'input[name=password]', value: DEMO_PASSWORD },
      ],
      submitSelector: 'button[type=submit]',
      successUrlPattern: '/demo/protected$',
    });

    expect(result.error).toBeUndefined();
    expect(result.finalUrl).toBe(`${baseUrl}/demo/protected`);
    expect(result.storageState).toBeDefined();
    const cookie = result.storageState!.cookies.find((c) => c.name === DEMO_SESSION_COOKIE);
    expect(cookie).toBeDefined();
    // Real, non-empty ciphertext - not asserting an exact value since the
    // token is AES-256-GCM with a random IV per login (see lib/demoAuth.ts).
    expect(cookie!.value.length).toBeGreaterThan(20);

    // /demo/login also seeds a sessionStorage marker on load (see
    // lib/demoAuth.ts) specifically so this capture - the same one
    // /api/demo-login-storage-state relies on - has something real to
    // return instead of always coming back empty for the bundled demo.
    expect(result.sessionStorageState).toBeDefined();
    const origin = result.sessionStorageState!.find((o) => o.origin === baseUrl);
    expect(origin?.sessionStorage.find((e) => e.name === DEMO_SESSION_STORAGE_KEY)?.value).toBe(
      DEMO_SESSION_STORAGE_VALUE
    );
  }, 20000);

  it('reports an error instead of throwing when the password is wrong and successUrlPattern is given', async () => {
    const result = await captureLoginStorageState(browser, {
      loginUrl: `${baseUrl}/demo/login`,
      fields: [
        { selector: 'input[name=username]', value: DEMO_USERNAME },
        { selector: 'input[name=password]', value: 'not-the-real-password' },
      ],
      submitSelector: 'button[type=submit]',
      successUrlPattern: '/demo/protected$',
      timeoutMs: 5000,
    });

    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/never matched/);
    expect(result.finalUrl).toBe(`${baseUrl}/demo/login?error=1`);
    const cookie = result.storageState?.cookies.find((c) => c.name === DEMO_SESSION_COOKIE);
    expect(cookie).toBeUndefined();
  }, 20000);

  it('without successUrlPattern, cannot tell a failed login apart from a real one when the URL still changes (documents the fallback\'s limit)', async () => {
    // /demo/login's own failure redirect (?error=1) still changes the URL,
    // so the no-pattern fallback (which only catches "the URL never moved
    // at all") reports this as a non-error - exactly the ambiguity
    // successUrlPattern exists to resolve. Asserted here so that limitation
    // is enforced by a real test instead of only documented in a comment.
    const result = await captureLoginStorageState(browser, {
      loginUrl: `${baseUrl}/demo/login`,
      fields: [
        { selector: 'input[name=username]', value: DEMO_USERNAME },
        { selector: 'input[name=password]', value: 'not-the-real-password' },
      ],
      submitSelector: 'button[type=submit]',
      timeoutMs: 5000,
    });

    expect(result.error).toBeUndefined();
    expect(result.finalUrl).toBe(`${baseUrl}/demo/login?error=1`);
    const cookie = result.storageState?.cookies.find((c) => c.name === DEMO_SESSION_COOKIE);
    expect(cookie).toBeUndefined();
  }, 20000);
});
