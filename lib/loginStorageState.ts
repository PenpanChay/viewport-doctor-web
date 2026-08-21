import type { Browser } from 'playwright';
import { applyStealth, STEALTH_USER_AGENT } from './browserStealth';
import { captureSessionStorage } from './sessionStorageState';
import type { SessionStorageState, StorageStateData, ViewportSize } from './types';

export interface LoginField {
  // A CSS selector (Playwright locator syntax - "input[name=username]",
  // "#password", text= selectors, etc. all work) identifying one field to
  // fill before submitting the form.
  selector: string;
  value: string;
}

export interface CaptureLoginStorageStateOptions {
  loginUrl: string;
  fields: LoginField[];
  // CSS selector of the element that submits the form (a submit button, or
  // a link/div wired up with a click handler - whatever the target site
  // actually uses).
  submitSelector: string;
  // Regex source matched against the URL after submitting - when the
  // caller knows the app's post-login destination (e.g.
  // "/Homepage(?!.*accessDenied)" for wepos-poscms, or "/demo/protected"
  // for the bundled demo), this makes success/failure unambiguous instead
  // of the best-effort "did the URL change at all" fallback below. Strongly
  // recommended whenever the destination is known.
  successUrlPattern?: string;
  // Milliseconds to wait after the success signal (URL match, or the
  // no-pattern fallback) before capturing storageState - many SPAs change
  // the URL via client-side routing *before* an async "who am I / load my
  // menu" API call finishes writing the session into localStorage (as
  // opposed to the httpOnly cookie, which the server sets synchronously on
  // the redirect response). Capturing storageState the instant the URL
  // matches can therefore win a race against that write and miss it
  // entirely - see waitForLocalStorageKey below for a precise fix, and use
  // this as a cheap blanket safety margin when you don't know the exact key
  // to wait for. Defaults to 1000ms; set to 0 to disable.
  settleMs?: number;
  // When given, poll (up to timeoutMs) for `localStorage.getItem(key)` to
  // become truthy on the post-login page before capturing storageState -
  // the precise fix for the same async-bootstrap race settleMs only
  // guesses at. Prefer this whenever the caller knows which localStorage
  // key the target app's own login flow ultimately writes (e.g. a session
  // key it mirrors alongside its httpOnly cookie).
  waitForLocalStorageKey?: string;
  timeoutMs?: number;
  viewport?: ViewportSize;
}

export interface CaptureLoginStorageStateResult {
  // Present whenever a context existed long enough to ask for it - even on
  // a failed/ambiguous login - so a caller can inspect what the attempt
  // actually left behind (e.g. confirming a session cookie really is
  // absent) rather than getting nothing to work with on failure.
  storageState?: StorageStateData;
  // sessionStorage captured from the same page, at the same moment, as
  // storageState above - see lib/sessionStorageState.ts for why this can't
  // just be folded into storageState itself (Playwright's storageState()
  // has no concept of sessionStorage at all). Pass this to
  // scanViewport.ts/previewFix.ts's own sessionStorageState option so a
  // scan replays it too - a storageState-only replay silently drops
  // whatever a site keeps in sessionStorage, which is easy to misdiagnose
  // as almost anything else (a stale/expired token, a fingerprint/bot
  // check, a missed localStorage key from an async bootstrap race) since
  // the symptom looks identical from the outside: a seemingly-valid
  // session that still bounces back to a login page.
  sessionStorageState?: SessionStorageState;
  finalUrl: string;
  error?: string;
}

/**
 * Logs into `loginUrl` with a real Playwright-driven browser - the SAME
 * stealth-patched Chromium (see lib/browserStealth.ts) that
 * scanViewport.ts and previewFix.ts later reuse the resulting storageState
 * with - and returns both storageState and sessionStorage straight from
 * that session.
 *
 * Why this exists instead of just accepting a storageState exported from
 * the caller's own everyday desktop Chrome (the normal /api/scan flow):
 * beyond the sessionStorage gap above (which affects ANY capture method,
 * not just a different browser), a site that binds its session to a
 * client-computed device/browser fingerprint (see lib/browserStealth.ts's
 * top comment) embeds a hash computed from that specific browser's
 * rendering stack into the session token itself, which a different
 * Chromium build/environment recomputes differently later - logging in and
 * scanning through the identical stealth-patched Chromium keeps that
 * self-consistent instead. (In practice, for the case this module was
 * built against, the sessionStorage gap turned out to be the actual cause
 * - the "fingerprint" claim on that token varied between logins from the
 * same real browser, which a stable device fingerprint would not do, so it
 * was likely just informational rather than actively re-validated. Kept
 * here since a fingerprint-bound session is a real failure mode this
 * module also happens to protect against, not because it was confirmed on
 * that particular target.)
 */
