import { NextRequest, NextResponse } from 'next/server';
import { chromium } from 'playwright';
import { DEMO_PASSWORD, DEMO_USERNAME } from '@/lib/demoAuth';

// Playwright needs a real Node.js process (it spawns a browser binary), so
// this route can't run on the Edge runtime.
export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * Logs into the bundled /demo/login page with a real headless browser and
 * returns the resulting Playwright storageState JSON - lets the main page's
 * "Get demo login session" button hand the user a working storageState to
 * paste into /api/scan's "storageState" field without this app, or the
 * user, ever touching a real website's credentials.
 */
export async function POST(request: NextRequest) {
  const origin = new URL(request.url).origin;
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${origin}/demo/login`, { waitUntil: 'networkidle' });
    await page.getByLabel('Username').fill(DEMO_USERNAME);
    await page.getByLabel('Password').fill(DEMO_PASSWORD);
    await Promise.all([
      page.waitForURL(`${origin}/demo/protected`, { timeout: 10000 }),
      page.getByRole('button', { name: 'Log in' }).click(),
    ]);
    const storageState = await context.storageState();
    await context.close();
    return NextResponse.json(storageState);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Could not log in to the demo: ${message}` }, { status: 500 });
  } finally {
    await browser.close();
  }
}
