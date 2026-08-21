import { chromium, type Browser } from 'playwright';
import { describe, it, expect, afterEach } from 'vitest';
import { applyStealth, STEALTH_LAUNCH_ARGS, STEALTH_USER_AGENT } from '../lib/browserStealth';

// Regression coverage for the "storageState is valid but a fingerprint/bot
// check on the target site still bounces the scan back to a login page"
// bug - see lib/browserStealth.ts's top comment. Asserts against a real
// headless Chromium (no mocking, same pattern as scanViewport.test.ts)
// rather than just checking that applyStealth() doesn't throw, since the
// whole point is what a page's own JS can observe about the browser.
describe('browserStealth (real browser, no mocking)', () => {
  let browser: Browser | undefined;

  afterEach(async () => {
    await browser?.close();
    browser = undefined;
  });

  it('leaves navigator.webdriver, the User-Agent, and window.chrome as automation tells on an unpatched context', async () => {
    // Baseline: confirms the tells this module patches are real and
    // present by default, so the "after" test below is actually proving
    // something rather than asserting properties that were never a problem.
    browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('about:blank');

    const result = await page.evaluate(() => ({
      webdriver: navigator.webdriver,
      ua: navigator.userAgent,
      hasChrome: Boolean((window as unknown as { chrome?: unknown }).chrome),
      pluginsLength: navigator.plugins.length,
    }));

    expect(result.webdriver).toBe(true);
    expect(result.ua).toMatch(/HeadlessChrome/);
    expect(result.hasChrome).toBe(false);
    expect(result.pluginsLength).toBe(0);
  }, 20000);

  it('patches navigator.webdriver, the User-Agent, window.chrome, and plugins on a stealth-applied context', async () => {
    browser = await chromium.launch({ args: STEALTH_LAUNCH_ARGS });
    const context = await browser.newContext({ userAgent: STEALTH_USER_AGENT });
    await applyStealth(context);
    const page = await context.newPage();
    await page.goto('about:blank');

    const result = await page.evaluate(() => ({
      webdriver: navigator.webdriver,
      ua: navigator.userAgent,
      hasChrome: Boolean((window as unknown as { chrome?: unknown }).chrome),
      pluginsLength: navigator.plugins.length,
      languages: navigator.languages,
    }));

    expect(result.webdriver).toBeUndefined();
    expect(result.ua).toBe(STEALTH_USER_AGENT);
    expect(result.ua).not.toMatch(/HeadlessChrome/);
    expect(result.hasChrome).toBe(true);
    expect(result.pluginsLength).toBeGreaterThan(0);
    expect(result.languages).toEqual(['en-US', 'en']);
  }, 20000);

  it('answers the notifications permission query with Notification.permission instead of the default headless mismatch', async () => {
    browser = await chromium.launch({ args: STEALTH_LAUNCH_ARGS });
    const context = await browser.newContext({ userAgent: STEALTH_USER_AGENT });
    await applyStealth(context);
    const page = await context.newPage();
    await page.goto('about:blank');

    const result = await page.evaluate(async () => {
      const status = await navigator.permissions.query({ name: 'notifications' as PermissionName });
      return { state: status.state, notificationPermission: Notification.permission };
    });

    expect(result.state).toBe(result.notificationPermission);
  }, 20000);
});
