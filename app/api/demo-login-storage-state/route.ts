import { NextRequest, NextResponse } from 'next/server';
import { chromium } from 'playwright';
import { DEMO_PASSWORD, DEMO_USERNAME } from '@/lib/demoAuth';
import { captureLoginStorageState } from '@/lib/loginStorageState';

// Playwright needs a real Node.js process (it spawns a browser binary), so
// this route can't run on the Edge runtime.
export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * Logs into the bundled /demo/login page with a real headless browser and
 * returns both the resulting storageState AND sessionStorageState - lets
 * the main page's "Get demo login session" button hand the user a working
 * pair to paste into /api/scan's matching fields without this app, or the
 * user, ever touching a real website's credentials. Same
 * { storageState, sessionStorageState } shape /api/login-storage-state
 * returns for a real site.
 *
 * Delegates to captureLoginStorageState (lib/loginStorageState.ts) - the
 * same function /api/login-storage-state uses - rather than hand-rolling a
 * second login flow here, so this demo exercises the exact same code path
 * a real target site goes through, including the unconditional
 * sessionStorage capture at the end (see lib/sessionStorageState.ts and
 * /demo/login/page.tsx, which seeds a small marker there specifically so
 * that capture has something real to return here instead of always coming
 * back empty).
 */
export async function POST(request: NextRequest) {
  const origin = new URL(request.url).origin;
  const browser = await chromium.launch();
  try {
    const result = await captureLoginStorageState(browser, {
      loginUrl: `${origin}/demo/login`,
      fields: [
        { selector: 'input[name=username]', value: DEMO_USERNAME },
        { selector: 'input[name=password]', value: DEMO_PASSWORD },
      ],
      submitSelector: 'button[type=submit]',
      successUrlPattern: '/demo/protected$',
    });

    if (result.error) {
      return NextResponse.json({ error: `Could not log in to the demo: ${result.error}` }, { status: 500 });
    }

    return NextResponse.json({
      storageState: result.storageState,
      sessionStorageState: result.sessionStorageState,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Could not log in to the demo: ${message}` }, { status: 500 });
  } finally {
    await browser.close();
  }
}
