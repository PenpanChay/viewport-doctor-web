import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { chromium, type Browser } from 'playwright';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { captureLoginStorageState } from '../lib/loginStorageState';
import { restoreSessionStorage } from '../lib/sessionStorageState';

// End-to-end regression test for the real bug found diagnosing
// wepos-poscms-uat: a storageState captured perfectly correctly (right
// cookies, right localStorage, no timing race) can still bounce a scan back
// to what looks like a login page, because the target site keeps part of
// its "am I logged in" check in sessionStorage - which Playwright's
// storageState() has no concept of at all, so no fix to storageState
// capture timing or completeness can ever close this gap. Only capturing
// sessionStorage separately (lib/sessionStorageState.ts) and replaying it
// into the scan context can.
//
// This mini server models the exact shape of that bug: /login's own page
// (not the post-login page) is what writes the sessionStorage value a real
// browser carries into /protected across the same-tab redirect;
// /protected's client-side script renders different content depending on
// whether it's there.
function startMiniLoginServer(): Promise<{ port: number; close: () => Promise<void> }> {
  const USERNAME = 'demo';
  const PASSWORD = 'demo1234';
  const SESSION_COOKIE = 'session';

  function parseCookies(header: string | undefined): Record<string, string> {
    const out: Record<string, string> = {};
    (header || '').split(';').forEach((pair) => {
      const [k, ...rest] = pair.trim().split('=');
      if (k) out[k] = rest.join('=');
    });
    return out;
  }

  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || '/', `http://${req.headers.host}`);

      if (req.method === 'GET' && url.pathname === '/login') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<!doctype html><html><body>
          <script>window.sessionStorage.setItem('AUTH_CRED', 'demo-cred-value');</script>
          <form method="POST" action="/login">
            <input name="username" />
            <input name="password" type="password" />
            <button type="submit">Log in</button>
          </form>
        </body></html>`);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/login') {
        let bodyRaw = '';
        req.on('data', (chunk) => (bodyRaw += chunk));
        req.on('end', () => {
          const params = new URLSearchParams(bodyRaw);
          if (params.get('username') === USERNAME && params.get('password') === PASSWORD) {
            res.writeHead(303, {
              Location: '/protected',
              'Set-Cookie': `${SESSION_COOKIE}=valid-token; Path=/; HttpOnly`,
            });
          } else {
            res.writeHead(303, { Location: '/login?error=1' });
          }
          res.end();
        });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/protected') {
        const cookies = parseCookies(req.headers.cookie);
        if (cookies[SESSION_COOKIE] !== 'valid-token') {
          res.writeHead(303, { Location: '/login' });
          res.end();
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        // The server-side cookie check above already passed - what renders
        // from here on is decided entirely client-side by a sessionStorage
        // value the server has no way to check itself (it never sees
        // sessionStorage - that's the whole point).
        res.end(`<!doctype html><html><body>
          <div id="marker">loading</div>
          <script>
            document.getElementById('marker').textContent =
              window.sessionStorage.getItem('AUTH_CRED') === 'demo-cred-value' ? 'welcome' : 'not-really-logged-in';
          </script>
        </body></html>`);
        return;
      }

      res.writeHead(404);
      res.end('not found');
    });

    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ port, close: () => new Promise((r) => server.close(() => r())) });
    });
  });
}

describe('sessionStorage capture + restore vs. a session split across cookies, localStorage, AND sessionStorage', () => {
  let server: { port: number; close: () => Promise<void> };
  let baseUrl: string;
  let browser: Browser;

  beforeAll(async () => {
    server = await startMiniLoginServer();
    baseUrl = `http://127.0.0.1:${server.port}`;
    browser = await chromium.launch();
  }, 20000);

  afterAll(async () => {
    await browser.close();
    await server.close();
  });

  it('captureLoginStorageState captures the AUTH_CRED-style sessionStorage value alongside storageState', async () => {
    const result = await captureLoginStorageState(browser, {
      loginUrl: `${baseUrl}/login`,
      fields: [
        { selector: 'input[name=username]', value: 'demo' },
        { selector: 'input[name=password]', value: 'demo1234' },
      ],
      submitSelector: 'button[type=submit]',
      successUrlPattern: '/protected$',
    });

    expect(result.error).toBeUndefined();
    expect(result.sessionStorageState).toBeDefined();
    const origin = result.sessionStorageState!.find((o) => o.origin === baseUrl);
    expect(origin?.sessionStorage.find((e) => e.name === 'AUTH_CRED')?.value).toBe('demo-cred-value');
  }, 20000);

  it('replaying storageState WITHOUT sessionStorage reproduces the exact real-world bug: valid cookie, still looks logged out', async () => {
    const { storageState } = await captureLoginStorageState(browser, {
      loginUrl: `${baseUrl}/login`,
      fields: [
        { selector: 'input[name=username]', value: 'demo' },
        { selector: 'input[name=password]', value: 'demo1234' },
      ],
      submitSelector: 'button[type=submit]',
      successUrlPattern: '/protected$',
    });

    const context = await browser.newContext({ storageState });
    const page = await context.newPage();
    await page.goto(`${baseUrl}/protected`, { waitUntil: 'networkidle' });
    const marker = await page.locator('#marker').textContent();
    await context.close();

    // The cookie alone gets past the server-side check (no redirect to
    // /login happened) but the client-side sessionStorage check still
    // fails - this is what "seemingly valid storageState, still looks like
    // a login page" looks like from the outside.
    expect(marker).toBe('not-really-logged-in');
  }, 20000);

  it('restoreSessionStorage closes the gap: same storageState, now also carrying sessionStorage, renders as logged in', async () => {
    const { storageState, sessionStorageState } = await captureLoginStorageState(browser, {
      loginUrl: `${baseUrl}/login`,
      fields: [
        { selector: 'input[name=username]', value: 'demo' },
        { selector: 'input[name=password]', value: 'demo1234' },
      ],
      submitSelector: 'button[type=submit]',
      successUrlPattern: '/protected$',
    });

    const context = await browser.newContext({ storageState });
    await restoreSessionStorage(context, sessionStorageState);
    const page = await context.newPage();
    await page.goto(`${baseUrl}/protected`, { waitUntil: 'networkidle' });
    const marker = await page.locator('#marker').textContent();
    await context.close();

    expect(marker).toBe('welcome');
  }, 20000);
});
