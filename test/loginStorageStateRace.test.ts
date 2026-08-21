import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { chromium, type Browser } from 'playwright';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { captureLoginStorageState } from '../lib/loginStorageState';

// Regression coverage for a real bug found while diagnosing why a
// storageState captured with a genuine context.storageState() call still
// left wepos-poscms-uat's own client-side session data (its "AUTH_CRED" /
// plain "accessToken" localStorage keys) missing even though the login
// itself clearly succeeded (the URL changed, the httpOnly session cookie
// was set): a SPA can finish its redirect and set its cookie *before* an
// async "load my session / menu" bootstrap call finishes writing the
// client-side session into localStorage. Capturing storageState the
// instant the URL matches can therefore win that race and miss it.
//
// The bundled /demo/login + /demo/protected pages (used by
// loginStorageState.test.ts) don't have an async client-side write like
// this to reproduce the race against, so this test spins up a minimal raw
// http server instead - just enough of a login wall (POST /login sets a
// cookie and redirects; GET /protected serves a page whose own inline
// script writes a localStorage key ~800ms after it loads) to reproduce the
// exact timing this bug depends on.
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
        // Simulates a real SPA's async post-login bootstrap call - this key
        // doesn't exist until ~800ms after this page (and the redirect that
        // landed on it) has already loaded.
        res.end(`<!doctype html><html><body>
          <h1>Welcome</h1>
          <script>
            setTimeout(() => {
              window.localStorage.setItem('bootstrapped', JSON.stringify({ ready: true }));
            }, 800);
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

describe('captureLoginStorageState vs. an async post-login localStorage write (real browser, minimal HTTP server)', () => {
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

  it('misses the async key with settleMs forced to 0 (proves the race is real)', async () => {
    const result = await captureLoginStorageState(browser, {
      loginUrl: `${baseUrl}/login`,
      fields: [
        { selector: 'input[name=username]', value: 'demo' },
        { selector: 'input[name=password]', value: 'demo1234' },
      ],
      submitSelector: 'button[type=submit]',
      successUrlPattern: '/protected$',
      settleMs: 0,
    });

    expect(result.error).toBeUndefined();
    const origin = result.storageState!.origins.find((o) => o.origin === baseUrl);
    expect(origin?.localStorage.find((e) => e.name === 'bootstrapped')).toBeUndefined();
  }, 20000);

  it('catches the async key when waitForLocalStorageKey is set - the precise fix', async () => {
    const result = await captureLoginStorageState(browser, {
      loginUrl: `${baseUrl}/login`,
      fields: [
        { selector: 'input[name=username]', value: 'demo' },
        { selector: 'input[name=password]', value: 'demo1234' },
      ],
      submitSelector: 'button[type=submit]',
      successUrlPattern: '/protected$',
      waitForLocalStorageKey: 'bootstrapped',
    });

    expect(result.error).toBeUndefined();
    const origin = result.storageState!.origins.find((o) => o.origin === baseUrl);
    const bootstrapped = origin?.localStorage.find((e) => e.name === 'bootstrapped');
    expect(bootstrapped).toBeDefined();
    expect(JSON.parse(bootstrapped!.value)).toEqual({ ready: true });
  }, 20000);

  it('catches the async key with the default settleMs (1000ms) blanket safety margin alone', async () => {
    const result = await captureLoginStorageState(browser, {
      loginUrl: `${baseUrl}/login`,
      fields: [
        { selector: 'input[name=username]', value: 'demo' },
        { selector: 'input[name=password]', value: 'demo1234' },
      ],
      submitSelector: 'button[type=submit]',
      successUrlPattern: '/protected$',
      // settleMs omitted - defaults to 1000ms, comfortably past the 800ms delay.
    });

    expect(result.error).toBeUndefined();
    const origin = result.storageState!.origins.find((o) => o.origin === baseUrl);
    expect(origin?.localStorage.find((e) => e.name === 'bootstrapped')).toBeDefined();
  }, 20000);
});
