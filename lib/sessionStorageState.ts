import type { BrowserContext, Page } from 'playwright';
import type { SessionStorageState } from './types';

/**
 * Captures sessionStorage for the page's CURRENT origin only - unlike
 * localStorage (which Playwright's own context.storageState() already
 * captures across every origin a context has visited), Playwright has no
 * built-in way to export sessionStorage at all: it's simply out of scope
 * for storageState(). See lib/types.ts's SessionStorageState comment for
 * why this module exists, and lib/loginStorageState.ts for where this gets
 * called right after a successful login.
 */
export async function captureSessionStorage(page: Page): Promise<SessionStorageState> {
  const origin = await page.evaluate(() => window.location.origin);
  const entries = await page.evaluate(() =>
    Object.keys(window.sessionStorage).map((name) => ({
      name,
      value: window.sessionStorage.getItem(name) ?? '',
    }))
  );
  return entries.length > 0 ? [{ origin, sessionStorage: entries }] : [];
}

/**
 * Replays previously-captured sessionStorage into every page this context
 * opens, matched by origin - via context.addInitScript(), the same
 * mechanism lib/browserStealth.ts uses to patch every new document before
 * the site's own scripts run, since sessionStorage can't be passed to
 * browser.newContext() the way storageState's cookies/localStorage can.
 * Call once per context, before navigating - see scanViewport.ts.
 */
export async function restoreSessionStorage(context: BrowserContext, data: SessionStorageState | undefined): Promise<void> {
  if (!data || data.length === 0) return;
  await context.addInitScript((entriesByOrigin) => {
    const match = entriesByOrigin.find((entry) => entry.origin === window.location.origin);
    if (!match) return;
    for (const { name, value } of match.sessionStorage) {
      try {
        window.sessionStorage.setItem(name, value);
      } catch {
        // sessionStorage can throw in a locked-down context (e.g. a
        // sandboxed iframe with storage disabled) - restoring what we can
        // is still better than aborting the whole page load over it.
      }
    }
  }, data);
}