export async function captureLoginStorageState(
  browser: Browser,
  options: CaptureLoginStorageStateOptions
): Promise<CaptureLoginStorageStateResult> {
  const timeoutMs = options.timeoutMs ?? 20000;

  const context = await browser.newContext({
    viewport: options.viewport ?? { width: 1440, height: 900 },
    userAgent: STEALTH_USER_AGENT,
  });
  await applyStealth(context);
  const page = await context.newPage();

  try {
    await page.goto(options.loginUrl, { waitUntil: 'networkidle', timeout: timeoutMs });

    for (const field of options.fields) {
      await page.locator(field.selector).first().fill(field.value, { timeout: timeoutMs });
    }

    if (options.successUrlPattern) {
      const pattern = new RegExp(options.successUrlPattern);
      try {
        await Promise.all([
          page.waitForURL(pattern, { timeout: timeoutMs }),
          page.locator(options.submitSelector).first().click({ timeout: timeoutMs }),
        ]);
      } catch (err) {
        // Still return whatever storageState/sessionStorage exists - a
        // caller debugging a wrong selector or wrong credentials benefits
        // from seeing exactly what (if anything) got left behind, not just
        // an error string.
        const finalUrl = page.url();
        const storageState = await context.storageState();
        const sessionStorageState = await captureSessionStorage(page);
        const message = err instanceof Error ? err.message : String(err);
        return {
          storageState,
          sessionStorageState,
          finalUrl,
          error:
            `Submitted the form, but the URL never matched "${options.successUrlPattern}" within ${timeoutMs}ms ` +
            `(still on ${finalUrl}) - check the selectors and pattern, and that the credentials are correct: ${message}`,
        };
      }
    } else {
      // Best-effort fallback when the caller doesn't know the post-login
      // destination in advance: submit, let the page settle, and treat "the
      // URL never moved" as the one unambiguous failure signal available
      // without more information. A site that logs in without changing the
      // URL at all (rare, but possible with a pure client-side SPA) will
      // false-negative here - pass `successUrlPattern` to avoid that.
      const startUrl = page.url();
      await page.locator(options.submitSelector).first().click({ timeout: timeoutMs });
      await page.waitForLoadState('networkidle', { timeout: timeoutMs }).catch(() => {});
      const finalUrl = page.url();
      if (finalUrl === startUrl) {
        const storageState = await context.storageState();
        const sessionStorageState = await captureSessionStorage(page);
        return {
          storageState,
          sessionStorageState,
          finalUrl,
          error:
            'Submitted the form, but the URL never changed - login may have failed (wrong credentials or selectors), ' +
            'or this site logs in without a URL change. Pass "successUrlPattern" for an unambiguous check instead of this best-effort one.',
        };
      }
    }

    // Only reached once the login is actually confirmed successful (either
    // branch above returns early on failure) - this is where the
    // async-bootstrap race described on settleMs/waitForLocalStorageKey
    // above actually matters, so it's applied once, right before the real
    // capture, rather than in either failure branch (where the login itself
    // already didn't work and waiting longer wouldn't change that).
    if (options.waitForLocalStorageKey) {
      const key = options.waitForLocalStorageKey;
      await page
        .waitForFunction((k) => Boolean(window.localStorage.getItem(k)), key, { timeout: timeoutMs })
        // Don't hard-fail the whole capture if the key never shows up -
        // still return whatever storageState exists, same philosophy as
        // the rest of this function, so a caller can see exactly what (if
        // anything) got written instead of getting nothing to debug with.
        .catch(() => {});
    } else {
      const settleMs = options.settleMs ?? 1000;
      if (settleMs > 0) {
        await page.waitForTimeout(settleMs);
      }
    }

    const finalUrl = page.url();
    const storageState = await context.storageState();
    const sessionStorageState = await captureSessionStorage(page);
    return { storageState, sessionStorageState, finalUrl };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { finalUrl: page.url(), error: message };
  } finally {
    await context.close();
  }
}
